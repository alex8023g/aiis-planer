'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import type { SurveyCell } from '@/app/projects/[id]/aiis2/survey-data';
import type { SurveyCellProps } from '@/components/SurveyTable';
import { copyText } from '@/lib/clipboard';

/// Рамка выделения — одна на весь отрезок, как в Excel: у каждой ячейки бока,
/// у верхней ещё верх, у нижней низ. Тенями внутрь, а не border: при
/// border-collapse рамки принадлежат таблице, а не ячейке, и соседние строки
/// делили бы их между собой. Классы целиком, без склейки: Tailwind находит
/// их только в таком виде.
const FRAME = {
  sides: 'shadow-[inset_2px_0_0_var(--frame),inset_-2px_0_0_var(--frame)]',
  top: 'shadow-[inset_2px_0_0_var(--frame),inset_-2px_0_0_var(--frame),inset_0_2px_0_var(--frame)]',
  bottom:
    'shadow-[inset_2px_0_0_var(--frame),inset_-2px_0_0_var(--frame),inset_0_-2px_0_var(--frame)]',
  both: 'shadow-[inset_2px_0_0_var(--frame),inset_-2px_0_0_var(--frame),inset_0_2px_0_var(--frame),inset_0_-2px_0_var(--frame)]',
} as const;

/// Выделенные строки в колонке: от верхней до нижней включительно.
export type CellRange = {
  col: number;
  top: number;
  bottom: number;
  /// Сколько ячеек выделено: объединённая — одна ячейка на все её строки.
  cells: number;
};

/// Где начинается и кончается ячейка, накрывающая строку: у объединённой
/// (rowSpan) это все её строки, у обычной — сама строка.
type Extent = { start: number[]; end: number[] };

/// Границы ячеек колонки. Накрытые объединением строки в rows — null: их
/// ячейка — ближайшая сверху непустая.
function extentOf(rows: SurveyCell[][], col: number): Extent {
  const start = rows.map((_, row) => row);
  const end = rows.map((_, row) => row);

  rows.forEach((cells, row) => {
    const cell = cells[col];

    /// Накрытую строку уже разметила её ячейка сверху — не затираем.
    if (cell === null) return;

    const span = cell?.rowSpan ?? 1;

    for (
      let covered = row;
      covered < row + span && covered < rows.length;
      covered++
    ) {
      start[covered] = row;
      end[covered] = row + span - 1;
    }
  });

  return { start, end };
}

