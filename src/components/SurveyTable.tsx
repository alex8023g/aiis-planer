import type { CSSProperties, HTMLAttributes, TdHTMLAttributes } from 'react';

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

/// Строки, после которых проходит граница группы: последняя строка каждой
/// объединённой ячейки и строка над её первой. Граница одна на стык, поэтому
/// у соседних групп она не двоится. Первая строка таблицы — особый случай:
/// над ней шапка, и её граница — верх таблицы (-1).
function groupBoundaries(rows: SurveyCell[][]): Set<number> {
  const boundaries = new Set<number>();

  rows.forEach((row, rowIndex) => {
    for (const cell of row) {
      const span = cell?.rowSpan ?? 1;

      if (span < 2) continue;

      boundaries.add(rowIndex - 1);
      boundaries.add(rowIndex + span - 1);
    }
  });

  return boundaries;
}

/// Строки под объединёнными ячейками — те, что входят в группу из двух и
/// больше строк.
function groupedRows(rows: SurveyCell[][]): Set<number> {
  const grouped = new Set<number>();

  rows.forEach((row, rowIndex) => {
    for (const cell of row) {
      const span = cell?.rowSpan ?? 1;

      for (
        let covered = rowIndex;
        span > 1 && covered < rowIndex + span;
        covered++
      ) {
        grouped.add(covered);
      }
    }
  });

  return grouped;
}

/// Жирный левый край строки группы — как скобка вдоль её строк. Тенью внутрь
/// первой ячейки, а не border: первая колонка обычно липкая, а рамка при
/// border-collapse принадлежит таблице и уехала бы при прокрутке вбок.
/// Если первая колонка — последняя липкая, у неё уже есть тень справа; тени
/// в одном классе, иначе одна затёрла бы другую.
const GROUP_EDGE =
  '[--group-edge:var(--color-neutral-400)] dark:[--group-edge:var(--color-neutral-600)] shadow-[inset_2px_0_0_var(--group-edge)]';
const GROUP_EDGE_LAST_STICKY =
  '[--group-edge:var(--color-neutral-400)] dark:[--group-edge:var(--color-neutral-600)] shadow-[inset_2px_0_0_var(--group-edge),inset_-1px_0_0_var(--color-neutral-200)] dark:shadow-[inset_2px_0_0_var(--group-edge),inset_-1px_0_0_var(--color-neutral-800)]';

/// Что вызывающий может добавить ячейке: обработчики, tabIndex, aria-, data-
/// и классы (они ложатся последними и перекрывают свои). Объединение и стиль
/// задаёт таблица — их отсюда не переопределить.
export type SurveyCellProps = Omit<
  TdHTMLAttributes<HTMLTableCellElement>,
  'rowSpan' | 'colSpan' | 'style'
> & { [data: `data-${string}`]: string | number | undefined };

export type SurveyRowProps = HTMLAttributes<HTMLTableRowElement>;

/// Таблица опроса из выгрузки Numbers — только показ: ни сортировки, ни правки,
/// ни сохранения. Серверный компонент: данные статические, на клиенте живут
/// только ручки ширины колонок и замер липких колонок. Выделение и прочее
/// поведение ячеек — у вызывающего, через cellProps.
export function SurveyTable({
  columns,
  rows,
  stickyColumns = 0,
  mergedBorders = false,
  verticalAlign = 'top',
  rowProps,
  cellProps,
  className,
}: {
  columns: SurveyColumn[];
  rows: SurveyCell[][];
  /// Сколько колонок слева не уезжает при прокрутке вбок. Считаются по
  /// индексу ячейки в строке, поэтому colSpan в них не годится.
  stickyColumns?: number;
  /// Выделять ли объединённые ячейки жирными верхом и низом.
  /// Жирная граница строк вокруг объединённых ячеек — во всю ширину
  /// таблицы, — и жирный левый край у строк группы: видно, где группа
  /// начинается, кончается и какие строки в неё входят.
  mergedBorders?: boolean;
  /// Как прижать содержимое ячеек по высоте, если сама ячейка не сказала
  /// иначе (SurveyCell.align). К верху — когда строки сверяют построчно, как
  /// пофазные ячейки aiis3; по центру — когда в строке по одному значению и
  /// объединённые ячейки должны держать текст посередине своих строк.
  verticalAlign?: 'top' | 'middle';
  /// Свойства строки по индексу, например обработчики выбора строки.
  rowProps?: (row: number) => SurveyRowProps | undefined;
  /// Свойства ячейки по её строке и колонке (индексы в rows). Передаёт только
  /// клиентский вызывающий: функцию с сервера в браузер не передать.
  cellProps?: (row: number, col: number) => SurveyCellProps | undefined;
  /// Высоту задаёт страница: таблица не знает, сколько места ей осталось под
  /// шапкой, и сама себя по экрану не режет.
  className?: string;
}) {
  const boundaries = mergedBorders ? groupBoundaries(rows) : null;
  const grouped = mergedBorders ? groupedRows(rows) : null;

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
        {rows.map((row, rowIndex) => {
          const extraRow = rowProps?.(rowIndex);

          return (
            <tr
              {...extraRow}
              key={rowIndex}
              /// Границу строк рисуем на самой строке: при border-collapse
              /// побеждает более толстая, и 2px перекрывают и обычную линию, и
              /// низ объединённой ячейки, и стык под липкими колонками.
              className={cn(
                extraRow?.className,
                /// У последней строки тоже: таблица обычно ниже рамки не доходит,
                /// и без черты низ последней строки сливается с пустотой под ней.
                'border-b border-neutral-100 dark:border-neutral-800/60',
                boundaries?.has(rowIndex) &&
                  'border-b-2 border-neutral-400 dark:border-neutral-600',
                rowIndex === 0 &&
                  boundaries?.has(-1) &&
                  'border-t-2 border-t-neutral-400 dark:border-t-neutral-600',
              )}
            >
              {row.map((cell, columnIndex) => {
                /// Накрытую объединением ячейку не рисуем совсем — иначе строка
                /// разъедется вправо на ширину лишней колонки.
                if (cell === null) return null;

                const sticky = columnIndex < stickyColumns;
                const extra = cellProps?.(rowIndex, columnIndex);

                return (
                  <td
                    {...extra}
                    key={columnIndex}
                    rowSpan={cell.rowSpan}
                    colSpan={cell.colSpan}
                    style={
                      sticky ? stickyStyle(columns, columnIndex) : undefined
                    }
                    /// Переносы строк внутри ячейки значимы: в опросе ими
                    /// разделены варианты решения.
                    className={cn(
                      'px-4 py-2 whitespace-pre-line',
                      (cell.align ?? verticalAlign) === 'middle'
                        ? 'align-middle'
                        : 'align-top',
                      cell.bordered &&
                        'border border-neutral-200 dark:border-neutral-800',
                      sticky && stickyClass(columnIndex, stickyColumns),
                      columnIndex === 0 &&
                        grouped?.has(rowIndex) &&
                        (stickyColumns === 1
                          ? GROUP_EDGE_LAST_STICKY
                          : GROUP_EDGE),
                      extra?.className,
                    )}
                  >
                    {/* Вызывающий может подменить содержимое — например, полем
                      правки ячейки. */}
                    {extra?.children ?? cell.v}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </SurveyTableFrame>
  );
}
