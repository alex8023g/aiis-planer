/// ТИ для таблицы опроса (aiis4): данные отдельно от показа. Сервер отдаёт
/// SurveyTi — значения как в базе, — а ячейки из них собирает уже клиент
/// (surveyTiCells). Готовые строки «да, по встр. модему» для правки не годятся:
/// из них не достать ни да/нет, ни вид модема.
///
/// Без базы и без серверного кода — модуль импортирует клиентская таблица.
import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import type {
  ModemKind as DbModemKind,
  TiStatus as DbTiStatus,
  VoltageClass as DbVoltageClass,
  WiringScheme as DbWiringScheme,
} from '@/generated/prisma/enums';
import {
  cell,
  spans,
  text,
  voltageClassLabels,
  yesNo,
} from '@/lib/survey-cells';
import { TiStatus, VoltageClass, WiringScheme } from '@/lib/types';

/// Строка таблицы опроса. Типы перечислений — из Prisma: ровно то, что отдаёт
/// запрос (см. getSurveyTis в src/lib/tis.ts), без пересборки.
/// Только простые значения: объект переезжает с сервера на клиент пропсом.
export type SurveyTi = {
  id: string;
  number: string;
  name: string;
  status: DbTiStatus;
  uNom: DbVoltageClass | null;
  wiring: DbWiringScheme | null;
  /// Существующий опрос — свободный текст, как записали на опросе.
  existingPolling: string | null;
  freeRs485: boolean | null;
  /// Связной (сетевой) адрес счётчика и порт — из Connection, свои у каждой
  /// ТИ.
  meterAddress: string | null;
  port: string | null;
  /// Счётчик, что стоит сейчас (state = current). inAtsDictionary — есть ли
  /// его тип в справочнике СИ АТС (см. src/lib/siDictionaryMatch.ts);
  /// интегральный счётчик считается «нет». null — тип не записан или ещё не
  /// проверен.
  currentMeter: {
    type: string | null;
    isCompliant: boolean | null;
    inAtsDictionary: boolean | null;
    /// Почему «нет» — для подсказки в ячейке; null, когда «да» или пусто.
    atsDictionaryReason: string | null;
  } | null;
  /// Счётчик, который ставим взамен (state = proposed).
  proposedMeter: { type: string | null } | null;
  /// Общее с другими ТИ группы. null — ТИ сама по себе.
  group: {
    id: string;
    technicalSolution: string | null;
    /// ip — SIM-карты модема: карта висит на модеме, а не на ТИ.
    modem: {
      /// null — модем заведён с группой, а какой он, ещё не выяснили.
      kind: DbModemKind | null;
      type: string | null;
      ip: string | null;
    } | null;
  } | null;
};

/// Колонки таблицы опроса: раскладка файла опроса тех. решений — то, что
/// смотрят на выезде, а не все поля ТИ подряд, как в tiColumns.
export const surveyTiColumns: SurveyColumn[] = [
  { title: '', minWidth: 24 },
  { title: '№ТИ на ОС', minWidth: 48, compact: true },
  { title: 'наименование ТИ', minWidth: 280 },
  { title: 'статус', minWidth: 48, compact: true, resizable: false },
  { title: 'Uном, кВ', minWidth: 80 },
  { title: 'тип ПУ', minWidth: 160 },
  { title: 'соотв. по справочнику АТС', minWidth: 120 },
  { title: 'схема включения', minWidth: 100 },
  { title: 'сущ. опрос', minWidth: 200 },
  { title: 'свобод. RS-485', minWidth: 100 },
  { title: 'тех. решение', minWidth: 320 },
  { title: 'замена сч.', minWidth: 160 },
  { title: 'опрос', minWidth: 200 },
  { title: 'IP', minWidth: 140 },
  { title: 'адрес счётчика', minWidth: 140 },
  { title: 'подключён', minWidth: 200 },
];

/// Схему включения пишем так же, как в опросе, — сокращением.
export const wiringLabels: Record<WiringScheme, string> = {
  [WiringScheme.Direct]: 'прям.',
  [WiringScheme.SemiIndirect]: 'полукос.',
  [WiringScheme.Indirect]: 'косв.',
};

export const tiStatusLabels: Record<TiStatus, string> = {
  [TiStatus.InProgress]: 'в работе',
  [TiStatus.Done]: 'готово',
  [TiStatus.Warning]: 'внимание',
};

/// Статус из текста ячейки — по началу подписи: «в раб», «гот», «вним».
/// Статус обязателен, поэтому пустая ячейка тоже undefined — не статус.
export function parseTiStatus(value: string): DbTiStatus | undefined {
  const normalized = value.trim().toLowerCase();

  if (normalized === '') return undefined;

  return (Object.keys(tiStatusLabels) as TiStatus[]).find((status) =>
    tiStatusLabels[status].startsWith(normalized),
  );
}

