import type { CSSProperties } from 'react';

import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import { cn } from '@/lib/utils';

import { ResizableHeaderCell } from './ResizableHeaderCell';
import { SurveyTableFrame } from './SurveyTableFrame';

/// Отступ слева у липкой колонки: переменную ставит SurveyTableFrame по
/// замеру заголовков. До замера — сумма minWidth предыдущих колонок: так
/// колонки не налезают друг на друга и в первом кадре.
function stickyStyle(columns: SurveyColumn[], index: number): CSSProperties {
  const fallback = columns
    .slice(0, index)
    .reduce((sum, column) => sum + column.minWidth, 0);

  return { left: `var(--sticky-left-${index}, ${fallback}px)` };
}

/// Липкая ячейка: фон обязателен — иначе сквозь неё видно уезжающие под неё
/// колонки. z-index тоже: заголовки все позиционированы (relative — ради ручки
/// ширины), и без него следующие в строке рисуются поверх липких. У последней липкой — тень справа вместо рамки: рамки при
/// border-collapse принадлежат таблице и вместе с ячейкой не липнут.
function stickyClass(index: number, stickyColumns: number): string {
  return cn(
    'sticky z-1 bg-white dark:bg-neutral-900',
    index === stickyColumns - 1 &&
      'shadow-[inset_-1px_0_0_var(--color-neutral-200)] dark:shadow-[inset_-1px_0_0_var(--color-neutral-800)]',
  );
}

/// Таблица опроса из выгрузки Numbers — только показ: ни сортировки, ни правки,
/// ни сохранения. Серверный компонент: данные статические, на клиенте живут
/// только ручки ширины колонок и замер липких колонок.
export function SurveyTable({
  columns,
  rows,
  stickyColumns = 0,
  className,
}: {
  columns: SurveyColumn[];
  rows: SurveyCell[][];
  /// Сколько колонок слева не уезжает при прокрутке вбок. Считаются по
  /// индексу ячейки в строке, поэтому colSpan в них не годится.
  stickyColumns?: number;
  /// Высоту задаёт страница: таблица не знает, сколько места ей осталось под
  /// шапкой, и сама себя по экрану не режет.
  className?: string;
}) {
  return (
    <SurveyTableFrame stickyColumns={stickyColumns} className={className}>
      {/* Заголовки липнут к верху прокрутки: таблица длинная, и без них к
          середине уже не понять, что в колонке. */}
      <thead className='sticky top-0 z-10 text-xs text-neutral-500 dark:text-neutral-400'>
        <tr className='border-b border-neutral-200 dark:border-neutral-800'>
          {columns.map((column, index) => {
            const sticky = index < stickyColumns;

            return (
              /// Ширину любой колонки можно тянуть мышью за правый край.
              /// Фон — на самой ячейке, а не на thead: фон секции таблицы
              /// Chrome под липким заголовком не рисует, и сквозь него видно
              /// уезжающие строки.
              <ResizableHeaderCell
                key={index}
                minWidth={column.minWidth}
                style={sticky ? stickyStyle(columns, index) : undefined}
                className={cn(
                  'bg-white px-4 py-3 align-bottom font-medium dark:bg-neutral-900',
                  sticky && stickyClass(index, stickyColumns),
                )}
              >
                {column.title}
              </ResizableHeaderCell>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            className='border-b border-neutral-100 last:border-0 dark:border-neutral-800/60'
          >
            {row.map((cell, columnIndex) => {
              /// Накрытую объединением ячейку не рисуем совсем — иначе строка
              /// разъедется вправо на ширину лишней колонки.
              if (cell === null) return null;

              const sticky = columnIndex < stickyColumns;

              return (
                <td
                  key={columnIndex}
                  rowSpan={cell.rowSpan}
                  colSpan={cell.colSpan}
                  style={sticky ? stickyStyle(columns, columnIndex) : undefined}
                  /// Переносы строк внутри ячейки значимы: в опросе ими
                  /// разделены варианты решения.
                  className={cn(
                    'px-4 py-2 whitespace-pre-line',
                    cell.align === 'middle' ? 'align-middle' : 'align-top',
                    cell.bordered &&
                      'border border-neutral-200 dark:border-neutral-800',
                    sticky && stickyClass(columnIndex, stickyColumns),
                  )}
                >
                  {cell.v}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </SurveyTableFrame>
  );
}
