'use client';

import { LoaderCircle } from 'lucide-react';
import { useMemo, useRef, useState, useTransition } from 'react';

import type { SurveyColumn } from '@/app/projects/[id]/aiis2/survey-data';
import { SurveyTable, type SurveyRowProps } from '@/components/SurveyTable';
import { Button } from '@/components/ui/button';
import { text } from '@/lib/survey-cells';
import type { MeterReaderTi } from '@/lib/tis';
import { cn } from '@/lib/utils';

import { readMeterProfileForTi, type ReadMeterProfileResult } from './actions';

const columns: SurveyColumn[] = [
  { title: 'TI_name', minWidth: 240 },
  { title: 'ip', minWidth: 140 },
  { title: 'port', minWidth: 100 },
  { title: 'connect_address', minWidth: 140 },
];

/// Только для просмотра: выбирается вся строка, а не отдельная ячейка.
export function MeterReaderTable({
  projectId,
  tis,
}: {
  projectId: string;
  tis: MeterReaderTi[];
}) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [reading, setReading] = useState<
    Extract<ReadMeterProfileResult, { ok: true }>['reading'] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestVersion = useRef(0);
  const selectedTi = selectedRow === null ? null : (tis[selectedRow] ?? null);

  const rows = useMemo(
    () =>
      tis.map((ti) => [
        text(ti.name),
        text(ti.ip),
        text(ti.port),
        text(ti.connectAddress),
      ]),
    [tis],
  );

  function rowProps(row: number): SurveyRowProps {
    return {
      'aria-selected': selectedRow === row,
      onClick: () => {
        requestVersion.current++;
        setSelectedRow(row);
        setReading(null);
        setError(null);
      },
      className: cn(
        'cursor-pointer',
        selectedRow === row && 'bg-blue-100 dark:bg-blue-900/40',
      ),
    };
  }

  function handleReadProfile() {
    if (!selectedTi) return;

    const request = ++requestVersion.current;
    const tiId = selectedTi.id;

    setReading(null);
    setError(null);
    startTransition(async () => {
      const result = await readMeterProfileForTi(projectId, tiId);

      if (request !== requestVersion.current) return;
      if (result.ok) setReading(result.reading);
      else setError(result.error);
    });
  }

  const profileLabels =
    reading?.meterTypeCode === 0x09
      ? ['P+ raw', 'Voltage raw', 'Current raw', 'Temperature raw']
      : ['P+ import', 'P- export', 'Q+ import', 'Q- export'];

  return (
    <div className='flex flex-col gap-4'>
      <SurveyTable columns={columns} rows={rows} rowProps={rowProps} />
      {selectedTi && (
        <section
          aria-label='Meter control panel'
          className='flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'
        >
          <span className='mr-auto text-sm'>
            Selected: <strong>{selectedTi.name || 'Unnamed TI'}</strong>
          </span>
          <Button onClick={handleReadProfile} disabled={isPending}>
            {isPending && <LoaderCircle className='animate-spin' />}
            Read profile
          </Button>
        </section>
      )}
      {error && (
        <p role='alert' className='text-sm text-red-600 dark:text-red-400'>
          {error}
        </p>
      )}
      {reading && (
        <section className='flex flex-col gap-2'>
          <h2 className='text-sm font-medium'>
            Latest profile day — {reading.meterType} (pointer: {reading.pointer}
            )
          </h2>
          {reading.slices.length === 0 ? (
            <p className='text-sm text-neutral-500 dark:text-neutral-400'>
              No profile readings are available for the latest day.
            </p>
          ) : (
            <div className='max-h-96 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800'>
              <table className='w-full border-collapse text-sm'>
                <thead className='sticky top-0 bg-neutral-100 text-left dark:bg-neutral-900'>
                  <tr>
                    <th className='px-3 py-2'>Timestamp</th>
                    <th className='px-3 py-2'>Interval (min)</th>
                    <th className='px-3 py-2'>Season</th>
                    {profileLabels.map((label) => (
                      <th key={label} className='px-3 py-2'>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reading.slices.map((slice) => (
                    <tr
                      key={`${slice.timestamp}-${slice.season}`}
                      className='border-t border-neutral-100 dark:border-neutral-800'
                    >
                      <td className='px-3 py-1.5'>{slice.timestamp}</td>
                      <td className='px-3 py-1.5'>{slice.intervalMinutes}</td>
                      <td className='px-3 py-1.5'>{slice.season}</td>
                      {slice.values.map((value, index) => (
                        <td
                          key={index}
                          className='px-3 py-1.5 tabular-nums'
                          title={
                            slice.incomplete[index]
                              ? 'Incomplete reading'
                              : undefined
                          }
                        >
                          {value}
                          {slice.incomplete[index] ? '*' : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className='text-xs text-neutral-500 dark:text-neutral-400'>
            * Incomplete reading
          </p>
        </section>
      )}

    </div>
  );
}
