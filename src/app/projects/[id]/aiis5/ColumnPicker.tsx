'use client';

import { Columns3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  columnGroups,
  columnPresets,
  tableColumns,
  type ColumnGroup,
} from './columns';

/// Колонки, которые можно скрыть, по разделам меню.
const hideableByGroup = (Object.keys(columnGroups) as ColumnGroup[]).map(
  (group) => ({
    group,
    columns: tableColumns.filter(
      (column) => column.group === group && column.hideable !== false,
    ),
  }),
);
const hideableCount = hideableByGroup.reduce(
  (sum, { columns }) => sum + columns.length,
  0,
);

/// Меню «Колонки»: готовые наборы, разделы целиком и каждая колонка
/// отдельно. Меню не закрывается по клику — так можно отметить несколько
/// колонок подряд.
export function ColumnPicker({
  hidden,
  setVisible,
  setHiddenIds,
}: {
  hidden: ReadonlySet<string>;
  setVisible: (ids: string[], visible: boolean) => void;
  setHiddenIds: (ids: string[]) => void;
}) {
  const hiddenCount = tableColumns.filter(
    (column) => column.hideable !== false && hidden.has(column.id),
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant='outline'>
            <Columns3 />
            Колонки
            {hiddenCount > 0 && (
              <span className='text-neutral-500 dark:text-neutral-400'>
                {hideableCount - hiddenCount}/{hideableCount}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent className='max-h-[70vh] w-72 overflow-y-auto'>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Наборы</DropdownMenuLabel>
          {columnPresets.map((preset) => (
            <DropdownMenuItem
              key={preset.label}
              onClick={() => setHiddenIds(preset.hidden())}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {hideableByGroup.map(({ group, columns }) => {
          if (columns.length === 0) return null;

          const ids = columns.map((column) => column.id);
          const shown = ids.filter((id) => !hidden.has(id)).length;

          return (
            <DropdownMenuGroup key={group}>
              <DropdownMenuSeparator />
              {/* Раздел целиком: отмечен, когда видны все его колонки;
                  клик показывает все, а если все уже видны — скрывает. */}
              <DropdownMenuCheckboxItem
                checked={shown === ids.length}
                closeOnClick={false}
                onCheckedChange={() => setVisible(ids, shown !== ids.length)}
                className='font-medium'
              >
                {columnGroups[group]}
                <span className='text-xs font-normal text-neutral-500 dark:text-neutral-400'>
                  {shown}/{ids.length}
                </span>
              </DropdownMenuCheckboxItem>
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={!hidden.has(column.id)}
                  closeOnClick={false}
                  onCheckedChange={(checked) =>
                    setVisible([column.id], checked)
                  }
                  inset
                >
                  {column.title}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
