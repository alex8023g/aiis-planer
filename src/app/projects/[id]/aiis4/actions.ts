'use server';

import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';

import { refresh } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getProject, requireProjectEditor } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

import {
  parseConnection,
  readMeterNumber,
  type MeterNumberReading,
} from './meter_reader';

/// Больше разом не добавляем: опечатка в поле («100» вместо «10») иначе
/// вывалила бы в таблицу сотню пустых строк.
const MAX_ADD = 50;

/// Номер ТИ — строка («3а» тоже номер), поэтому следующий считаем по ведущим
/// цифрам: после «3а» и «7» идёт «8». ТИ без цифр в номере не считаются.
function nextNumber(numbers: string[]): number {
  const values = numbers
    .map((number) => Number.parseInt(number, 10))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) + 1 : 1;
}

/// Модем — пустая заготовка: ни вида, ни типа, ни номера, и SIM-карта (если
/// есть) тоже пустая.
function isBlankModem(modem: {
  kind: unknown;
  type: string | null;
  number: string | null;
  simCard: {
    number: string | null;
    ip: string | null;
    provider: string | null;
  } | null;
}): boolean {
  const sim = modem.simCard;

  return (
    modem.kind === null &&
    modem.type === null &&
    modem.number === null &&
    (sim === null ||
      (sim.number === null && sim.ip === null && sim.provider === null))
  );
}

/// Добавить count пустых ТИ в конец таблицы опроса. Номера идут подряд за
/// последним, наименование пустое — его заполняют уже в таблице. Каждая ТИ
/// получает свою группу с пустыми модемом и SIM-картой.
export async function addTis(
  projectId: string,
  count: number,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (!Number.isInteger(count) || count < 1 || count > MAX_ADD) {
    return { ok: false, error: `Можно добавить от 1 до ${MAX_ADD} ТИ` };
  }

  const existing = await prisma.ti.findMany({
    where: { projectId },
    select: { number: true, position: true },
  });
  const firstNumber = nextNumber(existing.map((ti) => ti.number));
  /// Порядок сквозной по проекту: новые встают после последней ТИ.
  const firstPosition =
    existing.reduce((max, ti) => Math.max(max, ti.position), -1) + 1;

  /// Каждая ТИ — со своей группой, а у группы пустые модем и SIM-карта: IP
  /// можно вписать сразу. createMany вложенных записей не умеет — поэтому по
  /// одной, но одной транзакцией.
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < count; index++) {
      await tx.ti.create({
        data: {
          /// Связью, а не projectId: вместе с вложенным созданием группы
          /// Prisma принимает только связи.
          project: { connect: { id: projectId } },
          number: String(firstNumber + index),
          name: '',
          position: firstPosition + index,
          group: {
            create: {
              project: { connect: { id: projectId } },
              modem: { create: { simCard: { create: {} } } },
            },
          },
        },
      });
    }
  });

  /// Страница динамическая (force-dynamic), кэша под ней нет — достаточно
  /// перерисовать её, чтобы новые ТИ появились в таблице.
  refresh();

  return { ok: true };
}