/// Uном из текста ячейки: «0,4», «0.4», «0,4 кВ» — всё 0,4 кВ. null —
/// пустая ячейка («не выяснили»), undefined — такого класса напряжения нет.
export function parseVoltageClass(
  value: string,
): DbVoltageClass | null | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s*кв$/, '')
    .replace('.', ',');

  if (normalized === '') return null;

  return (Object.keys(voltageClassLabels) as VoltageClass[]).find(
    (kind) => voltageClassLabels[kind] === normalized,
  );
}

/// Схема включения из текста ячейки — по началу слова: «прям.», «прямое»,
/// «полукосвенное», «косв.». null — пустая ячейка, undefined — не схема.
export function parseWiringScheme(
  value: string,
): DbWiringScheme | null | undefined {
  const normalized = value.trim().toLowerCase();

  if (normalized === '') return null;
  /// «Полукосвенное» тоже содержит «кос» — проверяем его первым.
  if (normalized.startsWith('полукос')) return WiringScheme.SemiIndirect;
  if (normalized.startsWith('кос')) return WiringScheme.Indirect;
  if (normalized.startsWith('прям')) return WiringScheme.Direct;

  return undefined;
}

/// Да/нет из текста ячейки: «да», «Да», «нет». null — пустая ячейка
/// («не выяснили»), undefined — ни то, ни другое.
export function parseYesNo(value: string): boolean | null | undefined {
  const normalized = value.trim().toLowerCase();

  if (normalized === '') return null;
  if (normalized.startsWith('да')) return true;
  if (normalized.startsWith('нет')) return false;

  return undefined;
}

/// Почему текст не годится для поля-перечисления (Uном, схема, да/нет); null
/// — годится, или поле текстовое. Одна проверка на клиент и экшен: клиент
/// показывает ошибку сразу, экшен — на случай вызова в обход таблицы.
export function invalidValueError(field: string, value: string): string | null {
  const shown = `«${value.trim()}»`;

  switch (field) {
    case 'uNom':
      return parseVoltageClass(value) === undefined
        ? `${shown} — не класс напряжения`
        : null;
    case 'status':
      return parseTiStatus(value) === undefined
        ? `${shown} — не статус (в работе, готово, внимание)`
        : null;
    case 'wiring':
      return parseWiringScheme(value) === undefined
        ? `${shown} — не схема включения (прям., полукос., косв.)`
        : null;
    case 'freeRs485':
    case 'needsReplacement':
      return parseYesNo(value) === undefined
        ? `${shown} — не «да» и не «нет»`
        : null;
    default:
      return null;
  }
}

/// Ячейки таблицы опроса — по строке на ТИ, в порядке surveyTiColumns.
/// connected — текст «подключён» по id ТИ: итог кнопки Connect живёт только
/// на клиенте, до перезагрузки страницы, в базе его нет.
export function surveyTiCells(
  tis: SurveyTi[],
  connected?: ReadonlyMap<string, string>,
): SurveyCell[][] {
  /// «Тех. решение» и «опрос» — общие у всей группы, поэтому объединяем по
  /// группе, даже когда решения ещё нет: пустая ячейка группы — одно общее
  /// «пока не решили», и заполнят её разом на все ТИ. Так же видно и то, что
  /// ячейки объединили кнопкой «Объединить». Колонки делят одно
  /// объединение — опрос часть решения, IP — модема из опроса, и строки у них
  /// совпадают.
  const groupSpans = spans(tis.map((ti) => ti.group?.id ?? null));
  /// «Сущ. опрос» — свой у каждой ТИ. Объединяем ТИ одной группы, но только
  /// с одинаковым текстом: иначе общая ячейка показала бы значение верхней ТИ
  /// и спрятала отличие остальных.
  const pollingTexts = tis.map((ti) => ti.existingPolling ?? '');
  const pollingSpans = spans(
    tis.map((ti, index) =>
      ti.group ? `${ti.group.id}\n${pollingTexts[index]}` : null,
    ),
  );

  return tis.map((ti, index) => {
    const modem = ti.group?.modem;

    return [
      text(''),
      text(ti.number),
      text(ti.name),
      text(tiStatusLabels[ti.status]),
      text(ti.uNom ? voltageClassLabels[ti.uNom] : ''),
      text(ti.currentMeter?.type),
      yesNo(ti.currentMeter?.inAtsDictionary),
      text(ti.wiring ? wiringLabels[ti.wiring] : ''),
      cell(pollingTexts[index], pollingSpans[index]),
      yesNo(ti.freeRs485),
      cell(ti.group?.technicalSolution ?? '', groupSpans[index]),
      text(ti.proposedMeter?.type),
      cell(modem?.type ?? '', groupSpans[index]),
      /// IP — у модема группы, поэтому объединяется вместе с «опросом».
      cell(modem?.ip ?? '', groupSpans[index]),
      text(ti.meterAddress),
      text(connected?.get(ti.id)),
    ];
  });
}
