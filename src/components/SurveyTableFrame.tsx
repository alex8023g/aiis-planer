'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/// Прокручиваемая рамка таблицы опроса. Клиентская только ради замера
/// липких колонок; строки приходят готовыми с сервера.
///
/// Отступ слева у липкой колонки — сумма ширин колонок перед ней. Ширину
/// выбирает браузер, а потом её тянут мышью (ResizableHeaderCell), поэтому
/// посчитать заранее нельзя: меряем заголовки и кладём отступы в
/// CSS-переменные --sticky-left-N на таблице (см. stickyLeft в SurveyTable).
export function SurveyTableFrame({
  stickyColumns,
  className,
  children,
}: {
  stickyColumns: number;
  className?: string;
  children: ReactNode;
}) {
  const tableRef = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    const table = tableRef.current;

    if (!table || stickyColumns === 0) return;

    const headers = Array.from(
      table.querySelectorAll<HTMLTableCellElement>('thead th'),
    ).slice(0, stickyColumns);

    const update = () => {
      let left = 0;

      headers.forEach((header, index) => {
        table.style.setProperty(`--sticky-left-${index}`, `${left}px`);
        left += header.getBoundingClientRect().width;
      });
    };

    const observer = new ResizeObserver(update);

    headers.forEach((header) => observer.observe(header));
    update();

    return () => observer.disconnect();
  }, [stickyColumns]);

  return (
    <div
      className={cn(
        'overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      <table ref={tableRef} className='w-full text-left text-sm'>
        {children}
      </table>
    </div>
  );
}
