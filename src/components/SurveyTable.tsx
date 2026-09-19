import type {
  SurveyCell,
  SurveyColumn,
} from '@/app/projects/[id]/aiis2/survey-data';
import { cn } from '@/lib/utils';

import { ResizableHeaderCell } from './ResizableHeaderCell';

/// Таблица опроса из выгрузки Numbers — только показ: ни сортировки, ни правки,
/// ни сохранения. Серверный компонент: данные статические, на клиенте живут
/// только ручки ширины колонок.
export function SurveyTable({
  columns,
  rows,
  className,
}: {
  columns: SurveyColumn[];
  rows: SurveyCell[][];
  /// Высоту задаёт страница: таблица не знает, сколько места ей осталось под
  /// шапкой, и сама себя по экрану не режет.
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      <table className='w-full text-left text-sm'>
        {/* Заголовки липнут к верху прокрутки: таблица длинная, и без них к
            середине уже не понять, что в колонке. */}
        <thead className='sticky top-0 z-10 text-xs text-neutral-500 dark:text-neutral-400'>
          <tr className='border-b border-neutral-200 dark:border-neutral-800'>
            {columns.map((column, index) => (
              /// Ширину любой колонки можно тянуть мышью за правый край.
              /// Фон — на самой ячейке, а не на thead: фон секции таблицы
              /// Chrome под липким заголовком не рисует, и сквозь него видно
              /// уезжающие строки.
              <ResizableHeaderCell
                key={index}
                minWidth={column.minWidth}
                className='bg-white px-4 py-3 align-bottom font-medium dark:bg-neutral-900'
              >
                {column.title}
              </ResizableHeaderCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className='border-b border-neutral-100 last:border-0 dark:border-neutral-800/60'
            >
              {row.map((cell, columnIndex) =>
                /// Накрытую объединением ячейку не рисуем совсем — иначе строка
                /// разъедется вправо на ширину лишней колонки.
                cell === null ? null : (
                  <td
                    key={columnIndex}
                    rowSpan={cell.rowSpan}
                    colSpan={cell.colSpan}
                    /// Переносы строк внутри ячейки значимы: в опросе ими
                    /// разделены варианты решения.
                    className='px-4 py-2 align-top whitespace-pre-line'
                  >
                    {cell.v}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
