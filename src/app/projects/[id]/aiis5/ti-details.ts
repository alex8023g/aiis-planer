/// Колонки таблицы aiis5 — все, по порядку, и ячейка каждой. Порядок в
/// tableColumns — порядок колонок на экране; ячейки собираются по нему же
/// (tableRows), поэтому колонку переставляют одной строкой здесь.
///
/// Первые колонки — те же, что в таблице опроса aiis4 (src/lib/survey-ti.ts,
/// отмечены survey), за ними — остальные данные ТИ: счётчики (номера,
/// соответствие, даты, снятый), ТТ, ТН, УСПД, модем, SIM-карта, опрос и
/// примечание группы, заметки ТИ.
///
/// Без базы и без серверного кода — модуль импортирует клиентская таблица;
/// SurveyTi отдаёт getSurveyTis (src/lib/tis.ts), TiDetails — getTiDetails
/// (./get-ti-details.ts).
import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import type {
  Channel as DbChannel,
  ModemKind as DbModemKind,
  TnState as DbTnState,
} from '@/generated/prisma/enums';
import {
  cell,
  spans,
  text,
  voltageClassLabels,
  yesNo,
} from '@/lib/survey-cells';
import {
  NO_PROPOSED_METER,
  TN_ABSENT,
  modemImeiText,
  suggestedWiring,
  tiStatusLabels,
  wiringLabels,
  type SurveyTi,
} from '@/lib/survey-ti';
import { Channel, ModemKind } from '@/lib/types';

import type { ColumnGroup } from './columns';

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
  /// Есть ли у ТИ ТН: unknown — не выяснили, absent — нет, present — есть.
  tnState: DbTnState;
  /// Данные ТН; null — ТН не present (см. tnState).
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

/// Объединения ячеек на группу ТИ — у каждого свой ключ (см. tableRows).
type SpanKey =
  'group' | 'polling' | 'uspd' | 'modem' | 'sidePolling' | 'groupNotes';

/// Всё, из чего собирается строка таблицы: ТИ, её данные сверх опроса,
/// итог Connect и высоты объединений в этой строке.
type TiRow = {
  ti: SurveyTi;
  details: TiDetails | undefined;
  connected: string | undefined;
  span: (key: SpanKey) => number | null;
};

/// Колонка таблицы aiis5. id — постоянное имя: по нему запоминаем скрытые
/// (заголовки повторяются — «фаза», «№ сч.») и находим колонку в SurveyView.
/// group — раздел в меню «Колонки».
export type TableColumn = SurveyColumn & {
  id: string;
  group: ColumnGroup;
  /// false — колонку не скрыть.
  hideable?: boolean;
  /// Колонка есть и в таблице опроса aiis4 — для набора «Только опрос».
  survey?: boolean;
  cell: (row: TiRow) => SurveyCell;
};

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

/// Пофазное значение — в три строки; пусто, если трансформатора на ТИ нет.
/// empty — что у пустой фазы: прочерк (так же, как в таблице aiis3,
/// src/lib/tis.ts) или пустая строка — её высоту держит неразрывный пробел,
/// иначе фазы съехали бы с подписей «фаза».
function phaseCell(
  values: [string | null, string | null, string | null] | undefined,
  empty = '—',
): SurveyCell {
  if (!values) return { v: '' };

  return { v: PHASES.map((_, index) => values[index] ?? empty).join('\n') };
}

