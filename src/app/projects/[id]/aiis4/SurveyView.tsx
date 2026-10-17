'use client';

import {
  Check,
  ChevronDown,
  Merge,
  Pencil,
  Plug,
  Plus,
  Split,
  Trash2,
} from 'lucide-react';
import {
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import {
  updateMeterReaderCells,
  type MeterReaderEdit,
  type MeterReaderField,
} from '@/app/projects/[id]/meter-reader/actions';
import { CellEditor } from '@/components/CellEditor';
import { SurveyTable, type SurveyCellProps } from '@/components/SurveyTable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { copyText, parseClipboard } from '@/lib/clipboard';
import { emptyRow, voltageClassLabels, yesNo } from '@/lib/survey-cells';
import {
  invalidValueError,
  needsReplacement,
  parsePolling,
  parseTiStatus,
  parseVoltageClass,
  parseWiringScheme,
  parseYesNo,
  pollingModemLabels,
  pollingText,
  surveyTiCells,
  surveyTiColumns,
  tiStatusLabels,
  wiringLabels,
  type SurveyTi,
} from '@/lib/survey-ti';
import type { ModemKind } from '@/generated/prisma/enums';
import { TiStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import {
  addTis,
  connectMeter,
  deleteTis,
  pingTi,
  type PingResult,
  mergeTiGroups,
  splitTiGroup,
} from './actions';
import { useCellSelection } from './useCellSelection';

/// Колонки, где в режиме правки можно выделять ячейки (индексы в
/// surveyTiColumns): правимые (EDITABLE_COLUMNS) и «опрос». Выделение одно на таблицу — клик в другой колонке
/// переносит его туда. В режиме просмотра клик выделяет строку целиком.
const SELECTABLE_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/// Колонка «тех. решение» в surveyTiColumns.
const SOLUTION_COLUMN = 10;
/// Колонка «IP» в surveyTiColumns.
const IP_COLUMN = 13;
/// Колонка «подключён» в surveyTiColumns.
const CONNECTED_COLUMN = 15;
/// Колонка «статус» в surveyTiColumns.
const STATUS_COLUMN = 3;

/// Статус ТИ в таблице — точкой: серая — в работе, зелёная — готово,
/// оранжевая — внимание.
const tiStatusDotColors: Record<TiStatus, string> = {
  [TiStatus.InProgress]: 'bg-neutral-400 dark:bg-neutral-500',
  [TiStatus.Done]: 'bg-green-500',
  [TiStatus.Warning]: 'bg-orange-500',
};

/// Итог проверки для точки в ячейке: зелёная — ок, красная — нет. error —
/// почему нет, во всплывающей подсказке.
type CheckStatus = { ok: boolean; error?: string };
/// Колонки, что правятся в режиме правки, и поле под каждой. Тех. решение
/// и IP — общие на группу (ячейка объединена на группу), остальное — своё у
/// каждой ТИ. Статус, Uном, схема, «требуется замена», «опрашивается» и RS-485 —
/// перечисления и да/нет: текст ячейки разбирают parse* из survey-ti.
const EDITABLE_COLUMNS: Partial<Record<number, MeterReaderField>> = {
  1: 'number',
  2: 'name',
  3: 'status',
  4: 'uNom',
  5: 'meterType',
  6: 'wiring',
  7: 'needsReplacement',
  8: 'isPolled',
  9: 'freeRs485',
  10: 'technicalSolution',
  11: 'proposedMeterType',
  13: 'ip',
  14: 'connectAddress',
};

/// Значение правимой ячейки так, как его показывает таблица.
function fieldValue(ti: SurveyTi | undefined, col: number): string {
  if (!ti) return '';

  switch (EDITABLE_COLUMNS[col]) {
    case 'number':
      return ti.number;
    case 'name':
      return ti.name;
    case 'status':
      return tiStatusLabels[ti.status];
    case 'uNom':
      return ti.uNom ? voltageClassLabels[ti.uNom] : '';
    case 'meterType':
      return ti.currentMeter?.type ?? '';
    case 'wiring':
      return ti.wiring ? wiringLabels[ti.wiring] : '';
    case 'needsReplacement':
      return yesNo(needsReplacement(ti))?.v ?? '';
    case 'isPolled': {
      const kind = ti.group?.modem?.kind;

      return pollingText(
        ti.isPolled,
        kind ? pollingModemLabels[kind] : undefined,
      );
    }
    case 'freeRs485':
      return yesNo(ti.freeRs485)?.v ?? '';
    case 'technicalSolution':
      return ti.group?.technicalSolution ?? '';
    case 'proposedMeterType':
      return ti.proposedMeter?.type ?? '';
    case 'ip':
      return ti.group?.modem?.ip ?? '';
    default:
      return ti.meterAddress ?? '';
  }
}

type GroupPatch = {
  technicalSolution?: string | null;
  ip?: string | null;
  kind?: ModemKind;
};

/// Правки поверх ТИ — то, что видно в таблице, пока экшен пишет в базу.
/// Решение, IP и вид модема висят на группе, поэтому меняются у всех ТИ
/// группы сразу; остальное — только у своей ТИ. Нераспознанный текст не
/// показываем: save его и не отправит.
function applyEdits(tis: SurveyTi[], edits: MeterReaderEdit[]): SurveyTi[] {
  const tiPatches = new Map<string, Partial<SurveyTi>>();
  const groupPatches = new Map<string, GroupPatch>();
  const groupOf = new Map(tis.map((ti) => [ti.id, ti.group?.id]));

  function patchTi(ti: SurveyTi | undefined, patch: Partial<SurveyTi>) {
    if (ti) tiPatches.set(ti.id, { ...tiPatches.get(ti.id), ...patch });
  }

  function patchGroup(tiId: string, patch: GroupPatch) {
    const groupId = groupOf.get(tiId);

    if (groupId) {
      groupPatches.set(groupId, { ...groupPatches.get(groupId), ...patch });
    }
  }

  for (const { tiId, field, value } of edits) {
    const ti = tis.find((item) => item.id === tiId);
    const trimmed = value.trim() === '' ? null : value.trim();

    switch (field) {
      case 'number':
        patchTi(ti, { number: value.trim() });
        break;
      case 'name':
        /// Наименование обязательное: пустое — '', а не null, как и в экшене.
        patchTi(ti, { name: value.trim() });
        break;
      case 'connectAddress':
        patchTi(ti, { meterAddress: trimmed });
        break;
      case 'meterType':
        patchTi(ti, {
          currentMeter: {
            isCompliant: ti?.currentMeter?.isCompliant ?? null,
            type: trimmed,
          },
        });
        break;
      case 'needsReplacement': {
        const needs = parseYesNo(value);

        if (needs !== undefined) {
          patchTi(ti, {
            currentMeter: {
              type: ti?.currentMeter?.type ?? null,
              isCompliant: needs === null ? null : !needs,
            },
          });
        }
        break;
      }
      case 'proposedMeterType':
        patchTi(ti, { proposedMeter: { type: trimmed } });
        break;
      case 'uNom': {
        const uNom = parseVoltageClass(value);

        if (uNom !== undefined) patchTi(ti, { uNom });
        break;
      }
      case 'status': {
        const status = parseTiStatus(value);

        if (status !== undefined) patchTi(ti, { status });
        break;
      }
      case 'wiring': {
        const wiring = parseWiringScheme(value);

        if (wiring !== undefined) patchTi(ti, { wiring });
        break;
      }
      case 'freeRs485': {
        const freeRs485 = parseYesNo(value);

        if (freeRs485 !== undefined) patchTi(ti, { freeRs485 });
        break;
      }
      case 'isPolled': {
        const polling = parsePolling(value);

        if (polling) {
          patchTi(ti, { isPolled: polling.isPolled });

          if (polling.modemKind) {
            patchGroup(tiId, { kind: polling.modemKind });
          }
        }
        break;
      }
      case 'technicalSolution':
        patchGroup(tiId, { technicalSolution: trimmed });
        break;
      case 'ip':
        patchGroup(tiId, { ip: trimmed });
        break;
    }
  }

  return tis.map((ti) => {
    let next = ti;
    const tiPatch = tiPatches.get(ti.id);

    if (tiPatch) next = { ...next, ...tiPatch };

    const group = next.group;
    const groupPatch = group ? groupPatches.get(group.id) : undefined;

    if (group && groupPatch) {
      const { technicalSolution, ip, kind } = groupPatch;
      const modem = group.modem;

      next = {
        ...next,
        group: {
          ...group,
          ...(technicalSolution !== undefined && { technicalSolution }),
          modem: modem && {
            ...modem,
            ...(ip !== undefined && { ip }),
            ...(kind !== undefined && { kind }),
          },
        },
      };
    }

    return next;
  });
}
/// Постоянная ссылка на пустой список: новый [] на каждой перерисовке
/// пересчитывал бы границы ячеек в useCellSelection.
const NO_ROWS: never[] = [];
const NO_ROW_SELECTION = { rows: new Set<number>(), active: null };

/// Панель управления и таблица опроса. Клиентская ради состояния editable:
/// кнопка в панели переключает таблицу между просмотром и правкой.
/// ТИ приходят значениями из базы, ячейки собираются здесь: правке нужны сами
/// значения, а не готовый текст.
export function SurveyView({
  projectId,
  tis,
  canEdit,
}: {
  projectId: string;
  tis: SurveyTi[];
  /// Может ли пользователь менять проект (см. canEditProject). Без права
  /// кнопки нет вовсе: незачем показывать то, что не сработает.
  canEdit: boolean;
}) {
  const [editable, setEditable] = useState(false);
  /// Сколько ТИ добавить разом. Строкой, а не числом: иначе поле нельзя
  /// очистить, чтобы набрать новое значение, — пустое число стало бы 0.
  const [addCount, setAddCount] = useState('1');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /// Сохранение ячеек — своим переходом: иначе на время записи кнопки
  /// панели показывали бы «Добавляем…».
  const [, startSaveTransition] = useTransition();
  const [optimisticTis, addEdits] = useOptimistic(tis, applyEdits);
  /// Ячейка, которая сейчас правится (у объединённой — первая строка), и с
  /// какого текста начали.
  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    initial: string;
  } | null>(null);
  /// Выделенные строки — ТИ целиком; с Ctrl (⌘) кликом выделяют несколько.
  /// active — последняя выбранная: от неё ходят стрелками. В режиме правки
  /// строки выделяют кликом в первую колонку (для удаления), а в остальных —
  /// ячейки (useCellSelection).
  const [rowSelection, setRowSelection] = useState<{
    rows: ReadonlySet<number>;
    active: number | null;
  }>(NO_ROW_SELECTION);
  const selectedRows = useMemo(
    () => [...rowSelection.rows].sort((first, second) => first - second),
    [rowSelection],
  );
  /// Опрос счётчика кнопкой Connect: идёт ли сейчас. Итог — в колонке
  /// «подключён».
  const [isConnecting, startConnectTransition] = useTransition();
  /// Сколько ТИ уже опрошено, когда опрашиваем все разом; null — одну.
  const [connectProgress, setConnectProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  /// Колонка «подключён»: итог Connect по каждой ТИ за эту сессию — в базу
  /// не пишем, после перезагрузки колонка снова пустая. status — чем кончился
  /// опрос: перед текстом точка, зелёная — счётчик ответил, красная — нет;
  /// пока опрос не кончился, точки нет. error — почему не ответил, во
  /// всплывающей подсказке: в ячейке длинный текст ошибки не уместить.
  const [connected, setConnected] = useState<
    ReadonlyMap<
      string,
      { text: string; status?: 'ok' | 'error'; error?: string }
    >
  >(() => new Map());
  const connectedTexts = useMemo(
    () =>
      new Map(
        Array.from(connected, ([tiId, { text }]) => [tiId, text] as const),
      ),
    [connected],
  );
  /// У проекта без ТИ — шапка и одна пустая строка, как на aiis3.
  const rows = useMemo(
    () =>
      optimisticTis.length > 0
        ? surveyTiCells(optimisticTis, connectedTexts)
        : [emptyRow(surveyTiColumns)],
    [optimisticTis, connectedTexts],
  );
  console.log('🚀 ~ SurveyView ~ rows:', rows);
  /// Ячейки наименования ТИ, тех. решения и опроса можно выделять, как в Excel. Пустая таблица (одна
  /// строка-заглушка) — выделять нечего.
  const selection = useCellSelection({
    rows: tis.length > 0 ? rows : NO_ROWS,
    columns: SELECTABLE_COLUMNS,
  });
  console.log('🚀 ~ SurveyView ~ selection:', selection);

  /// Ping IP модемов кнопкой Connect — по IP, а не по ТИ: модем общий на
  /// группу, и ячейка IP объединена на всю группу. Только на эту сессию, как
  /// и «подключён».
  const [pings, setPings] = useState<ReadonlyMap<string, CheckStatus>>(
    () => new Map(),
  );

  function setPing(ip: string, status: CheckStatus | null) {
    setPings((previous) => {
      const next = new Map(previous);

      if (status) next.set(ip, status);
      else next.delete(ip);

      return next;
    });
  }

  function setConnectedText(
    tiId: string,
    text: string,
    status?: 'ok' | 'error',
    error?: string,
  ) {
    setConnected((previous) =>
      new Map(previous).set(tiId, { text, status, error }),
    );
  }

  function save(edits: MeterReaderEdit[]) {
    if (edits.length === 0) return;

    /// Перечисления и да/нет: нераспознанный текст экшен всё равно
    /// отклонит, а так ошибка видна сразу, без запроса.
    for (const { field, value } of edits) {
      const invalid = invalidValueError(field, value);

      if (invalid) return setError(invalid);
    }

    setError(null);
    /// Не прошёл экшен — оптимистичные значения откатятся сами с концом
    /// перехода.
    startSaveTransition(async () => {
      addEdits(edits);
      const result = await updateMeterReaderCells(projectId, edits);

      if (!result.ok) setError(result.error);
    });
  }

  /// Первые строки ячеек колонки: объединённая ячейка группы — одна ячейка
  /// на все её строки, вставка и очистка шагают по ячейкам, а не по строкам.
  function cellStarts(col: number): number[] {
    if (optimisticTis.length === 0) return [];

    return rows.flatMap((cells, row) => (cells[col] !== null ? [row] : []));
  }

  /// Ячейки под выделением — по первой строке каждой.
  function selectedCells(col: number): number[] {
    const range = selection.range;

    if (!range || range.col !== col) return [];

    return cellStarts(col).filter(
      (row) => row >= range.top && row <= range.bottom,
    );
  }

  function valueAt(row: number, col: number): string {
    return fieldValue(optimisticTis[row], col);
  }

  /// Правка ячейки — через её первую ТИ: для IP и решения экшен сам найдёт
  /// группу. «Опрашивается» — своё у каждой ТИ, а объединённая ячейка
  /// накрывает ТИ группы с одинаковым текстом: правка — каждой из них.
  function edit(row: number, col: number, value: string): MeterReaderEdit[] {
    const field = EDITABLE_COLUMNS[col]!;
    const span = field === 'isPolled' ? (rows[row][col]?.rowSpan ?? 1) : 1;

    return optimisticTis
      .slice(row, row + span)
      .map((ti) => ({ tiId: ti.id, field, value }));
  }

  function finishEditing(value: string | null, refocus: boolean) {
    if (!editing) return;

    const { row, col } = editing;

    setEditing(null);

    if (value !== null && value.trim() !== valueAt(row, col)) {
      save(edit(row, col, value));
    }

    /// Поле исчезнет только после перерисовки — фокус возвращаем следом.
    if (refocus) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`[data-select-cell="${row}:${col}"]`)
          ?.focus(),
      );
    }
  }

  /// Клавиши правимой ячейки в режиме правки, как в Excel: Enter и F2 —
  /// править, набор текста — заменить, Delete — очистить выделенное. true —
  /// клавишу обработали, выделению она уже не нужна.
  function handleEditKeyDown(
    event: KeyboardEvent<HTMLTableCellElement>,
    row: number,
    col: number,
  ): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      setEditing({ row, col, initial: valueAt(row, col) });
      return true;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();

      save(
        selectedCells(col)
          .filter((cellRow) => valueAt(cellRow, col) !== '')
          .flatMap((cellRow) => edit(cellRow, col, '')),
      );
      return true;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      setEditing({ row, col, initial: event.key });
      return true;
    }

    return false;
  }

  /// Вставка из буфера, как в Excel: значения по одному на ячейку сверху
  /// вниз, начиная с верхней выделенной. Объединённая ячейка группы — одна
  /// ячейка, ей одно значение. Из блока в несколько колонок берём первую:
  /// выделение — в одной колонке, и вставка тоже. Лишнее за низом таблицы
  /// отбрасываем. Одно значение на несколько выделенных ячеек заполняет их
  /// все.
  function handlePaste(event: ClipboardEvent<HTMLTableCellElement>) {
    const range = selection.range;

    if (!range || EDITABLE_COLUMNS[range.col] === undefined) return;

    event.preventDefault();

    const col = range.col;
    const values = parseClipboard(
      event.clipboardData.getData('text/plain'),
    ).map((line) => line[0] ?? '');
    const targets =
      values.length === 1
        ? selectedCells(col).map((row) => [row, values[0]] as const)
        : cellStarts(col)
            .filter((row) => row >= range.top)
            .slice(0, values.length)
            .map((row, index) => [row, values[index]] as const);

    save(
      targets
        .filter(([row, value]) => value.trim() !== valueAt(row, col))
        .flatMap(([row, value]) => edit(row, col, value)),
    );
  }

  /// Строка, напротив которой кликнули. У объединённой ячейки это не
  /// обязательно её первая строка: клик в середине группы выделяет ТИ, что
  /// напротив курсора.
  function rowAt(event: MouseEvent<HTMLTableCellElement>, fallback: number) {
    const body = event.currentTarget.closest('tbody');

    if (!body) return fallback;

    const index = Array.from(body.rows).findIndex((tr) => {
      const rect = tr.getBoundingClientRect();

      return event.clientY >= rect.top && event.clientY < rect.bottom;
    });

    return index >= 0 ? index : fallback;
  }

  /// Текст строки для Ctrl+C — колонки через таб, как их отдаёт Excel. У
  /// объединённой ячейки значение лежит в её первой строке — ищем вверх.
  function rowText(row: number): string {
    return surveyTiColumns
      .map((_, col) => {
        for (let index = row; index >= 0; index--) {
          const cell = rows[index][col];

          if (cell !== null) return cell.v;
        }

        return '';
      })
      .join('\t');
  }

  /// Перейти к строке: выделить и прокрутить к ней. У первой, пустой колонки
  /// всегда есть ячейка, поэтому она остаётся надёжным ориентиром.
  function goToRow(row: number) {
    selectRow(row);
    document
      .querySelector(`[data-row-cell="${row}:0"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  /// Выделить одну строку — или снять выделение, если null.
  function selectRow(row: number | null) {
    setRowSelection(
      row === null ? NO_ROW_SELECTION : { rows: new Set([row]), active: row },
    );
  }

  /// Клавиши в режиме просмотра: стрелки — соседняя строка, Ctrl+C —
  /// скопировать выделенные строки, Escape — снять выделение.
  function handleRowKeyDown(event: KeyboardEvent<HTMLTableCellElement>) {
    const active = rowSelection.active;

    if (active === null) return;

    if (event.key === 'Escape') {
      selectRow(null);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void copyText(selectedRows.map(rowText).join('\n'));
      return;
    }

    const next =
      event.key === 'ArrowDown'
        ? Math.min(active + 1, rows.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(active - 1, 0)
          : null;

    if (next === null) return;

    /// Стрелки иначе прокрутили бы таблицу.
    event.preventDefault();
    goToRow(next);
  }

  /// Свойства ячеек при выборе строки: в просмотре клик в любую ячейку
  /// выделяет строку, в правке это делает только первая пустая колонка.
  /// Подсвечиваются только ячейки самой строки: объединённая ячейка группы,
  /// подсвеченная во всю высоту, читалась бы как выделение всей группы.
  /// Копируется строка всё же с ними — их значение относится и к этой ТИ.
  function rowCellProps(row: number, col: number): SurveyCellProps | undefined {
    /// Пустая таблица — одна строка-заглушка, выделять в ней нечего.
    if (optimisticTis.length === 0) return undefined;

    const covers =
      rowSelection.rows.has(row) && (rows[row][col]?.rowSpan ?? 1) === 1;

    return {
      'data-row-cell': `${row}:${col}`,
      /// Фокус нужен ради клавиш, но табом по каждой ячейке не ходим.
      tabIndex: -1,
      'aria-selected': covers,
      /// Клик выделяет одну строку, клик по единственной выделенной снимает
      /// выделение. С Ctrl (⌘) клик добавляет строку к выделению или убирает
      /// её оттуда.
      onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => {
        const clicked = rowAt(event, row);

        if (event.ctrlKey || event.metaKey) {
          /// Иначе браузер выделил бы ячейку таблицы (Firefox) или текст;
          /// фокус ради клавиш ставим сами.
          event.preventDefault();
          event.currentTarget.focus();
          setRowSelection(({ rows: current }) => {
            const next = new Set(current);

            if (next.has(clicked)) next.delete(clicked);
            else next.add(clicked);

            return next.size === 0
              ? NO_ROW_SELECTION
              : {
                  rows: next,
                  active: next.has(clicked) ? clicked : Math.max(...next),
                };
          });
          return;
        }

        setRowSelection(({ rows: current }) =>
          current.size === 1 && current.has(clicked)
            ? NO_ROW_SELECTION
            : { rows: new Set([clicked]), active: clicked },
        );
      },
      onKeyDown: handleRowKeyDown,
      className: cn(
        'cursor-pointer outline-none',
        covers && 'bg-blue-50 dark:bg-blue-950',
      ),
    };
  }

  /// Итог проверки для ячейки: ping — у IP, опрос — у «подключён».
  function checkStatus(row: number, col: number): CheckStatus | undefined {
    const ti = optimisticTis[row];

    if (!ti) return undefined;

    if (col === IP_COLUMN) {
      const ip = ti.group?.modem?.ip?.trim();

      return ip ? pings.get(ip) : undefined;
    }

    if (col === CONNECTED_COLUMN) {
      const state = connected.get(ti.id);

      return state?.status
        ? { ok: state.status === 'ok', error: state.error }
        : undefined;
    }

    return undefined;
  }

  /// Свойства ячеек: точка итога проверки в «IP» и «подключён» поверх того,
  /// что дал режим. Копируется строка без неё — точка лежит только в
  /// разметке. Поле правки точку не получает.
  function cellProps(row: number, col: number): SurveyCellProps | undefined {
    const props = modeCellProps(row, col);
    const ti = optimisticTis[row];

    /// Статус — точкой вместо текста. Текст остаётся значением ячейки: его
    /// копируют, вставляют и правят, а подпись видна в подсказке.
    if (col === STATUS_COLUMN && ti && !props?.children) {
      const label = tiStatusLabels[ti.status];

      return {
        ...props,
        title: label,
        className: cn(props?.className, 'text-center'),
        children: (
          <span
            role='img'
            aria-label={label}
            className={cn(
              'inline-block size-2.5 rounded-full align-middle',
              tiStatusDotColors[ti.status],
            )}
          />
        ),
      };
    }

    const status = checkStatus(row, col);

    if (!status || props?.children) return props;

    return {
      ...props,
      title: status.error,
      children: (
        <span className='inline-flex items-center gap-1.5'>
          <span
            aria-hidden
            className={cn(
              'size-2 shrink-0 rounded-full',
              status.ok ? 'bg-green-500' : 'bg-red-500',
            )}
          />
          {rows[row][col]?.v}
        </span>
      ),
    };
  }

  /// Свойства ячеек по режиму: в режиме просмотра — выделение строки, в
  /// режиме правки — выделение ячеек и правка правимых колонок.
  function modeCellProps(
    row: number,
    col: number,
  ): SurveyCellProps | undefined {
    if (!editable) return rowCellProps(row, col);

    const props = selection.cellProps(row, col);

    if (col === 0) {
      const rowProps = rowCellProps(row, col);

      if (!rowProps) return rowProps;

      return {
        ...rowProps,
        onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => {
          selection.clear();
          rowProps.onMouseDown?.(event);
        },
      };
    }

    if (!props) return props;

    const rowSelected =
      rowSelection.rows.has(row) && (rows[row][col]?.rowSpan ?? 1) === 1;
    const cellProps: SurveyCellProps = {
      ...props,
      'aria-selected': rowSelected || props['aria-selected'],
      onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => {
        selectRow(null);
        props.onMouseDown?.(event);
      },
      className: cn(
        props.className,
        rowSelected && 'bg-blue-50 dark:bg-blue-950',
      ),
    };

    if (EDITABLE_COLUMNS[col] === undefined) return cellProps;

    const isEditing = editing?.row === row && editing.col === col;

    return {
      ...cellProps,
      onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
        if (!handleEditKeyDown(event, row, col)) props.onKeyDown?.(event);
      },
      onDoubleClick: () => {
        if (!isEditing) setEditing({ row, col, initial: valueAt(row, col) });
      },
      onPaste: handlePaste,
      children: isEditing ? (
        <CellEditor initial={editing.initial} onDone={finishEditing} />
      ) : undefined,
    };
  }

  /// Пустое поле — Number('') = 0, его отсечёт проверка в экшене, и человек
  /// увидит, что не так. Проверять здесь второй раз незачем: экшен всё равно
  /// проверяет сам, его можно вызвать и в обход формы.
  /// Объединить выделенные ячейки «тех. решения»: их ТИ уходят в одну группу.
  /// Остаётся решение верхней — если в выделении их несколько разных,
  /// спрашиваем, прежде чем остальные пропадут.
  function handleMerge() {
    const range = selection.range;

    if (!range) return;

    const selected = tis.slice(range.top, range.bottom + 1);
    const solutions = [
      ...new Set(
        selected
          .map((ti) => ti.group?.technicalSolution)
          .filter((text): text is string => Boolean(text)),
      ),
    ];

    if (
      solutions.length > 1 &&
      !window.confirm(
        `Останется решение «${solutions[0]}». Остальные решения выделенных ТИ будут удалены. Объединить?`,
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await mergeTiGroups(
        projectId,
        selected.map((ti) => ti.id),
      );

      if (!result.ok) return setError(result.error);

      selection.clear();
    });
  }

  /// Разъединить объединённую ячейку «тех. решения»: верхняя ТИ остаётся в
  /// группе со всем общим, остальные выходят из неё. Ничего не удаляется,
  /// поэтому и не спрашиваем.
  function handleSplit() {
    const range = selection.range;

    if (!range) return;

    setError(null);
    startTransition(async () => {
      const result = await splitTiGroup(
        projectId,
        tis.slice(range.top, range.bottom + 1).map((ti) => ti.id),
      );

      if (!result.ok) return setError(result.error);

      selection.clear();
    });
  }

  /// Опросить счётчики: выделенных ТИ или, без выделения, всех. По одному:
  /// экшены Next.js из браузера всё равно идут очередью, а ТИ одной группы
  /// сидят на одном модеме и разом их не опросить. Итог каждой ТИ виден в
  /// колонке «подключён», как только он есть.
  function handleConnect() {
    const targets =
      selectedRows.length === 0
        ? optimisticTis
        : selectedRows.flatMap((row) => optimisticTis[row] ?? []);

    if (targets.length === 0) return;

    for (const ti of targets) {
      setConnectedText(ti.id, 'ждёт…');

      const ip = ti.group?.modem?.ip?.trim();

      if (ip) setPing(ip, null);
    }

    setConnectProgress(
      targets.length > 1 ? { done: 0, total: targets.length } : null,
    );
    startConnectTransition(async () => {
      /// Итоги ping за этот проход по IP: у ТИ одной группы модем один, и
      /// пинговать его за каждую ТИ незачем.
      const pinged = new Map<string, PingResult>();

      for (const [index, ti] of targets.entries()) {
        const ip = ti.group?.modem?.ip?.trim();

        if (ip && !pinged.has(ip)) {
          setConnectedText(ti.id, 'ping…');

          const ping = await pingTi(projectId, ti.id);

          pinged.set(ip, ping);
          setPing(
            ip,
            ping.ok ? { ok: true } : { ok: false, error: ping.error },
          );
        }

        /// Модем не отвечает на ping — к счётчику за ним не подключаемся.
        const ping = ip ? pinged.get(ip) : undefined;

        if (ping && !ping.ok) {
          setConnectedText(ti.id, 'не подключён', 'error', ping.error);
        } else {
          setConnectedText(ti.id, 'подключаемся…');

          const result = await connectMeter(projectId, ti.id);

          if (result.ok) {
            setConnectedText(ti.id, `№ ${result.reading.serialNumber}`, 'ok');
          } else {
            setConnectedText(ti.id, 'не подключён', 'error', result.error);
          }
        }

        if (targets.length > 1) {
          setConnectProgress({ done: index + 1, total: targets.length });
        }
      }
    });
  }

  /// Удалить ТИ выделенной строки. Удаление не отменить — спрашиваем.
  function handleDelete() {
    const tis = selectedRows.flatMap((row) => optimisticTis[row] ?? []);

    if (tis.length === 0) return;

    const question =
      tis.length === 1
        ? `Удалить ТИ «${[tis[0].number, tis[0].name].filter(Boolean).join(' ')}»?`
        : `Удалить выделенные ТИ (${tis.length})?`;

    if (!window.confirm(`${question} Это нельзя отменить.`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteTis(
        projectId,
        tis.map((ti) => ti.id),
      );

      if (!result.ok) return setError(result.error);

      selectRow(null);
    });
  }

  /// Поставить статус всем выделенным ТИ — теми же правками, что и вставка
  /// в колонку «статус»: одна транзакция и сразу видно в таблице.
  function handleSetStatus(status: TiStatus) {
    save(
      selectedRows.flatMap((row) => {
        const ti = optimisticTis[row];

        return ti
          ? [{ tiId: ti.id, field: 'status', value: tiStatusLabels[status] }]
          : [];
      }),
    );
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addTis(projectId, Number(addCount));
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      {/* shrink-0 — высоту делит таблица, панель не сжимается. */}
      <div className='flex h-12 shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
        {canEdit && (
          <Button
            variant={editable ? 'default' : 'outline'}
            aria-pressed={editable}
            onClick={() => {
              /// Режимы выделяют по-разному: при переключении старое выделение
              /// снимаем. Открытое поле правки закрываем без сохранения.
              setEditing(null);
              selectRow(null);
              selection.clear();
              setEditable((value) => !value);
            }}
          >
            {editable ? <Check /> : <Pencil />}
            {editable ? 'Готово' : 'Редактировать'}
          </Button>
        )}
        {/* Подключение — в режиме просмотра: к ТИ выделенной строки, а без
            выделения — ко всем ТИ по очереди. */}
        {!editable && (
          <Button
            variant='outline'
            disabled={optimisticTis.length === 0 || isConnecting}
            onClick={handleConnect}
          >
            <Plug />
            {isConnecting
              ? connectProgress
                ? `Connecting ${connectProgress.done}/${connectProgress.total}…`
                : 'Connecting…'
              : selectedRows.length === 0
                ? 'Connect all'
                : selectedRows.length === 1
                  ? 'Connect'
                  : `Connect ${selectedRows.length}`}
          </Button>
        )}
        {/* Добавление ТИ — только в режиме правки. Новые ТИ встают в конец
            таблицы с номерами по порядку и пустым наименованием. */}
        {editable && (
          <>
            <Input
              type='number'
              min={1}
              step={1}
              value={addCount}
              onChange={(event) => setAddCount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAdd();
              }}
              disabled={isPending}
              aria-label='Сколько ТИ добавить'
              className='w-16'
            />
            <Button variant='outline' onClick={handleAdd} disabled={isPending}>
              <Plus />
              {isPending ? 'Добавляем…' : 'Добавить ТИ'}
            </Button>
          </>
        )}
        {/* Статус выделенных ТИ — разом, без правки каждой ячейки. */}
        {editable &&
          selectedRows.some((row) => optimisticTis[row] !== undefined) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant='outline'>
                    Статус
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent>
                {Object.values(TiStatus).map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => handleSetStatus(status)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-2.5 rounded-full',
                        tiStatusDotColors[status],
                      )}
                    />
                    {tiStatusLabels[status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        {/* Удалить ТИ можно, когда выделены строки (кликом в первую колонку,
            с Ctrl — несколько). */}
        {editable &&
          selectedRows.some((row) => optimisticTis[row] !== undefined) && (
            <Button
              variant='outline'
              onClick={handleDelete}
              disabled={isPending}
              className='text-destructive'
            >
              <Trash2 />
              {selectedRows.length > 1
                ? `Удалить ТИ (${selectedRows.length})`
                : 'Удалить ТИ'}
            </Button>
          )}
        {/* Объединить решения можно, когда в «тех. решении» выделено две
            ячейки и больше: одну объединять не с чем. */}
        {editable &&
          selection.range?.col === SOLUTION_COLUMN &&
          selection.range.cells >= 2 && (
            <Button
              variant='outline'
              onClick={handleMerge}
              disabled={isPending}
            >
              <Merge />
              Объединить
            </Button>
          )}
        {/* Разъединить можно одну объединённую ячейку «тех. решения» — ту, что
            накрывает две строки и больше. */}
        {editable &&
          selection.range?.col === SOLUTION_COLUMN &&
          selection.range.cells === 1 &&
          selection.range.bottom > selection.range.top && (
            <Button
              variant='outline'
              onClick={handleSplit}
              disabled={isPending}
            >
              <Split />
              Разъединить
            </Button>
          )}
        {error && <span className='text-xs text-destructive'>{error}</span>}
      </div>
      <SurveyTable
        columns={surveyTiColumns}
        rows={rows}
        /// Пустая колонка, № и наименование ТИ не уезжают при прокрутке вбок: без них
        /// в правых колонках не понять, о какой ТИ строка.
        stickyColumns={3}
        /// Объединённые ячейки — группы ТИ: жирная граница строк во всю
        /// ширину показывает, где группа начинается и кончается.
        mergedBorders
        /// По одному значению в ячейке — по центру строки, а у объединённых
        /// посередине их группы.
        verticalAlign='middle'
        cellProps={cellProps}
        className='min-h-0 flex-1'
      />
    </>
  );
}
