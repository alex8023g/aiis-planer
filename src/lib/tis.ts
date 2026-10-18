import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import { EquipmentState } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { getMeterDictionaryChecker } from '@/lib/siDictionaryMatch';
import {
  cell,
  emptyRow,
  spans,
  text,
  voltageClassLabels,
  yesNo,
} from '@/lib/survey-cells';
import type { SurveyTi } from '@/lib/survey-ti';
import { Channel, ModemKind } from '@/lib/types';

/// Все поля ТИ, какие есть в схеме, — по колонке на поле. Пустых колонок тут
/// хватает: опрос заполнил не всё, а в выгрузке трёх колонок («место
/// установки», «г/в», «тех. решение») не было вовсе — под них в схеме и полей
/// нет. Колонка на месте, даже когда у всех ТИ в ней пусто: так видно, что
/// именно база умеет хранить и чего в ней пока не хватает.
export const tiColumns: SurveyColumn[] = [
  { title: '№ТИ на ОС', minWidth: 80 },
  { title: 'наименование ТИ', minWidth: 240 },
  { title: 'Uном, кВ', minWidth: 90 },

  { title: 'тип ПУ', minWidth: 160 },
  { title: '№ сч.', minWidth: 120 },
  { title: 'соотв. требованиям', minWidth: 140 },

  { title: 'тип ПУ (замена)', minWidth: 160 },
  { title: '№ сч. (замена)', minWidth: 120 },
  { title: 'соотв. требованиям (замена)', minWidth: 140 },

  { title: 'фаза', minWidth: 70 },
  { title: 'ТТ тип', minWidth: 160 },
  { title: 'ТТ №', minWidth: 140 },
  { title: 'Ктт', minWidth: 80 },

  { title: 'фаза', minWidth: 70 },
  { title: 'ТН тип', minWidth: 160 },
  { title: 'ТН №', minWidth: 120 },
  { title: 'Ктн', minWidth: 100 },

  { title: 'УСПД тип', minWidth: 140 },
  { title: 'УСПД №', minWidth: 120 },

  { title: 'модем вид', minWidth: 120 },
  { title: 'модем тип', minWidth: 140 },
  { title: 'модем №', minWidth: 120 },

  { title: 'SIM №', minWidth: 140 },
  { title: 'SIM IP', minWidth: 120 },
  { title: 'SIM оператор', minWidth: 140 },

  { title: 'адрес счётчика', minWidth: 140 },
  { title: 'порт', minWidth: 100 },
  { title: 'канал', minWidth: 100 },

  { title: 'опрашивается / не опрашивается', minWidth: 160 },
  { title: 'примечания', minWidth: 160 },
];

/// Пустая строка во всю ширину таблицы — см. emptyRow в src/lib/survey-cells.ts.
export function emptyTiRow(columns: SurveyColumn[] = tiColumns): SurveyCell[] {
  return emptyRow(columns);
}

/// Коэффициент трансформации — один на все три фазы, и стоит он рядом с
/// пофазными ячейками в три строки. По центру видно, что он относится ко всем
/// фазам сразу; прижатый к верху, он читался бы как значение фазы A.
function ratioCell(value: string | null | undefined): SurveyCell {
  return { v: value ?? '', align: 'middle' };
}

const PHASES = ['A', 'B', 'C'] as const;

/// Подписи фаз отдельной колонкой — строки в ней встают ровно напротив строк в
/// «ТТ тип» и «ТТ №», и подпись не приходится повторять в каждой из них.
/// Колонка пустая, когда ТТ на ТИ нет: подписи без значений подсказывали бы,
/// что фазы где-то есть.
function phaseLabels(present: boolean): SurveyCell {
  return { v: present ? PHASES.join('\n') : '' };
}

/// Пофазное поле (ТТ стоят по одному на фазу) — одной ячейкой в три строки, по
/// строке на фазу, без подписи: её держит соседняя колонка «фаза».
///
/// Строки всегда три, даже когда фаза пустая: фаз ровно три, и прочерк прямо
/// говорит, что фазы нет (при двух ТТ пустует B), а не что колонку забыли
/// заполнить. Если самого ТТ на ТИ нет, ячейка пустая — три прочерка означали
/// бы, что ТТ есть, но про него ничего не известно.
function phaseCell(
  values: [string | null, string | null, string | null] | null,
): SurveyCell {
  if (values === null) return { v: '' };

  return { v: PHASES.map((_, index) => values[index] ?? '—').join('\n') };
}