/// Колонки ТТ или ТН — одинаковые, различаются только данными.
function transformerColumns(
  group: 'tt' | 'tn',
  label: 'ТТ' | 'ТН',
  ratioTitle: string,
  widths: { number: number; ratio: number },
): TableColumn[] {
  const of = (row: TiRow) => row.details?.[group] ?? null;

  const columns: TableColumn[] = [
    {
      title: 'фаза',
      minWidth: 50,
      compact: true,
      id: `${group}Phase`,
      group,
      cell: (row) => ({ v: of(row) ? PHASES.join('\n') : '' }),
    },
    {
      title: `${label} тип`,
      minWidth: 160,
      id: `${group}Type`,
      group,
      cell: (row) => phaseCell(of(row)?.type),
    },
    {
      title: `${label} №`,
      minWidth: widths.number,
      id: `${group}Number`,
      group,
      /// У ТН пустой номер фазы — пустая строка, без прочерка, как и марка
      /// в «ТН тип».
      cell: (row) =>
        phaseCell(of(row)?.number, group === 'tn' ? '\u00a0' : '—'),
    },
    {
      title: ratioTitle,
      minWidth: widths.ratio,
      id: `${group}Ratio`,
      group,
      cell: (row) => ({ v: of(row)?.ratio ?? '', align: 'middle' }),
    },
    {
      title: `дата уст. ${label}`,
      minWidth: 100,
      id: `${group}Installed`,
      group,
      cell: (row) => date(of(row)?.dateInstalled),
    },
    {
      title: `дата снятия ${label}`,
      minWidth: 100,
      id: `${group}Removed`,
      group,
      cell: (row) => date(of(row)?.dateRemoved),
    },
  ];

  if (group === 'tt') return columns;

  /// ТН нет (state = absent) — во всех колонках ТН TN_ABSENT: «нет» видно
  /// прямо, а пустая ячейка остаётся «не выяснили».
  return columns.map((column) => ({
    ...column,
    cell: (row) =>
      row.details?.tnState === 'absent' ? { v: TN_ABSENT } : column.cell(row),
  }));
}