/// Объединить ТИ в одну группу — как объединение ячеек «тех. решения» в
/// Excel: остаётся значение верхней. Группой становится группа первой ТИ (по
/// порядку в таблице), а нет её — заводится новая. Общее (решение, модем,
/// УСПД, текст опроса, примечание) у неё своё; чего у неё нет, берётся у
/// остальных групп сверху вниз. Группы, от которых не осталось ни одной ТИ,
/// удаляются вместе со всем, что у них не забрали.
export async function mergeTiGroups(
  projectId: string,
  tiIds: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const ids = [...new Set(tiIds)];

  if (ids.length < 2) {
    return { ok: false, error: 'Выделите хотя бы две ячейки' };
  }

  /// Одной транзакцией: иначе при сбое ТИ остались бы разбросаны между
  /// старыми и новой группой, а общее — висеть на пустых группах.
  const error = await prisma.$transaction(async (tx) => {
    const tis = await tx.ti.findMany({
      where: { id: { in: ids }, projectId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { groupId: true },
    });

    /// Чужие или удалённые ТИ: страница могла устареть.
    if (tis.length !== ids.length) {
      return 'Часть ТИ не найдена — обновите страницу';
    }

    const targetId =
      tis[0].groupId ??
      (
        await tx.tiGroup.create({
          data: { projectId, modem: { create: { simCard: { create: {} } } } },
          select: { id: true },
        })
      ).id;
    const sourceIds = [
      ...new Set(
        tis
          .map((ti) => ti.groupId)
          .filter((id): id is string => id !== null && id !== targetId),
      ),
    ];

    await tx.ti.updateMany({
      where: { id: { in: ids } },
      data: { groupId: targetId },
    });

    if (sourceIds.length === 0) return null;

    const shared = {
      uspd: { select: { id: true } },
      modem: {
        select: {
          id: true,
          kind: true,
          type: true,
          number: true,
          simCard: { select: { number: true, ip: true, provider: true } },
        },
      },
      technicalSolution: { select: { id: true } },
      sidePolling: { select: { id: true } },
      notes: { select: { id: true } },
    } as const;
    const target = await tx.tiGroup.findUniqueOrThrow({
      where: { id: targetId },
      select: shared,
    });
    /// Забираем общее только у групп, которые опустели: у остальных есть ещё
    /// ТИ вне выделения, и общее им самим нужно.
    const emptied = await tx.tiGroup.findMany({
      where: { id: { in: sourceIds }, projectId, tis: { none: {} } },
      select: { id: true, ...shared },
    });
    /// Порядок групп — как в таблице, сверху вниз.
    emptied.sort((a, b) => sourceIds.indexOf(a.id) - sourceIds.indexOf(b.id));

    const adopt = {
      uspd: (id: string) =>
        tx.uspd.update({ where: { id }, data: { groupId: targetId } }),
      modem: (id: string) =>
        tx.modem.update({ where: { id }, data: { groupId: targetId } }),
      technicalSolution: (id: string) =>
        tx.technicalSolution.update({
          where: { id },
          data: { groupId: targetId },
        }),
      sidePolling: (id: string) =>
        tx.sidePolling.update({ where: { id }, data: { groupId: targetId } }),
      notes: (id: string) =>
        tx.tisNotes.update({ where: { id }, data: { groupId: targetId } }),
    };

    for (const kind of Object.keys(adopt) as (keyof typeof adopt)[]) {
      /// Пустой модем — заготовка, заведённая с группой: он уступает
      /// заполненному модему опустевшей группы, иначе тот ушёл бы вместе с
      /// ней. Модем у группы один (@unique groupId), поэтому пустой убираем.
      if (kind === 'modem' && target.modem && isBlankModem(target.modem)) {
        const donor = emptied.find(
          (group) => group.modem && !isBlankModem(group.modem),
        )?.modem;

        if (donor) {
          await tx.modem.delete({ where: { id: target.modem.id } });
          await adopt.modem(donor.id);
        }

        continue;
      }

      if (target[kind]) continue;

      const donor = emptied.find((group) => group[kind] !== null)?.[kind];

      if (donor) await adopt[kind](donor.id);
    }

    /// Что осталось на опустевших группах, уходит с ними каскадом.
    await tx.tiGroup.deleteMany({
      where: { id: { in: emptied.map((group) => group.id) } },
    });

    return null;
  });

  if (error) return { ok: false, error };

  refresh();

  return { ok: true };
}

/// Разъединить объединённую ячейку «тех. решения» — как в Excel: значение
/// остаётся в верхней. Верхняя ТИ (по порядку в таблице) остаётся в группе
/// со всем общим — решением, модемом, УСПД, текстом опроса, примечанием, —
/// остальные из группы выходят, и каждая получает свою новую группу с пустым
/// модемом и SIM-картой: как и при создании группы, IP есть куда вписать
/// сразу. Ничего не удаляется.
export async function splitTiGroup(
  projectId: string,
  tiIds: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const ids = [...new Set(tiIds)];

  if (ids.length < 2) {
    return { ok: false, error: 'Выделите объединённую ячейку' };
  }

  const tis = await prisma.ti.findMany({
    where: { id: { in: ids }, projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, groupId: true },
  });

  /// Чужие или удалённые ТИ: страница могла устареть.
  if (tis.length !== ids.length) {
    return { ok: false, error: 'Часть ТИ не найдена — обновите страницу' };
  }

  /// Разъединяем ровно одну ячейку: все ТИ должны быть из одной группы. Иначе
  /// таблица показывала устаревшее — и непонятно, какую группу трогать.
  const groupId = tis[0].groupId;

  if (groupId === null || tis.some((ti) => ti.groupId !== groupId)) {
    return {
      ok: false,
      error: 'Ячейка уже не объединена — обновите страницу',
    };
  }

  /// Одной транзакцией: при сбое часть ТИ осталась бы в старой группе, а
  /// часть — в новых.
  await prisma.$transaction(async (tx) => {
    for (const ti of tis.slice(1)) {
      await tx.tiGroup.create({
        data: {
          projectId,
          tis: { connect: { id: ti.id } },
          modem: { create: { simCard: { create: {} } } },
        },
      });
    }
  });

  refresh();

  return { ok: true };
}

/// Удалить ТИ со всем её оборудованием (счётчики, ТТ, ТН, подключение уходят
/// каскадом). Группа, от которой не осталось ни одной ТИ, удаляется вместе со
/// всем общим: иначе она висела бы пустой до удаления проекта.
export async function deleteTis(
  projectId: string,
  tiIds: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const ids = [...new Set(tiIds)];

  if (ids.length === 0) return { ok: true };

  /// Одной транзакцией: удаляются либо все выделенные ТИ, либо ни одной, и
  /// при сбое группа не останется без ТИ.
  const error = await prisma.$transaction(async (tx) => {
    const tis = await tx.ti.findMany({
      where: { id: { in: ids }, projectId },
      select: { groupId: true },
    });

    /// Чужая или уже удалённая ТИ: страница могла устареть.
    if (tis.length !== ids.length) return 'ТИ не найдена — обновите страницу';

    await tx.ti.deleteMany({ where: { id: { in: ids } } });

    /// Группы, от которых не осталось ни одной ТИ.
    const groupIds = [...new Set(tis.flatMap(({ groupId }) => groupId ?? []))];

    if (groupIds.length > 0) {
      await tx.tiGroup.deleteMany({
        where: { id: { in: groupIds }, projectId, tis: { none: {} } },
      });
    }

    return null;
  });

  if (error) return { ok: false, error };

  refresh();

  return { ok: true };
}

const execFileAsync = promisify(execFile);

/// Сколько ждать ответа на ping, секунд.
const PING_TIMEOUT = 2;

export type PingResult = { ok: true } | { ok: false; error: string };

/// Пингнуть IP модема ТИ — отвечает ли он вообще, до опроса счётчика. IP
/// берём из базы по id, как и connectMeter, и пускаем в ping только адрес:
/// в поле IP можно записать что угодно, и строка вида «-f» стала бы ключом.
export async function pingTi(
  projectId: string,
  tiId: string,
): Promise<PingResult> {
  const user = await requireUser();

  if (!(await getProject(projectId, user))) {
    return { ok: false, error: 'Проект не найден' };
  }

  const ti = await prisma.ti.findFirst({
    where: { id: tiId, projectId },
    select: {
      group: {
        select: {
          modem: { select: { simCard: { select: { ip: true } } } },
        },
      },
    },
  });

  if (!ti) return { ok: false, error: 'ТИ не найдена — обновите страницу' };

  const ip = ti.group?.modem?.simCard?.ip?.trim();

  if (!ip) return { ok: false, error: 'У ТИ не указан IP' };
  if (!isIP(ip)) return { ok: false, error: `«${ip}» — не IP-адрес` };

  /// Таймаут ответа у ping на macOS — в миллисекундах, на Linux — в секундах.
  const wait =
    process.platform === 'darwin'
      ? String(PING_TIMEOUT * 1000)
      : String(PING_TIMEOUT);

  try {
    await execFileAsync('ping', ['-c', '1', '-W', wait, ip], {
      timeout: (PING_TIMEOUT + 3) * 1000,
    });

    return { ok: true };
  } catch {
    return { ok: false, error: `${ip} не отвечает на ping` };
  }
}

/// Порт шлюза счётчика, если у ТИ свой не записан.
const DEFAULT_METER_PORT = '6001';

export type ConnectResult =
  | { ok: true; reading: MeterNumberReading; host: string; port: number }
  | { ok: false; error: string };

/// Опросить счётчик ТИ — то же, что meter_reader --meter-number: заводской
/// номер и дата выпуска. IP — SIM-карты модема группы, адрес — связной адрес
/// счётчика, порт — свой у ТИ или 6001. Значения берём из базы по id, а не из
/// браузера: иначе страница могла бы заставить сервер стучаться куда угодно.
/// Опрос ничего не меняет, поэтому хватает права видеть проект.
export async function connectMeter(
  projectId: string,
  tiId: string,
): Promise<ConnectResult> {
  const user = await requireUser();

  if (!(await getProject(projectId, user))) {
    return { ok: false, error: 'Проект не найден' };
  }

  const ti = await prisma.ti.findFirst({
    where: { id: tiId, projectId },
    select: {
      connection: { select: { meterAddress: true, port: true } },
      group: {
        select: {
          modem: { select: { simCard: { select: { ip: true } } } },
        },
      },
    },
  });

  if (!ti) return { ok: false, error: 'ТИ не найдена — обновите страницу' };

  const ip = ti.group?.modem?.simCard?.ip;
  const address = ti.connection?.meterAddress;

  if (!ip) return { ok: false, error: 'У ТИ не указан IP' };
  if (!address) return { ok: false, error: 'У ТИ не указан адрес счётчика' };

  try {
    const config = parseConnection({
      ip,
      port: ti.connection?.port || DEFAULT_METER_PORT,
      address,
    });
    const reading = await readMeterNumber(config);

    return { ok: true, reading, host: config.host, port: config.port };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
