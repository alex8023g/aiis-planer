import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import { EquipmentState } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { Channel, ModemKind, VoltageClass } from '@/lib/types';

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

/// Пустая строка во всю ширину таблицы — для проекта, у которого ТИ ещё нет.
/// Одни заголовки над пустотой читаются как сломанная страница, а строка
/// показывает, что таблица в порядке и ждёт данных.
///
/// В ячейках неразрывный пробел, а не пустая строка: у пустой ячейки нет
/// строки текста, и высотой она была бы в одни поля — такую строку под
/// заголовками попросту не разглядеть.
export function emptyTiRow(): SurveyCell[] {
  return tiColumns.map(() => ({ v: '\u00a0', bordered: true }));
}

/// Соседние ТИ, которые смотрят на одну общую строку — УСПД, модем, текст
/// опроса, примечание, — показываем одной объединённой ячейкой. Для каждой
/// строки возвращает высоту объединения, а для накрытых — null.
/// Объединяются только подряд идущие: разорванную группу таблица показать не
/// может, и такие ТИ получат каждая свою ячейку с тем же текстом.
function spans(keys: (string | null)[]): (number | null)[] {
  const result: (number | null)[] = keys.map(() => 1);
  let index = 0;

  while (index < keys.length) {
    const key = keys[index];

    if (key == null) {
      index += 1;
      continue;
    }

    let end = index + 1;

    while (end < keys.length && keys[end] === key) end += 1;

    result[index] = end - index;

    for (let covered = index + 1; covered < end; covered += 1) {
      result[covered] = null;
    }

    index = end;
  }

  return result;
}

/// Ячейка под объединение: накрытая — null, владелец — с rowSpan. rowSpan в 1
/// строку не ставим: в разметке он ничего не значит, а в данных выглядит так,
/// будто ячейку зачем-то объединили саму с собой.
/// null и undefined здесь разное: null — «ячейку накрыли сверху, рисовать не
/// надо», undefined — строки за пределами списка, такой вообще не бывает.
/// Свести их вместе (span ?? 1) значит нарисовать накрытую ячейку заново.
function cell(value: string, span: number | null | undefined): SurveyCell {
  if (span === null) return null;

  return span !== undefined && span > 1
    ? { v: value, rowSpan: span }
    : { v: value };
}

/// Пусто и «неизвестно» в таблице выглядят одинаково: колонка просто пустая.
function text(value: string | null | undefined): SurveyCell {
  return { v: value ?? '' };
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

function yesNo(value: boolean | null | undefined): SurveyCell {
  if (value === null || value === undefined) return { v: '' };

  return { v: value ? 'да' : 'нет' };
}

const modemKindLabels: Record<ModemKind, string> = {
  [ModemKind.BuiltIn]: 'встроенный',
  [ModemKind.External]: 'внешний',
};

/// Класс напряжения показываем числом, как его называют вслух: «0,4», «110».
/// Запятая — десятичный разделитель по-русски, «0.4» в таблице выглядело бы
/// выгрузкой из чужой системы.
const voltageClassLabels: Record<VoltageClass, string> = {
  [VoltageClass.Kv0_4]: '0,4',
  [VoltageClass.Kv6]: '6',
  [VoltageClass.Kv10]: '10',
  [VoltageClass.Kv35]: '35',
  [VoltageClass.Kv110]: '110',
  [VoltageClass.Kv220]: '220',
  [VoltageClass.Kv330]: '330',
  [VoltageClass.Kv750]: '750',
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
      uspdId: true,
      modemId: true,
      sidePollingId: true,
      tisNotesId: true,
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
      uspd: { select: { type: true, number: true } },
      modem: {
        select: {
          kind: true,
          type: true,
          number: true,
          simCard: { select: { number: true, ip: true, provider: true } },
        },
      },
      connection: {
        select: { meterAddress: true, port: true, channel: true },
      },
      sidePolling: { select: { description: true } },
      tisNotes: { select: { description: true } },
    },
  });

  const uspdSpans = spans(tis.map((ti) => ti.uspdId));
  /// Модем и его SIM-карта делятся между теми же ТИ: карта висит на модеме,
  /// поэтому и объединяются они по одному ключу.
  const modemSpans = spans(tis.map((ti) => ti.modemId));
  const pollingSpans = spans(tis.map((ti) => ti.sidePollingId));
  const notesSpans = spans(tis.map((ti) => ti.tisNotesId));

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
    const sim = ti.modem?.simCard;

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

      cell(ti.uspd?.type ?? '', uspdSpan),
      cell(ti.uspd?.number ?? '', uspdSpan),

      cell(ti.modem ? modemKindLabels[ti.modem.kind] : '', modemSpan),
      cell(ti.modem?.type ?? '', modemSpan),
      cell(ti.modem?.number ?? '', modemSpan),

      cell(sim?.number ?? '', modemSpan),
      cell(sim?.ip ?? '', modemSpan),
      cell(sim?.provider ?? '', modemSpan),

      text(ti.connection?.meterAddress),
      text(ti.connection?.port),
      text(ti.connection ? channelLabels[ti.connection.channel] : ''),

      cell(ti.sidePolling?.description ?? '', pollingSpans[index]),
      cell(ti.tisNotes?.description ?? '', notesSpans[index]),
    ];
  });
}