/// Все колонки таблицы — в порядке на экране.
export const tableColumns: TableColumn[] = [
  /// Колонка выделения строк: за неё же цепляется переход к строке
  /// (data-row-cell …:0), поэтому её не скрыть.
  {
    title: '',
    minWidth: 24,
    id: 'rowHandle',
    group: 'ti',
    hideable: false,
    survey: true,
    cell: () => text(''),
  },
  {
    title: '№ТИ на ОС',
    minWidth: 48,
    compact: true,
    id: 'number',
    group: 'ti',
    survey: true,
    cell: ({ ti }) => text(ti.number),
  },
  {
    title: 'наименование ТИ',
    minWidth: 280,
    id: 'name',
    group: 'ti',
    survey: true,
    cell: ({ ti }) => text(ti.name),
  },
  {
    title: 'статус',
    minWidth: 48,
    compact: true,
    resizable: false,
    id: 'status',
    group: 'ti',
    survey: true,
    cell: ({ ti }) => text(tiStatusLabels[ti.status]),
  },
  {
    title: 'Uном, кВ',
    minWidth: 80,
    id: 'uNom',
    group: 'ti',
    survey: true,
    cell: ({ ti }) => text(ti.uNom ? voltageClassLabels[ti.uNom] : ''),
  },

  {
    title: 'тип ПУ',
    minWidth: 160,
    id: 'meterType',
    group: 'meter',
    survey: true,
    cell: ({ ti }) => text(ti.currentMeter?.type),
  },
  {
    title: '№ сч.',
    minWidth: 120,
    id: 'meterNumber',
    group: 'meter',
    /// Из SurveyTi, а не из TiDetails: номер правят в таблице, и правка
    /// видна сразу, до ответа сервера (applyEdits в SurveyView).
    cell: ({ ti }) => text(ti.currentMeter?.number),
  },
  {
    title: 'соотв. по справоч АТС',
    minWidth: 72,
    compact: true,
    id: 'atsDictionary',
    group: 'meter',
    survey: true,
    cell: ({ ti }) => yesNo(ti.currentMeter?.inAtsDictionary),
  },
  {
    title: 'требуется замена сч.',
    minWidth: 72,
    compact: true,
    id: 'needsReplacement',
    group: 'meter',
    survey: true,
    cell: ({ ti }) => yesNo(ti.currentMeter?.needsReplacement),
  },
  /// Своя схема не записана — подсказанная (SurveyView красит её серым:
  /// значение подсказано, а не выяснено на опросе).
  {
    title: 'схема включения',
    minWidth: 100,
    id: 'wiring',
    group: 'meter',
    survey: true,
    cell: ({ ti }) => {
      const scheme = ti.wiring ?? suggestedWiring(ti)?.scheme;

      return text(scheme ? wiringLabels[scheme] : '');
    },
  },
  {
    title: 'замена сч.',
    minWidth: 160,
    id: 'proposedMeterType',
    group: 'proposed',
    survey: true,
    cell: ({ ti }) =>
      text(ti.proposedMeter ? ti.proposedMeter.type : NO_PROPOSED_METER),
  },
  {
    title: 'сущ. опрос',
    minWidth: 200,
    id: 'existingPolling',
    group: 'polling',
    survey: true,
    cell: ({ ti, span }) => cell(ti.existingPolling ?? '', span('polling')),
  },
  {
    title: 'свобод. RS-485',
    minWidth: 100,
    id: 'freeRs485',
    group: 'polling',
    survey: true,
    cell: ({ ti }) => yesNo(ti.freeRs485),
  },
  {
    title: 'тех. решение',
    minWidth: 320,
    id: 'technicalSolution',
    group: 'polling',
    survey: true,
    cell: ({ ti, span }) =>
      cell(ti.group?.technicalSolution ?? '', span('group')),
  },
  {
    title: 'IMEI модема',
    minWidth: 160,
    id: 'modemImei',
    group: 'link',
    survey: true,
    cell: ({ ti, span }) => cell(modemImeiText(ti.group?.modem), span('group')),
  },
  /// IP — у модема группы, поэтому объединяется вместе с решением.
  {
    title: 'IP',
    minWidth: 140,
    id: 'ip',
    group: 'link',
    survey: true,
    cell: ({ ti, span }) => cell(ti.group?.modem?.ip ?? '', span('group')),
  },
  {
    title: 'сет. адрес сч.',
    minWidth: 140,
    id: 'meterAddress',
    group: 'meter',
    survey: true,
    cell: ({ ti }) => text(ti.meterAddress),
  },
  {
    title: 'подключён',
    minWidth: 200,
    id: 'connected',
    group: 'link',
    survey: true,
    cell: ({ connected }) => text(connected),
  },

  {
    title: 'соотв. требованиям',
    minWidth: 100,
    id: 'meterCompliant',
    group: 'meter',
    cell: ({ details }) => yesNo(details?.currentMeter?.isCompliant),
  },
  {
    title: 'дата уст. сч.',
    minWidth: 100,
    id: 'meterInstalled',
    group: 'meter',
    cell: ({ details }) => date(details?.currentMeter?.dateInstalled),
  },

  {
    title: '№ сч. (замена)',
    minWidth: 120,
    id: 'proposedNumber',
    group: 'proposed',
    cell: ({ details }) => text(details?.proposedMeter?.number),
  },
  {
    title: 'соотв. требованиям (замена)',
    minWidth: 100,
    id: 'proposedCompliant',
    group: 'proposed',
    cell: ({ details }) => yesNo(details?.proposedMeter?.isCompliant),
  },
  {
    title: 'адрес счётчика (замена)',
    minWidth: 140,
    id: 'proposedAddress',
    group: 'proposed',
    cell: ({ details }) => text(details?.proposedMeter?.meterAddress),
  },
  {
    title: 'дата уст. сч. (замена)',
    minWidth: 100,
    id: 'proposedInstalled',
    group: 'proposed',
    cell: ({ details }) => date(details?.proposedMeter?.dateInstalled),
  },

  {
    title: 'тип ПУ (снят)',
    minWidth: 160,
    id: 'removedType',
    group: 'removed',
    cell: ({ details }) => text(details?.removedMeter?.type),
  },
  {
    title: '№ сч. (снят)',
    minWidth: 120,
    id: 'removedNumber',
    group: 'removed',
    cell: ({ details }) => text(details?.removedMeter?.number),
  },
  {
    title: 'дата снятия сч.',
    minWidth: 100,
    id: 'removedDate',
    group: 'removed',
    cell: ({ details }) => date(details?.removedMeter?.dateRemoved),
  },

  ...transformerColumns('tt', 'ТТ', 'Ктт', { number: 140, ratio: 80 }),
  ...transformerColumns('tn', 'ТН', 'Ктн', { number: 120, ratio: 100 }),

  {
    title: 'УСПД тип',
    minWidth: 140,
    id: 'uspdType',
    group: 'uspd',
    cell: ({ details, span }) =>
      cell(details?.group?.uspd?.type ?? '', span('uspd')),
  },
  {
    title: 'УСПД №',
    minWidth: 120,
    id: 'uspdNumber',
    group: 'uspd',
    cell: ({ details, span }) =>
      cell(details?.group?.uspd?.number ?? '', span('uspd')),
  },

  /// Модем и его SIM-карта объединяются по одному ключу: карта висит на
  /// модеме.
  {
    title: 'модем вид',
    minWidth: 110,
    id: 'modemKind',
    group: 'link',
    cell: ({ details, span }) => {
      const kind = details?.group?.modem?.kind;

      return cell(kind ? modemKindLabels[kind] : '', span('modem'));
    },
  },
  {
    title: 'модем тип',
    minWidth: 140,
    id: 'modemType',
    group: 'link',
    cell: ({ details, span }) =>
      cell(details?.group?.modem?.type ?? '', span('modem')),
  },
  {
    title: 'порт',
    minWidth: 80,
    id: 'modemPort',
    group: 'link',
    cell: ({ details, span }) =>
      cell(details?.group?.modem?.port ?? '', span('modem')),
  },
  {
    title: 'канал',
    minWidth: 80,
    id: 'modemChannel',
    group: 'link',
    cell: ({ details, span }) => {
      const modem = details?.group?.modem;

      return cell(modem ? channelLabels[modem.channel] : '', span('modem'));
    },
  },
  {
    title: 'SIM №',
    minWidth: 140,
    id: 'simNumber',
    group: 'link',
    cell: ({ details, span }) =>
      cell(details?.group?.modem?.sim?.number ?? '', span('modem')),
  },
  {
    title: 'SIM оператор',
    minWidth: 120,
    id: 'simProvider',
    group: 'link',
    cell: ({ details, span }) =>
      cell(details?.group?.modem?.sim?.provider ?? '', span('modem')),
  },

  {
    title: 'опрашивается / не опрашивается',
    minWidth: 160,
    id: 'sidePolling',
    group: 'polling',
    cell: ({ details, span }) =>
      cell(details?.group?.sidePolling ?? '', span('sidePolling')),
  },
  {
    title: 'примечания группы',
    minWidth: 160,
    id: 'groupNotes',
    group: 'polling',
    cell: ({ details, span }) =>
      cell(details?.group?.notes ?? '', span('groupNotes')),
  },
  {
    title: 'заметки ТИ',
    minWidth: 160,
    id: 'tiNotes',
    group: 'ti',
    cell: ({ details }) => text(details?.notes),
  },
];

