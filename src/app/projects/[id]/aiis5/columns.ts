'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SurveyColumn } from '@/app/projects/[id]/aiis2/survey-data';
import { surveyTiColumns } from '@/lib/survey-ti';

import { tiDetailsColumns } from './ti-details';

/// Колонка таблицы aiis5 с тем, что нужно для выбора колонок: id —
/// постоянное имя (по нему запоминаем скрытые; заголовки повторяются —
/// «фаза», «№ сч.»), group — раздел в меню «Колонки».
export type TableColumn = SurveyColumn & {
  id: string;
  group: ColumnGroup;
  /// false — колонку не скрыть.
  hideable?: boolean;
};

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

/// id и раздел колонок опроса — по индексу в surveyTiColumns. Сами колонки
/// общие с aiis4 (src/lib/survey-ti.ts), поэтому id им даём здесь.
const surveyColumnMeta: Pick<TableColumn, 'id' | 'group' | 'hideable'>[] = [
  /// Колонка выделения строк: за неё же цепляется переход к строке
  /// (data-row-cell …:0), поэтому её не скрыть.
  { id: 'rowHandle', group: 'ti', hideable: false },
  { id: 'number', group: 'ti' },
  { id: 'name', group: 'ti' },
  { id: 'status', group: 'ti' },
  { id: 'uNom', group: 'ti' },
  { id: 'meterType', group: 'meter' },
  { id: 'atsDictionary', group: 'meter' },
  { id: 'needsReplacement', group: 'meter' },
  { id: 'wiring', group: 'meter' },
  { id: 'proposedMeterType', group: 'proposed' },
  { id: 'existingPolling', group: 'polling' },
  { id: 'freeRs485', group: 'polling' },
  { id: 'technicalSolution', group: 'polling' },
  { id: 'modemImei', group: 'link' },
  { id: 'ip', group: 'link' },
  { id: 'meterAddress', group: 'meter' },
  { id: 'connected', group: 'link' },
];

if (surveyColumnMeta.length !== surveyTiColumns.length) {
  throw new Error(
    'aiis5/columns.ts: surveyColumnMeta не совпадает с surveyTiColumns',
  );
}

/// Все колонки таблицы: опрос, как в aiis4, и за ним — остальные данные ТИ.
/// Порядок здесь — порядок ячеек в строке; индексы колонок опроса в
/// SurveyView (SOLUTION_COLUMN и др.) считаются по нему.
export const tableColumns: TableColumn[] = [
  ...surveyTiColumns.map((column, index) => ({
    ...column,
    ...surveyColumnMeta[index],
  })),
  ...tiDetailsColumns,
];

/// Готовые наборы колонок: что скрыть.
export const columnPresets: { label: string; hidden: () => string[] }[] = [
  { label: 'Все колонки', hidden: () => [] },
  {
    label: 'Только опрос (как АИИС 4)',
    hidden: () => tiDetailsColumns.map((column) => column.id),
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
