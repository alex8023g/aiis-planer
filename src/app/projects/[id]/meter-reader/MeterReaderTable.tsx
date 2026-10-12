'use client';

import {
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

import type { SurveyColumn } from '@/app/projects/[id]/aiis2/survey-data';
import { useCellSelection } from '@/app/projects/[id]/aiis4/useCellSelection';
import { CellEditor } from '@/components/CellEditor';
import { SurveyTable, type SurveyCellProps } from '@/components/SurveyTable';
import { parseClipboard } from '@/lib/clipboard';
import { text } from '@/lib/survey-cells';
import type { MeterReaderTi } from '@/lib/tis';

import {
  updateMeterReaderCells,
  type MeterReaderEdit,
  type MeterReaderField,
} from './actions';

const columns: SurveyColumn[] = [
  { title: 'TI_name', minWidth: 240 },
  { title: 'ip', minWidth: 140 },
  { title: 'port', minWidth: 100 },
  { title: 'connect_address', minWidth: 140 },
];

/// Поле ТИ под каждой колонкой — в том же порядке, что и columns.
const FIELDS: MeterReaderField[] = ['name', 'ip', 'port', 'connectAddress'];

/// Выделять можно в любой колонке — таблица для того и есть, чтобы
/// копировать адреса в опросчик.
const SELECTABLE_COLUMNS = columns.map((_, index) => index);

/// Правки поверх ТИ — то, что видно в таблице, пока экшен пишет в базу.
/// IP общий на группу, но кто с кем в группе, клиент не знает: соседи по
/// группе обновятся, когда придёт ответ сервера.
function applyEdits(tis: MeterReaderTi[], edits: MeterReaderEdit[]) {
  return tis.map((ti) => {
    const own = edits.filter((edit) => edit.tiId === ti.id);

    if (own.length === 0) return ti;

    const next = { ...ti };

    for (const { field, value } of own) {
      const trimmed = value.trim();

      if (field === 'name') next.name = trimmed;
      /// Остальные поля правит только опрос (aiis4) — в этой таблице их нет.
      else if (
        field === 'ip' ||
        field === 'port' ||
        field === 'connectAddress'
      ) {
        next[field] = trimmed === '' ? null : trimmed;
      }
    }

    return next;
  });
}

/// Таблица MeterReader. Ячейки выделяются, как в Excel (см.
/// useCellSelection), а у кого есть право менять проект — ещё и правятся:
/// двойной клик, Enter, F2 или просто набор текста; Delete очищает
/// выделенное; Ctrl+V вставляет из буфера блоком, начиная с верхней
/// выделенной ячейки.
export function MeterReaderTable({
  projectId,
  tis,
  canEdit,
}: {
  projectId: string;
  tis: MeterReaderTi[];
  /// Может ли пользователь менять проект (см. canEditProject). Без права
  /// таблица только выделяет и копирует.
  canEdit: boolean;
}) {
  const [optimisticTis, addEdits] = useOptimistic(tis, applyEdits);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /// Ячейка, которая сейчас правится, и с какого текста начали.
  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    initial: string;
  } | null>(null);

  const rows = useMemo(
    () =>
      optimisticTis.map((ti) => [
        text(ti.name),
        text(ti.ip),
        text(ti.port),
        text(ti.connectAddress),
      ]),
    [optimisticTis],
  );
  const selection = useCellSelection({ rows, columns: SELECTABLE_COLUMNS });

  function save(edits: MeterReaderEdit[]) {
    if (edits.length === 0) return;

    setError(null);
    /// Если экшен не прошёл, оптимистичные значения откатятся сами: они
    /// живут, только пока идёт переход.
    startTransition(async () => {
      addEdits(edits);
      const result = await updateMeterReaderCells(projectId, edits);

      if (!result.ok) setError(result.error);
    });
  }

  function valueAt(row: number, col: number): string {
    return rows[row]?.[col]?.v ?? '';
  }

  function edit(row: number, col: number, value: string): MeterReaderEdit {
    return { tiId: optimisticTis[row].id, field: FIELDS[col], value };
  }

  function focusCell(row: number, col: number) {
    document
      .querySelector<HTMLElement>(`[data-select-cell="${row}:${col}"]`)
      ?.focus();
  }

  function finishEditing(value: string | null, refocus: boolean) {
    if (!editing) return;

    const { row, col } = editing;

    setEditing(null);

    if (value !== null && value.trim() !== valueAt(row, col)) {
      save([edit(row, col, value)]);
    }

    /// Поле исчезнет только после перерисовки — фокус возвращаем следом.
    if (refocus) requestAnimationFrame(() => focusCell(row, col));
  }

  /// Ячейки под выделением — для Delete и вставки одного значения.
  function selectedCells(): { row: number; col: number }[] {
    const range = selection.range;

    if (!range) return [];

    return Array.from({ length: range.bottom - range.top + 1 }, (_, index) => ({
      row: range.top + index,
      col: range.col,
    }));
  }

  function handleKeyDown(
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
        selectedCells()
          .filter((cell) => valueAt(cell.row, cell.col) !== '')
          .map((cell) => edit(cell.row, cell.col, '')),
      );
      return true;
    }

    /// Набор с клавиатуры, как в Excel, заменяет содержимое ячейки.
    if (event.key.length === 1) {
      event.preventDefault();
      setEditing({ row, col, initial: event.key });
      return true;
    }

    return false;
  }

  /// Вставка блоком: верхний левый угол — верхняя выделенная ячейка, лишнее
  /// справа и снизу за краем таблицы отбрасываем. Одно значение на несколько
  /// выделенных ячеек заполняет их все, как в Excel.
  function handlePaste(event: ClipboardEvent<HTMLTableCellElement>) {
    const range = selection.range;

    if (!range) return;

    event.preventDefault();

    const block = parseClipboard(event.clipboardData.getData('text/plain'));
    const single = block.length === 1 && block[0].length === 1;
    const edits: MeterReaderEdit[] = [];

    if (single) {
      for (const cell of selectedCells()) {
        edits.push(edit(cell.row, cell.col, block[0][0]));
      }
    } else {
      block.forEach((line, rowOffset) => {
        const row = range.top + rowOffset;

        if (row >= rows.length) return;

        line.forEach((value, colOffset) => {
          const col = range.col + colOffset;

          if (col < columns.length) edits.push(edit(row, col, value));
        });
      });
    }

    save(edits);
  }

  function cellProps(row: number, col: number): SurveyCellProps | undefined {
    const props = selection.cellProps(row, col);

    if (!canEdit || !props) return props;

    const isEditing = editing?.row === row && editing.col === col;

    return {
      ...props,
      onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
        if (!handleKeyDown(event, row, col)) props.onKeyDown?.(event);
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

  return (
    <div className='flex flex-col gap-2'>
      {error && (
        <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
      )}
      <SurveyTable columns={columns} rows={rows} cellProps={cellProps} />
    </div>
  );
}
