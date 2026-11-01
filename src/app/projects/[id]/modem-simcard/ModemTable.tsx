'use client';

import { useMemo } from 'react';

import type { SurveyColumn } from '@/app/projects/[id]/aiis2/survey-data';
import { SurveyTable, type SurveyRowProps } from '@/components/SurveyTable';
import { text } from '@/lib/survey-cells';
import type { ProjectModem } from '@/lib/tis';
import { cn } from '@/lib/utils';

const columns: SurveyColumn[] = [
  { title: '№ ТИ', minWidth: 80 },
  { title: 'вид', minWidth: 100 },
  { title: 'тип модема', minWidth: 160 },
  { title: 'IMEI', minWidth: 160 },
  { title: 'порт', minWidth: 64, compact: true },
  { title: 'канал', minWidth: 64, compact: true },
  { title: '№ SIM', minWidth: 140 },
  { title: 'IP', minWidth: 140 },
  { title: 'оператор', minWidth: 120 },
];

/// Только для просмотра: выбирается вся строка, а не отдельная ячейка.
/// Выбор хранится по id модема, а не по номеру строки: после добавления
/// модема строки сдвигаются, а выбранным должен остаться тот же модем.
export function ModemTable({
  modems,
  selectedId,
  onSelect,
}: {
  modems: ProjectModem[];
  selectedId: string | null;
  /// null — снять выбор: повторный щелчок по выбранной строке.
  onSelect: (id: string | null) => void;
}) {
  const rows = useMemo(
    () =>
      modems.map((modem) => [
        text(modem.tiNumbers),
        text(modem.kind),
        text(modem.type),
        text(modem.imei),
        text(modem.port),
        text(modem.channel),
        text(modem.simNumber),
        text(modem.ip),
        text(modem.provider),
      ]),
    [modems],
  );

  function rowProps(row: number): SurveyRowProps {
    const id = modems[row].id;
    const selected = id === selectedId;

    return {
      'aria-selected': selected,
      onClick: () => onSelect(selected ? null : id),
      className: cn(
        'cursor-pointer',
        selected && 'bg-blue-100 dark:bg-blue-900/40',
      ),
    };
  }

  return (
    <SurveyTable
      columns={columns}
      rows={rows}
      rowProps={rowProps}
      /// Сжимается по высоте до остатка экрана и прокручивается внутри: так
      /// заголовок таблицы и панель над ней не уезжают.
      className='min-h-0'
    />
  );
}