/// Индекс колонки в tableColumns по id. Нет такой — ошибка сразу при
/// загрузке модуля, а не тихо не та колонка.
export function columnIndex(id: string): number {
  const index = tableColumns.findIndex((column) => column.id === id);

  if (index < 0) throw new Error(`aiis5: нет колонки «${id}»`);

  return index;
}

/// Ячейки таблицы — по строке на ТИ, в порядке tableColumns.
/// connected — текст «подключён» по id ТИ: итог кнопки Connect живёт только
/// на клиенте, до перезагрузки страницы, в базе его нет.
export function tableRows(
  tis: SurveyTi[],
  details: Readonly<Record<string, TiDetails>>,
  connected?: ReadonlyMap<string, string>,
): SurveyCell[][] {
  /// Данные группы из TiDetails объединяем, только пока группа та же, что у
  /// ТИ в таблице (с учётом ещё не сохранённых правок): после объединения
  /// или разделения групп details до ответа сервера ещё старые.
  const detailsGroupKeys = (
    has: (group: NonNullable<TiDetails['group']>) => boolean,
  ) =>
    tis.map((ti) => {
      const group = details[ti.id]?.group;

      return group && group.id === ti.group?.id && has(group) ? group.id : null;
    });

  const spansByKey: Record<SpanKey, (number | null)[]> = {
    /// «Тех. решение», IMEI и IP — общие у всей группы, поэтому объединяем по
    /// группе, даже когда решения ещё нет: пустая ячейка группы — одно общее
    /// «пока не решили», и заполнят её разом на все ТИ.
    group: spans(tis.map((ti) => ti.group?.id ?? null)),
    /// «Сущ. опрос» — свой у каждой ТИ. Объединяем ТИ одной группы, но только
    /// с одинаковым текстом: иначе общая ячейка показала бы значение верхней
    /// ТИ и спрятала отличие остальных.
    polling: spans(
      tis.map((ti) =>
        ti.group ? `${ti.group.id}\n${ti.existingPolling ?? ''}` : null,
      ),
    ),
    uspd: spans(detailsGroupKeys((group) => group.uspd !== null)),
    modem: spans(detailsGroupKeys((group) => group.modem !== null)),
    sidePolling: spans(detailsGroupKeys((group) => group.sidePolling !== null)),
    groupNotes: spans(detailsGroupKeys((group) => group.notes !== null)),
  };

  return tis.map((ti, index) => {
    const row: TiRow = {
      ti,
      details: details[ti.id],
      connected: connected?.get(ti.id),
      span: (key) => spansByKey[key][index],
    };

    return tableColumns.map((column) => column.cell(row));
  });
}
