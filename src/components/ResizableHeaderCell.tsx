'use client';

import { useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/// Заголовок колонки, ширину которой можно тянуть мышью за правый край.
/// Двойной щелчок по ручке возвращает ширину, которую выбрал браузер.
export function ResizableHeaderCell({
  children,
  minWidth,
  className,
}: {
  children: ReactNode;
  /// Меньше этого мышью не сжимаем — иначе ручка уезжает от курсора: CSS
  /// колонку уже не сужает, а ширина в состоянии продолжает падать.
  minWidth: number;
  className?: string;
}) {
  const cellRef = useRef<HTMLTableCellElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [width, setWidth] = useState<number>();

  return (
    <th
      ref={cellRef}
      style={width === undefined ? { minWidth } : { width, minWidth: width }}
      className={cn('relative', className)}
    >
      {children}
      <div
        role='separator'
        aria-orientation='vertical'
        aria-label='Изменить ширину колонки'
        title='Потяните, чтобы изменить ширину; двойной щелчок — сбросить'
        className='absolute inset-y-0 -right-1.5 w-3 cursor-col-resize touch-none select-none after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-neutral-200 hover:after:w-0.5 hover:after:bg-neutral-400 dark:after:bg-neutral-700 dark:hover:after:bg-neutral-500'
        onPointerDown={(event) => {
          const cell = cellRef.current;
          if (!cell) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            startX: event.clientX,
            startWidth: cell.getBoundingClientRect().width,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          setWidth(
            Math.max(minWidth, drag.startWidth + event.clientX - drag.startX),
          );
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onDoubleClick={() => setWidth(undefined)}
      />
    </th>
  );
}