/// Выделение ячеек таблицы, как в Excel, только по вертикали и в одной колонке
/// за раз: клик, Shift+клик, протягивание мышью, стрелки (с Shift — расширить),
/// Ctrl+A — вся колонка, Ctrl+C — скопировать, Escape — снять. Клик в другой
/// выделяемой колонке переносит выделение туда.
///
/// Объединённые ячейки выделяются целиком: клик берёт все их строки, стрелки
/// шагают от ячейки к ячейке, а отрезок расширяется до границ ячеек на концах.
export function useCellSelection({
  rows,
  columns,
}: {
  /// Строки таблицы — по ним видно объединения. Пустой массив — выделять
  /// нечего (у проекта нет ТИ, в таблице одна строка-заглушка).
  rows: SurveyCell[][];
  /// Индексы колонок, в которых можно выделять.
  columns: number[];
}) {
  /// col — колонка выделения, anchor — строка, с которой начали, head —
  /// текущая, на ней фокус. anchor и head всегда начала ячеек.
  const [selection, setSelection] = useState<{
    col: number;
    anchor: number;
    head: number;
  } | null>(null);
  /// Тянут ли мышь прямо сейчас. В ref: перерисовывать на каждое движение не
  /// нужно, важно лишь, расширять ли выделение при входе в ячейку.
  const dragging = useRef(false);

  const extents = useMemo(
    () => new Map(columns.map((col) => [col, extentOf(rows, col)])),
    [rows, columns],
  );

  /// Кнопку могут отпустить где угодно, в том числе вне таблицы, — слушаем
  /// документ, иначе выделение продолжило бы тянуться за курсором.
  useEffect(() => {
    function stop() {
      dragging.current = false;
    }

    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  }, []);

  /// Строк стало меньше (ТИ удалили) — выделение не должно указывать мимо
  /// таблицы. Подрезаем при чтении, а не эффектом: так нет кадра с
  /// выделением несуществующих строк.
  const last = rows.length - 1;
  const extent = selection ? extents.get(selection.col) : undefined;
  const clampStart = (row: number) =>
    extent ? extent.start[Math.min(Math.max(row, 0), last)] : row;

  const head =
    selection && extent && last >= 0 ? clampStart(selection.head) : null;
  let range: CellRange | null = null;

  if (selection && extent && head !== null) {
    const anchor = clampStart(selection.anchor);

    const top = extent.start[Math.min(anchor, head)];
    const bottom = extent.end[Math.max(anchor, head)];
    let cells = 0;

    /// Ячейка начинается там, где строка сама себе начало.
    for (let row = top; row <= bottom; row++) {
      if (extent.start[row] === row) cells++;
    }

    range = { col: selection.col, top, bottom, cells };
  }

  /// Фокус держим на текущей ячейке: с него работают стрелки и Ctrl+C, и он
  /// же подтягивает ячейку в видимую часть при прокрутке.
  const focusKey =
    selection && head !== null ? `${head}:${selection.col}` : null;

  useEffect(() => {
    if (focusKey === null) return;

    document
      .querySelector<HTMLElement>(`[data-select-cell="${focusKey}"]`)
      ?.focus();
  }, [focusKey]);

  function select(row: number, col: number, extend: boolean) {
    setSelection((current) =>
      extend && current && current.col === col
        ? { ...current, head: row }
        : { col, anchor: row, head: row },
    );
  }

  /// Протягивание тянет выделение только в колонке, где его начали: заехав
  /// мышью в соседнюю выделяемую колонку, выделение туда не переносим.
  function dragTo(row: number, col: number) {
    setSelection((current) =>
      current && current.col === col ? { ...current, head: row } : current,
    );
  }

  function clear() {
    setSelection(null);
  }

  /// Текст выделенного в том виде, в каком колонку отдаёт Excel: по строке на
  /// строку таблицы, у объединённой ячейки текст в её первой строке, а под
  /// ним пустые. Так вставка в Excel ложится строка в строку.
  function selectionText(): string {
    if (!range) return '';

    const columnExtent = extents.get(range.col);

    if (!columnExtent) return '';

    const lines = [];

    for (let row = range.top; row <= range.bottom; row++) {
      lines.push(
        columnExtent.start[row] === row ? (rows[row][range.col]?.v ?? '') : '',
      );
    }

    return lines.join('\n');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableCellElement>) {
    if (!selection || !extent || head === null) return;

    if (event.key === 'Escape') {
      clear();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();

      /// Ctrl+A — вся колонка, а не вся страница.
      if (key === 'a') {
        event.preventDefault();
        setSelection({
          col: selection.col,
          anchor: 0,
          head: extent.start[last],
        });
        return;
      }

      /// Копируем сами: текст на странице не выделен (select-none), браузеру
      /// копировать нечего.
      if (key === 'c') {
        event.preventDefault();
        void copyText(selectionText());
        return;
      }
    }

    /// Шаг — к соседней ячейке, а не строке: из объединённой вниз попадаем в
    /// ячейку под всеми её строками.
    const next =
      event.key === 'ArrowDown'
        ? extent.end[head] + 1
        : event.key === 'ArrowUp'
          ? head - 1
          : null;

    if (next === null) return;

    /// Стрелки иначе прокрутили бы таблицу.
    event.preventDefault();
    select(clampStart(next), selection.col, event.shiftKey);
  }

  /// Свойства ячеек для SurveyTable.cellProps: только у выделяемых колонок.
  /// Таблица зовёт его только для нарисованных ячеек — у объединённой это её
  /// первая строка.
  function cellProps(row: number, col: number): SurveyCellProps | undefined {
    const cellExtent = extents.get(col);

    if (!cellExtent || last < 0) return undefined;

    const end = cellExtent.end[row];
    const selected =
      range !== null &&
      range.col === col &&
      row <= range.bottom &&
      end >= range.top;
    const active = selection?.col === col && head === row;
    const isTop = selected && range !== null && row <= range.top;
    const isBottom = selected && range !== null && end >= range.bottom;
    /// Пока ничего не выделено, табом попадаем в первую ячейку первой колонки.
    const tabStop = selection ? active : row === 0 && col === columns[0];

    return {
      'data-select-cell': `${row}:${col}`,
      /// Фокус переходит по стрелкам, поэтому в порядок обхода табом попадает
      /// только текущая ячейка.
      tabIndex: tabStop ? 0 : -1,
      'aria-selected': selected,
      onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => {
        /// Иначе браузер начал бы выделять текст, а фокус ушёл бы не туда.
        event.preventDefault();
        dragging.current = true;
        select(row, col, event.shiftKey);
      },
      onMouseEnter: () => {
        if (dragging.current) dragTo(row, col);
      },
      onKeyDown: handleKeyDown,
      /// Фон непрозрачный: колонка бывает липкой, и сквозь полупрозрачный было
      /// бы видно уезжающие под неё ячейки. Браузерную рамку фокуса прячем:
      /// её заменяет рамка выделения.
      className: [
        'cursor-cell select-none outline-none',
        selected &&
          '[--frame:var(--color-blue-500)] dark:[--frame:var(--color-blue-400)]',
        selected && 'bg-blue-50 dark:bg-blue-950',
        selected &&
          FRAME[
            isTop && isBottom
              ? 'both'
              : isTop
                ? 'top'
                : isBottom
                  ? 'bottom'
                  : 'sides'
          ],
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  return { range, cellProps, clear };
}
