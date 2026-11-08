'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { tableColumns } from './ti-details';

/// Сами колонки, их порядок и ячейки — в ./ti-details.ts.
export { tableColumns, type TableColumn } from './ti-details';

/// Разделы меню «Колонки» — в этом порядке.
export const columnGroups = {
  ti: 'ТИ',
  meter: 'Счётчик',
  proposed: 'Замена счётчика',
  removed: 'Снятый счётчик',
  tt: 'ТТ',
  tn: 'ТН',
  polling: 'Опрос и тех. решение',
  link: 'Модем и SIM',
  uspd: 'УСПД',
} as const;

export type ColumnGroup = keyof typeof columnGroups;

/// Скрыть всё, кроме этих колонок. № и наименование ТИ остаются всегда —
/// иначе не понять, чья строка.
function showOnly(ids: string[]): string[] {
  const shown = new Set(['number', 'name', ...ids]);

  return tableColumns
    .filter((column) => !shown.has(column.id))
    .map((column) => column.id);
}

/// Готовые наборы колонок: что скрыть.
export const columnPresets: { label: string; hidden: () => string[] }[] = [
  { label: 'Все колонки', hidden: () => [] },
  {
    label: 'Только опрос (как АИИС 4)',
    hidden: () =>
      tableColumns
        .filter((column) => !column.survey)
        .map((column) => column.id),
  },
  {
    label: 'Оборудование',
    hidden: () =>
      tableColumns
        .filter(
          (column) =>
            !['ti', 'meter', 'proposed', 'removed', 'tt', 'tn'].includes(
              column.group,
            ) && column.id !== 'name',
        )
        .map((column) => column.id),
  },
  {
    label: 'Узел учёта',
    hidden: () =>
      showOnly([
        'meterType',
        'meterNumber',
        'ttType',
        'ttNumber',
        'ttRatio',
        'tnType',
        'tnNumber',
        'tnRatio',
      ]),
  },
  {
    label: 'Опрос',
    hidden: () =>
      showOnly([
        'meterType',
        'meterNumber',
        'meterAddress',
        'modemImei',
        'ip',
        'connected',
      ]),
  },
  {
    label: 'Связь',
    hidden: () =>
      tableColumns
        .filter(
          (column) =>
            !['ti', 'link', 'uspd'].includes(column.group) &&
            column.id !== 'meterAddress',
        )
        .map((column) => column.id),
  },
];

const STORAGE_KEY = 'aiis5:hidden-columns';

function readHidden(): Set<string> {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '[]',
    );

    return new Set(
      Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeHidden(hidden: ReadonlySet<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    /// Хранилище недоступно (приватный режим) — выбор живёт до перезагрузки.
  }
}

/// Какие колонки скрыты. Запоминается в браузере (localStorage), у каждого
/// пользователя своё: это вид таблицы, а не данные проекта.
export function useColumnVisibility() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  /// Читаем после монтирования: на сервере localStorage нет, и первый кадр
  /// обязан совпасть с серверной разметкой.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- сохранённый выбор доступен только в браузере
    setHidden(readHidden());
  }, []);

  const update = useCallback(
    (next: (previous: ReadonlySet<string>) => ReadonlySet<string>) => {
      setHidden((previous) => {
        const result = next(previous);

        writeHidden(result);

        return result;
      });
    },
    [],
  );

  const setVisible = useCallback(
    (ids: string[], visible: boolean) =>
      update((previous) => {
        const next = new Set(previous);

        for (const id of ids) {
          if (visible) next.delete(id);
          else next.add(id);
        }

        return next;
      }),
    [update],
  );

  const setHiddenIds = useCallback(
    (ids: string[]) => update(() => new Set(ids)),
    [update],
  );

  /// Индексы показанных колонок в tableColumns — в их порядке.
  const visibleColumns = useMemo(
    () =>
      tableColumns.flatMap((column, index) =>
        column.hideable === false || !hidden.has(column.id) ? [index] : [],
      ),
    [hidden],
  );

  return { hidden, visibleColumns, setVisible, setHiddenIds };
}
