/// Остальные данные ТИ и связанных таблиц для aiis5 — всё, чего нет в
/// колонках опроса (surveyTiColumns): счётчики (номера, соответствие, даты,
/// снятый), ТТ, ТН, УСПД, модем, SIM-карта, опрос и примечание группы,
/// заметки ТИ. Колонки только для чтения и идут после колонок опроса: так
/// индексы колонок в SurveyView остаются прежними.
///
/// Без базы и без серверного кода — модуль импортирует клиентская таблица;
/// данные собирает getTiDetails (./get-ti-details.ts).
import type { SurveyCell } from '@/app/projects/[id]/aiis2/survey-data';
import type {
  Channel as DbChannel,
  ModemKind as DbModemKind,
} from '@/generated/prisma/enums';
import { cell, spans, text, yesNo } from '@/lib/survey-cells';
import { Channel, ModemKind } from '@/lib/types';

import type { TableColumn } from './columns';

type Meter = {
  number: string | null;
  isCompliant: boolean | null;
  meterAddress: string | null;
  /// Даты — строкой ISO: объект переезжает с сервера на клиент пропсом.
  dateInstalled: string | null;
  dateRemoved: string | null;
};

type Transformer = {
  type: [string | null, string | null, string | null];
  number: [string | null, string | null, string | null];
  ratio: string | null;
  dateInstalled: string | null;
  dateRemoved: string | null;
};

/// Данные одной ТИ сверх SurveyTi. Только простые значения.
export type TiDetails = {
  notes: string | null;
  currentMeter: Meter | null;
  proposedMeter: Meter | null;
  removedMeter: (Meter & { type: string | null }) | null;
  tt: Transformer | null;
  tn: Transformer | null;
  group: {
    id: string;
    uspd: { type: string | null; number: string | null } | null;
    modem: {
      kind: DbModemKind | null;
      type: string | null;
      port: string | null;
      channel: DbChannel;
      sim: { number: string | null; provider: string | null } | null;
    } | null;
    sidePolling: string | null;
    notes: string | null;
  } | null;
};

/// Колонки после колонок опроса — в порядке ячеек tiDetailsCells. id — для
/// выбора колонок (./columns.ts), group — раздел в меню «Колонки».
export const tiDetailsColumns: TableColumn[] = [
  { ...{ title: '№ сч.', minWidth: 120 }, id: 'meterNumber', group: 'meter' },
  {
    ...{ title: 'соотв. требованиям', minWidth: 100 },
    id: 'meterCompliant',
    group: 'meter',
  },
  {
    ...{ title: 'дата уст. сч.', minWidth: 100 },
    id: 'meterInstalled',
    group: 'meter',
  },
  {
    ...{ title: '№ сч. (замена)', minWidth: 120 },
    id: 'proposedNumber',
    group: 'proposed',
  },
  {
    ...{ title: 'соотв. требованиям (замена)', minWidth: 100 },
    id: 'proposedCompliant',
    group: 'proposed',
  },
  {
    ...{ title: 'адрес счётчика (замена)', minWidth: 140 },
    id: 'proposedAddress',
    group: 'proposed',
  },
  {
    ...{ title: 'дата уст. сч. (замена)', minWidth: 100 },
    id: 'proposedInstalled',
    group: 'proposed',
  },
  {
    ...{ title: 'тип ПУ (снят)', minWidth: 160 },
    id: 'removedType',
    group: 'removed',
  },
  {
    ...{ title: '№ сч. (снят)', minWidth: 120 },
    id: 'removedNumber',
    group: 'removed',
  },
  {
    ...{ title: 'дата снятия сч.', minWidth: 100 },
    id: 'removedDate',
    group: 'removed',
  },
  {
    ...{ title: 'фаза', minWidth: 50, compact: true },
    id: 'ttPhase',
    group: 'tt',
  },
  { ...{ title: 'ТТ тип', minWidth: 160 }, id: 'ttType', group: 'tt' },
  { ...{ title: 'ТТ №', minWidth: 140 }, id: 'ttNumber', group: 'tt' },
  { ...{ title: 'Ктт', minWidth: 80 }, id: 'ttRatio', group: 'tt' },
  {
    ...{ title: 'дата уст. ТТ', minWidth: 100 },
    id: 'ttInstalled',
    group: 'tt',
  },
  {
    ...{ title: 'дата снятия ТТ', minWidth: 100 },
    id: 'ttRemoved',
    group: 'tt',
  },
  {
    ...{ title: 'фаза', minWidth: 50, compact: true },
    id: 'tnPhase',
    group: 'tn',
  },
  { ...{ title: 'ТН тип', minWidth: 160 }, id: 'tnType', group: 'tn' },
  { ...{ title: 'ТН №', minWidth: 120 }, id: 'tnNumber', group: 'tn' },
  { ...{ title: 'Ктн', minWidth: 100 }, id: 'tnRatio', group: 'tn' },
  {
    ...{ title: 'дата уст. ТН', minWidth: 100 },
    id: 'tnInstalled',
    group: 'tn',
  },
  {
    ...{ title: 'дата снятия ТН', minWidth: 100 },
    id: 'tnRemoved',
    group: 'tn',
  },
  { ...{ title: 'УСПД тип', minWidth: 140 }, id: 'uspdType', group: 'uspd' },
  { ...{ title: 'УСПД №', minWidth: 120 }, id: 'uspdNumber', group: 'uspd' },
  { ...{ title: 'модем вид', minWidth: 110 }, id: 'modemKind', group: 'link' },
  { ...{ title: 'модем тип', minWidth: 140 }, id: 'modemType', group: 'link' },
  { ...{ title: 'порт', minWidth: 80 }, id: 'modemPort', group: 'link' },
  { ...{ title: 'канал', minWidth: 80 }, id: 'modemChannel', group: 'link' },
  { ...{ title: 'SIM №', minWidth: 140 }, id: 'simNumber', group: 'link' },
  {
    ...{ title: 'SIM оператор', minWidth: 120 },
    id: 'simProvider',
    group: 'link',
  },
  {
    ...{ title: 'опрашивается / не опрашивается', minWidth: 160 },
    id: 'sidePolling',
    group: 'polling',
  },
  {
    ...{ title: 'примечания группы', minWidth: 160 },
    id: 'groupNotes',
    group: 'polling',
  },
  { ...{ title: 'заметки ТИ', minWidth: 160 }, id: 'tiNotes', group: 'ti' },
];

