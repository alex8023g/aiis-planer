'use client';

import { useId, useRef, type SyntheticEvent } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type CellChoiceOption = { value: string; label: string };

/// Правка ячейки выбором из списка — для колонок, где значений всего
/// несколько и набирать их незачем. Тот же уговор, что у CellEditor: onDone
/// зовут один раз, value — что сохранить, null — отмена.
export function CellChoice({
  initial,
  options,
  onDone,
}: {
  initial: string;
  options: CellChoiceOption[];
  onDone: (value: string | null, refocus: boolean) => void;
}) {
  const triggerId = useId();
  const done = useRef(false);

  function finish(result: string | null, refocus: boolean) {
    if (done.current) return;

    done.current = true;
    onDone(result, refocus);
  }

  /// Меню рисуется в портале, но React-события из него всплывают к ячейке:
  /// без этого Enter в меню начал бы правку заново, а клик сбил бы выделение.
  const stop = (event: SyntheticEvent) => event.stopPropagation();

  return (
    <DropdownMenu
      defaultOpen
      defaultTriggerId={triggerId}
      onOpenChange={(open, details) => {
        /// Выбор пункта закрывает меню сам — значение сохраняет onClick.
        if (!open && details.reason !== 'item-press') {
          finish(null, details.reason === 'escape-key');
        }
      }}
    >
      <DropdownMenuTrigger
        id={triggerId}
        onMouseDown={stop}
        onDoubleClick={stop}
        onKeyDown={stop}
        className='w-full text-left outline-none'
      >
        {initial || ' '}
      </DropdownMenuTrigger>
      {/* Фокус после закрытия возвращает onDone (refocus) — ячейке, а не
          кнопке меню: та исчезает вместе с правкой. */}
      <DropdownMenuContent
        finalFocus={false}
        onMouseDown={stop}
        onDoubleClick={stop}
        onKeyDown={stop}
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => finish(option.value, true)}
            className={cn(option.value === initial && 'font-medium')}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
