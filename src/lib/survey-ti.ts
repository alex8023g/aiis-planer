/// ТИ для таблицы опроса (aiis4): данные отдельно от показа. Сервер отдаёт
/// SurveyTi — значения как в базе, — а ячейки из них собирает уже клиент
/// (surveyTiCells). Готовые строки «да, по встр. модему» для правки не годятся:
/// из них не достать ни isPolled, ни вид модема.
///
/// Без базы и без серверного кода — модуль импортирует клиентская таблица.
import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import type {
  ModemKind as DbModemKind,
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
import { ModemKind, WiringScheme } from '@/lib/types';

/// Строка таблицы опроса. Типы перечислений — из Prisma: ровно то, что отдаёт
/// запрос (см. getSurveyTis в src/lib/tis.ts), без пересборки.
/// Только простые значения: объект переезжает с сервера на клиент пропсом.
export type SurveyTi = {
  id: string;
  number: string;
  name: string;
  uNom: DbVoltageClass | null;
  wiring: DbWiringScheme | null;
  isPolled: boolean | null;
  freeRs485: boolean | null;
  /// Связной (сетевой) адрес счётчика и порт — из Connection, свои у каждой
  /// ТИ.
  meterAddress: string | null;
  port: string | null;
  /// Счётчик, что стоит сейчас (state = current).
  currentMeter: { type: string | null; isCompliant: boolean | null } | null;
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
  { title: '№ТИ на ОС', minWidth: 80 },
  { title: 'наименование ТИ', minWidth: 280 },
  { title: 'Uном, кВ', minWidth: 80 },
  { title: 'тип ПУ', minWidth: 160 },
  { title: 'схема включения', minWidth: 100 },
  { title: 'требуется замена ПУ (да/нет)', minWidth: 200 },
  { title: 'опрашивается / не опрашивается', minWidth: 200 },
  { title: 'свобод. RS-485', minWidth: 100 },
  { title: 'тех. решение', minWidth: 320 },
  { title: 'замена сч.', minWidth: 160 },
  { title: 'опрос', minWidth: 200 },
  { title: 'IP', minWidth: 140 },
  { title: 'адрес счётчика', minWidth: 140 },
  { title: 'подключён', minWidth: 200 },
];

/// Схему включения пишем так же, как в опросе, — сокращением.
const wiringLabels: Record<WiringScheme, string> = {
  [WiringScheme.Direct]: 'прям.',
  [WiringScheme.SemiIndirect]: 'полукос.',
  [WiringScheme.Indirect]: 'косв.',
};

/// Модем в «опрашивается» — как в опросе: «да, по встр. модему».
const pollingModemLabels: Record<ModemKind, string> = {
  [ModemKind.BuiltIn]: 'по встр. модему',
  [ModemKind.External]: 'по внеш. модему',
};

/// «Опрашивается»: да/нет из ТИ и, если опрашивается, через какой модем — его
/// вид лежит на группе.
function pollingText(isPolled: boolean | null, modemLabel?: string): string {
  if (isPolled === null) return '';
  if (!isPolled) return 'нет';

  return modemLabel ? `да, ${modemLabel}` : 'да';
}

/// «Требуется замена» — обратное к «соответствует требованиям».
function needsReplacement(ti: SurveyTi): boolean | null {
  const isCompliant = ti.currentMeter?.isCompliant;

  return isCompliant === null || isCompliant === undefined
    ? null
    : !isCompliant;
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
  /// «Опрашивается» собирается из isPolled — своего у каждой ТИ — и вида
  /// модема группы. Объединяем ТИ одной группы, но только с одинаковым
  /// текстом: иначе общая ячейка показала бы значение верхней ТИ и спрятала
  /// отличие остальных.
  const pollingTexts = tis.map((ti) => {
    const modem = ti.group?.modem;

    return pollingText(
      ti.isPolled,
      modem?.kind ? pollingModemLabels[modem.kind] : undefined,
    );
  });
  const pollingSpans = spans(
    tis.map((ti, index) =>
      ti.group ? `${ti.group.id}\n${pollingTexts[index]}` : null,
    ),
  );

  return tis.map((ti, index) => {
    const modem = ti.group?.modem;

    return [
      text(ti.number),
      text(ti.name),
      text(ti.uNom ? voltageClassLabels[ti.uNom] : ''),
      text(ti.currentMeter?.type),
      text(ti.wiring ? wiringLabels[ti.wiring] : ''),
      yesNo(needsReplacement(ti)),
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