const modemKindLabels: Record<ModemKind, string> = {
  [ModemKind.BuiltIn]: 'встроенный',
  [ModemKind.External]: 'внешний',
};

const channelLabels: Record<Channel, string> = {
  [Channel.Gprs]: 'GPRS',
  [Channel.Csd]: 'CSD',
};

const PHASES = ['A', 'B', 'C'] as const;

/// Дата без времени: в базе @db.Date, поэтому показываем в UTC — иначе к
/// западу от Гринвича она уехала бы на день назад.
function date(value: string | null | undefined): SurveyCell {
  return {
    v: value
      ? new Date(value).toLocaleDateString('ru-RU', { timeZone: 'UTC' })
      : '',
  };
}

/// Пофазное значение — в три строки, прочерк у пустой фазы; пусто, если
/// трансформатора на ТИ нет. Так же, как в таблице aiis3 (src/lib/tis.ts).
function phaseCell(
  values: [string | null, string | null, string | null] | undefined,
): SurveyCell {
  if (!values) return { v: '' };

  return { v: PHASES.map((_, index) => values[index] ?? '—').join('\n') };
}

function transformerCells(transformer: Transformer | null): SurveyCell[] {
  return [
    { v: transformer ? PHASES.join('\n') : '' },
    phaseCell(transformer?.type),
    phaseCell(transformer?.number),
    { v: transformer?.ratio ?? '', align: 'middle' },
    date(transformer?.dateInstalled),
    date(transformer?.dateRemoved),
  ];
}

/// Ячейки tiDetailsColumns — по строке на ТИ, в порядке tis. groupIds —
/// группы ТИ из таблицы опроса (с учётом ещё не сохранённых правок): по ним
/// объединяем общее на группу, как и колонки опроса.
export function tiDetailsCells(
  tiIds: string[],
  groupIds: (string | null)[],
  details: Readonly<Record<string, TiDetails>>,
): SurveyCell[][] {
  const groupKeys = (
    has: (group: NonNullable<TiDetails['group']>) => boolean,
  ) =>
    tiIds.map((tiId, index) => {
      const group = details[tiId]?.group;

      return group && group.id === groupIds[index] && has(group)
        ? group.id
        : null;
    });
  const uspdSpans = spans(groupKeys((group) => group.uspd !== null));
  /// Модем и его SIM-карта объединяются по одному ключу: карта висит на
  /// модеме.
  const modemSpans = spans(groupKeys((group) => group.modem !== null));
  const pollingSpans = spans(groupKeys((group) => group.sidePolling !== null));
  const notesSpans = spans(groupKeys((group) => group.notes !== null));

  return tiIds.map((tiId, index) => {
    const ti = details[tiId];
    const current = ti?.currentMeter;
    const proposed = ti?.proposedMeter;
    const removed = ti?.removedMeter;
    const group = ti?.group;
    const uspd = group?.uspd;
    const modem = group?.modem;

    return [
      text(current?.number),
      yesNo(current?.isCompliant),
      date(current?.dateInstalled),

      text(proposed?.number),
      yesNo(proposed?.isCompliant),
      text(proposed?.meterAddress),
      date(proposed?.dateInstalled),

      text(removed?.type),
      text(removed?.number),
      date(removed?.dateRemoved),

      ...transformerCells(ti?.tt ?? null),
      ...transformerCells(ti?.tn ?? null),

      cell(uspd?.type ?? '', uspdSpans[index]),
      cell(uspd?.number ?? '', uspdSpans[index]),

      cell(modem?.kind ? modemKindLabels[modem.kind] : '', modemSpans[index]),
      cell(modem?.type ?? '', modemSpans[index]),
      cell(modem?.port ?? '', modemSpans[index]),
      cell(modem ? channelLabels[modem.channel] : '', modemSpans[index]),

      cell(modem?.sim?.number ?? '', modemSpans[index]),
      cell(modem?.sim?.provider ?? '', modemSpans[index]),

      cell(group?.sidePolling ?? '', pollingSpans[index]),
      cell(group?.notes ?? '', notesSpans[index]),
      text(ti?.notes),
    ];
  });
}
