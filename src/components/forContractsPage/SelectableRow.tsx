'use client';

import {
  createContext,
  startTransition,
  useContext,
  useOptimistic,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { useContractSelection } from '@/components/forContractsPage/useContractSelection';

const SelectionContext = createContext<{
  selectedId: string | null;
  toggle: (id: string) => void;
}>({ selectedId: null, toggle: () => {} });

/// Выбор строки хранится в адресе (?contract=<id>, см. useContractSelection).
/// Но Next доносит replaceState до useSearchParams в startTransition — низкий
/// приоритет, и подсветка из адреса запаздывала бы за кликом. useOptimistic
/// показывает новый выбор сразу, в рендере самого клика, а когда переход
/// роутера завершится, его сменит настоящее значение из адреса — тот же id.
export function SelectableTableBody({ children }: { children: ReactNode }) {
  const { selectedId, select } = useContractSelection();
  const [optimisticId, setOptimisticId] = useOptimistic(selectedId);

  function toggle(id: string) {
    const next = optimisticId === id ? null : id;

    /// Переход роутера, который запускает replaceState внутри select,
    /// вливается в этот: оптимистичное значение держится, пока он не закончится.
    startTransition(() => {
      setOptimisticId(next);
      select(next);
    });
  }

  return (
    <SelectionContext.Provider value={{ selectedId: optimisticId, toggle }}>
      <tbody>{children}</tbody>
    </SelectionContext.Provider>
  );
}

/// Клик по ссылке, кнопке или «Этапам» — это действие, а не выбор строки.
const interactive = 'a, button, summary, input, textarea, [role=menuitem]';

/// Строка таблицы, которую выделяет клик; работает внутри SelectableTableBody.
/// Ячейки рендерит сервер и передаёт сюда children: клиентским нужен только
/// <tr>. Несколько строк с одним rowId подсвечиваются вместе — так договор и
/// его строка этапов выглядят одним блоком.
export function SelectableRow({
  rowId,
  className = '',
  children,
}: {
  rowId: string;
  className?: string;
  children: ReactNode;
}) {
  // const [isClicked, setIsClicked] = useState(false);
  const { selectedId, toggle } = useContext(SelectionContext);
  const selected = selectedId === rowId;

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    const target = event.target as Element;

    /// События React всплывают и из порталов: клик внутри диалога правки
    /// дошёл бы сюда, хотя в DOM диалог вовсе не внутри строки.
    if (!event.currentTarget.contains(target)) return;
    if (target.closest(interactive)) return;

    toggle(rowId);
    // setIsClicked(true);
  }

  return (
    <tr
      aria-selected={selected}
      onClick={handleClick}
      className={`${className} cursor-pointer ${
        selected
          ? 'bg-primary/10'
          : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
      } `}
    >
      {children}
    </tr>
  );
}