const modemKindLabels: Record<ModemKind, string> = {
  [ModemKind.BuiltIn]: 'встроенный',
  [ModemKind.External]: 'внешний',
};

const channelLabels: Record<Channel, string> = {
  [Channel.Gprs]: 'GPRS',
  [Channel.Csd]: 'CSD',
};

/// Точки измерения проекта для таблицы — в том порядке, в котором их записал
/// составитель.
///
/// Доступ здесь не проверяется: проект уже прочитан вызывающим (см. getProject
/// в src/lib/projects.ts), а ТИ видны всем, кому виден сам проект.
export async function getTiRows(projectId: string): Promise<SurveyCell[][]> {
  const tis = await prisma.ti.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      number: true,
      name: true,
      uNom: true,
      groupId: true,
      meters: {
        select: { state: true, type: true, number: true, isCompliant: true },
      },
      tt: {
        select: {
          typeA: true,
          typeB: true,
          typeC: true,
          numberA: true,
          numberB: true,
          numberC: true,
          ratio: true,
        },
      },
      tn: {
        select: {
          typeA: true,
          typeB: true,
          typeC: true,
          numberA: true,
          numberB: true,
          numberC: true,
          ratio: true,
        },
      },
      connection: {
        select: { meterAddress: true, port: true, channel: true },
      },
      group: {
        select: {
          uspd: { select: { type: true, number: true } },
          modem: {
            select: {
              kind: true,
              type: true,
              number: true,
              simCard: { select: { number: true, ip: true, provider: true } },
            },
          },
          sidePolling: { select: { description: true } },
          notes: { select: { description: true } },
        },
      },
    },
  });

  /// Всё общее висит на группе, поэтому и объединяем по ней. Ключ — группа,
  /// только если у неё есть это общее: иначе пустые ячейки ТИ одной группы
  /// слились бы в одну, будто там общее значение.
  const groupKeys = (
    has: (group: NonNullable<(typeof tis)[number]['group']>) => boolean,
  ) => tis.map((ti) => (ti.group && has(ti.group) ? ti.groupId : null));
  const uspdSpans = spans(groupKeys((group) => group.uspd !== null));
  /// Модем и его SIM-карта делятся между теми же ТИ: карта висит на модеме,
  /// поэтому и объединяются они по одному ключу.
  const modemSpans = spans(groupKeys((group) => group.modem !== null));
  const pollingSpans = spans(groupKeys((group) => group.sidePolling !== null));
  const notesSpans = spans(groupKeys((group) => group.notes !== null));

  return tis.map((ti, index) => {
    const current = ti.meters.find(
      (meter) => meter.state === EquipmentState.current,
    );
    const next = ti.meters.find(
      (meter) => meter.state === EquipmentState.proposed,
    );
    /// ТТ и ТН у Ti теперь списки, но @unique на Tt.tiId и Tn.tiId держит не
    /// больше одной строки на ТИ — берём её, и таблица показывает ровно то же,
    /// что и раньше. Когда @unique снимут ради истории (dateInstalled /
    /// dateRemoved), здесь понадобится правило выбора: скорее всего, строка,
    /// у которой dateRemoved пуст, — то, что стоит на ТИ сейчас.
    const tt = ti.tt[0] ?? null;
    const tn = ti.tn[0] ?? null;
    const uspdSpan = uspdSpans[index];
    const modemSpan = modemSpans[index];
    const uspd = ti.group?.uspd;
    const modem = ti.group?.modem;
    const sim = modem?.simCard;

    return [
      text(ti.number),
      text(ti.name),
      text(ti.uNom ? voltageClassLabels[ti.uNom] : ''),

      text(current?.type),
      text(current?.number),
      yesNo(current?.isCompliant),

      text(next?.type),
      text(next?.number),
      yesNo(next?.isCompliant),

      phaseLabels(tt !== null),
      phaseCell(tt ? [tt.typeA, tt.typeB, tt.typeC] : null),
      phaseCell(tt ? [tt.numberA, tt.numberB, tt.numberC] : null),
      ratioCell(tt?.ratio),

      phaseLabels(tn !== null),
      phaseCell(tn ? [tn.typeA, tn.typeB, tn.typeC] : null),
      phaseCell(tn ? [tn.numberA, tn.numberB, tn.numberC] : null),
      ratioCell(tn?.ratio),

      cell(uspd?.type ?? '', uspdSpan),
      cell(uspd?.number ?? '', uspdSpan),

      cell(modem?.kind ? modemKindLabels[modem.kind] : '', modemSpan),
      cell(modem?.type ?? '', modemSpan),
      cell(modem?.number ?? '', modemSpan),

      cell(sim?.number ?? '', modemSpan),
      cell(sim?.ip ?? '', modemSpan),
      cell(sim?.provider ?? '', modemSpan),

      text(ti.connection?.meterAddress),
      text(ti.connection?.port),
      text(ti.connection ? channelLabels[ti.connection.channel] : ''),

      cell(ti.group?.sidePolling?.description ?? '', pollingSpans[index]),
      cell(ti.group?.notes?.description ?? '', notesSpans[index]),
    ];
  });
}

