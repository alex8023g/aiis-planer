/// Выгрузка ТИ проекта в Excel по форме ПНР (docs/excel_examples/ПНР МКЗ.xlsx):
/// по строке на ТИ — счётчик, ТТ, ТН, модем и SIM-карта. Колонок №,
/// наименования ТИ и Uном образца нет, номера фаз ТТ и ТН — одной ячейкой.
///
/// Колонок «КТ» (класс точности) образца нет: в базе класс точности не
/// хранится.
import 'server-only';

import ExcelJS from 'exceljs';

import {
  TRANSFORMER_ABSENT,
  allPhasesAbsent,
  modemImeiText,
  type SurveyTi,
} from '@/lib/survey-ti';

import type { TiDetails } from './ti-details';

/// «Нет» — как в базе, TRANSFORMER_ABSENT («---»).
const ABSENT = TRANSFORMER_ABSENT;

const COLUMN_COUNT = 12;

/// Ширины колонок — как в образце; у номеров ТТ и ТН — на один номер.
const COLUMN_WIDTHS = [
  29.3, 18.3, 8.6, 22, 16.1, 14, 8.1, 13.7, 14, 14, 22.6, 31.1,
];

/// Колонки, общие у модема группы: IP/port, модем, SIM — объединяются на ТИ
/// одной группы, как в образце.
const MODEM_COLUMNS = [4, 11, 12];

const thin = { style: 'thin' } as const;
const border = { top: thin, left: thin, bottom: thin, right: thin };
const font = { name: 'Calibri', size: 12 };

type Transformer = TiDetails['tt'];

/// Значение одной фазы — как в базе, «---» тоже.
function phase(value: string | null): string {
  return value ?? '';
}

/// Марка в одну ячейку: одна на все заполненные фазы — её одну, иначе по
/// строке на фазу A, B, C (пустая фаза — пустой строкой, «---» — как есть).
function typeText(types: [string | null, string | null, string | null]) {
  const present = new Set(types.filter(Boolean));

  if (present.size <= 1) return [...present].join('');

  return types.map(phase).join('\n');
}

/// Ячейки трансформатора: тип, номера фаз A, B, C одной ячейкой (по строке
/// на фазу) и коэффициент. absent — трансформатора нет: прочерки; null без
/// absent — не выяснили: пусто.
function transformerCells(data: Transformer, absent: boolean): string[] {
  if (absent || (data && allPhasesAbsent(data.type))) {
    return Array(3).fill(ABSENT);
  }

  if (!data) return Array(3).fill('');

  const numbers = data.number.map(phase);

  return [
    typeText(data.type),
    /// Пустая фаза — пустой строкой: номер остаётся напротив своей фазы.
    numbers.some(Boolean) ? numbers.join('\n') : '',
    phase(data.ratio),
  ];
}

/// SIM-карты модема: одна — номером, две — как в образце, «sim1: …» и
/// «sim2: …» строками.
function simText(modem: NonNullable<TiDetails['group']>['modem']): string {
  const main = modem?.sim?.number ?? '';
  const reserve = modem?.reserveSim?.number;

  if (!reserve) return main;

  return `sim1: ${main}\nsim2: ${reserve}`;
}

function rowValues(ti: SurveyTi, details: TiDetails | undefined): string[] {
  const groupModem = ti.group?.modem;
  const modem = details?.group?.modem ?? null;
  const ip = groupModem?.ip ?? '';
  const port = modem?.port ?? '';

  return [
    ti.currentMeter?.type ?? '',
    ti.currentMeter?.number ?? '',
    ti.meterAddress ?? '',
    ip && port ? `${ip}:${port}` : ip,
    ...transformerCells(details?.tt ?? null, false),
    ...transformerCells(details?.tn ?? null, details?.tnState === 'absent'),
    [groupModem?.type, modemImeiText(groupModem)].filter(Boolean).join('\n'),
    simText(modem),
  ];
}

/// Шапка — три строки, как в образце: группы и поля (поля — на две строки).
function writeHeader(sheet: ExcelJS.Worksheet) {
  const set = (address: string, value: string) => {
    sheet.getCell(address).value = value;
  };

  set('A1', 'Прибор учета');
  set('E1', 'Трансформатор тока');
  set('H1', 'Трансформатор напряжения');
  set('K1', 'Модем');

  set('A2', 'Тип');
  set('B2', 'Зав. \nномер');
  set('C2', 'Сет. адр.');
  set('D2', 'IP/port');
  set('E2', 'Тип');
  set('F2', 'зав. №');
  set('G2', 'Ктт');
  set('H2', 'Тип');
  set('I2', 'зав. №');
  set('J2', 'Ктн');
  set('K2', 'Тип/IMEI');
  set('L2', 'Номер sim-карты');

  sheet.mergeCells('A1:D1');
  sheet.mergeCells('E1:G1');
  sheet.mergeCells('H1:J1');
  sheet.mergeCells('K1:L1');

  for (let col = 1; col <= COLUMN_COUNT; col++) {
    sheet.mergeCells(2, col, 3, col);
  }

  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= COLUMN_COUNT; col++) {
      const cell = sheet.getCell(row, col);

      cell.font = font;
      cell.border = border;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    }
  }
}

/// Файл .xlsx по форме ПНР. organization — строка над ТИ (в образце —
/// заказчик); ТИ — в порядке таблицы.
export async function buildPnrWorkbook(
  organization: string,
  tis: SurveyTi[],
  details: Readonly<Record<string, TiDetails>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Лист1', {
    views: [{ state: 'frozen', ySplit: 3, zoomScale: 70 }],
  });

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
  writeHeader(sheet);

  const orgRow = sheet.getRow(4);

  orgRow.getCell(1).value = organization;
  sheet.mergeCells(4, 1, 4, COLUMN_COUNT);
  orgRow.getCell(1).font = { ...font, bold: true };
  orgRow.getCell(1).alignment = { vertical: 'middle' };
  orgRow.getCell(1).border = border;

  const FIRST = 5;

  tis.forEach((ti, index) => {
    const row = sheet.getRow(FIRST + index);

    rowValues(ti, details[ti.id]).forEach((value, index) => {
      const cell = row.getCell(index + 1);

      /// Пустое — пустой ячейкой, а не пустой строкой.
      if (value) cell.value = value;
      cell.font = font;
      cell.border = border;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
  });

  /// Модем группы — одной ячейкой на подряд идущие ТИ этой группы.
  const modemGroup = (ti: SurveyTi) => {
    const group = details[ti.id]?.group;

    return group?.modem && group.id === ti.group?.id ? group.id : null;
  };

  for (let start = 0; start < tis.length;) {
    const key = modemGroup(tis[start]);
    let end = start;

    while (
      key !== null &&
      end + 1 < tis.length &&
      modemGroup(tis[end + 1]) === key
    ) {
      end++;
    }

    if (end > start) {
      for (const col of MODEM_COLUMNS) {
        sheet.mergeCells(FIRST + start, col, FIRST + end, col);
      }
    }

    start = end + 1;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