/// Как достучаться до счётчика ТИ — то, что нужно MeterReader для опроса.
export type MeterReaderTi = {
  id: string;
  name: string;
  /// IP SIM-карты модема группы: модем общий на группу, поэтому и IP у ТИ
  /// одной группы совпадает.
  ip: string | null;
  port: string | null;
  /// Связной (сетевой) адрес счётчика.
  connectAddress: string | null;
};

/// ТИ проекта для MeterReader — в том порядке, в котором их записал
/// составитель. Доступ не проверяется, как и в getTiRows.
export async function getMeterReaderTis(
  projectId: string,
): Promise<MeterReaderTi[]> {
  const tis = await prisma.ti.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      connection: { select: { meterAddress: true, port: true } },
      group: {
        select: {
          modem: { select: { simCard: { select: { ip: true } } } },
        },
      },
    },
  });

  return tis.map((ti) => ({
    id: ti.id,
    name: ti.name,
    ip: ti.group?.modem?.simCard?.ip ?? null,
    port: ti.connection?.port ?? null,
    connectAddress: ti.connection?.meterAddress ?? null,
  }));
}

/// ТИ проекта для таблицы опроса (aiis4) — в том порядке, в котором их
/// записал составитель. Значения как в базе: ячейки из них собирает клиент
/// (surveyTiCells в src/lib/survey-ti.ts). Доступ не проверяется, как и в
/// getTiRows.
export async function getSurveyTis(projectId: string): Promise<SurveyTi[]> {
  const checkMeter = await getMeterDictionaryChecker();
  const tis = await prisma.ti.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      uNom: true,
      wiring: true,
      existingPolling: true,
      freeRs485: true,
      connection: { select: { meterAddress: true, port: true } },
      meters: {
        where: {
          state: { in: [EquipmentState.current, EquipmentState.proposed] },
        },
        select: { state: true, type: true, isCompliant: true },
      },
      group: {
        select: {
          id: true,
          modem: {
            select: {
              kind: true,
              type: true,
              simCard: { select: { ip: true } },
            },
          },
          technicalSolution: { select: { description: true } },
        },
      },
    },
  });

  return tis.map(({ meters, group, connection, ...ti }) => {
    const current = meters.find(
      (meter) => meter.state === EquipmentState.current,
    );
    const proposed = meters.find(
      (meter) => meter.state === EquipmentState.proposed,
    );
    const verdict = current?.type ? checkMeter(current.type) : null;

    return {
      ...ti,
      meterAddress: connection?.meterAddress ?? null,
      port: connection?.port ?? null,
      currentMeter: current
        ? {
            type: current.type,
            isCompliant: current.isCompliant,
            inAtsDictionary: verdict ? verdict.ok : null,
            atsDictionaryReason: verdict && !verdict.ok ? verdict.reason : null,
            atsWiring: verdict?.wiring ?? null,
          }
        : null,
      proposedMeter: proposed ? { type: proposed.type } : null,
      group: group
        ? {
            id: group.id,
            technicalSolution: group.technicalSolution?.description ?? null,
            modem: group.modem
              ? {
                  kind: group.modem.kind,
                  type: group.modem.type,
                  ip: group.modem.simCard?.ip ?? null,
                }
              : null,
          }
        : null,
    };
  });
}
