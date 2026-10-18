'use client';

import { Activity, Clock3, LoaderCircle } from 'lucide-react';
import { useMemo, useRef, useState, useTransition } from 'react';

import type { SurveyColumn } from '@/app/projects/[id]/aiis2/survey-data';
import { SurveyTable, type SurveyRowProps } from '@/components/SurveyTable';
import { Button } from '@/components/ui/button';
import { text } from '@/lib/survey-cells';
import type { MeterReaderTi } from '@/lib/tis';
import { cn } from '@/lib/utils';

import {
  readMeterProfileForTi,
  readMeterTimeCorrectionsForTi,
  type ReadMeterProfileResult,
  type ReadMeterTimeCorrectionsResult,
} from './actions';

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
  const [timeCorrections, setTimeCorrections] = useState<
    Extract<ReadMeterTimeCorrectionsResult, { ok: true }>['records'] | null
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
    setTimeCorrections(null);
    setError(null);
    startTransition(async () => {
      const result = await readMeterProfileForTi(projectId, tiId);

      if (request !== requestVersion.current) return;
      if (result.ok) setReading(result.reading);
      else setError(result.error);
    });
  }

  function handleReadTimeCorrections() {
    if (!selectedTi) return;

    const request = ++requestVersion.current;
    const tiId = selectedTi.id;

    setReading(null);
    setTimeCorrections(null);
    setError(null);
    startTransition(async () => {
      const result = await readMeterTimeCorrectionsForTi(projectId, tiId);

      if (request !== requestVersion.current) return;
      if (result.ok) setTimeCorrections(result.records);
      else setError(result.error);
    });
  }

  const profileLabels =
    reading?.meterTypeCode === 0x09
      ? ['P+ raw', 'Voltage raw', 'Current raw', 'Temperature raw']
      : ['P+ import', 'P- export', 'Q+ import', 'Q- export'];

  return (
    <div className='flex flex-col gap-4'>
      {/* Панель над таблицей, как в таблице опроса (aiis4): видна всегда,
          а кнопки, которым нужна выбранная ТИ, появляются вместе с выбором. */}
      <section
        aria-label='Meter control panel'
        className='flex h-12 shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
      >
        {selectedTi ? (
          <>
            <Button
              variant='outline'
              size='sm'
              onClick={handleReadProfile}
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Activity />
              )}
              Read profile
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={handleReadTimeCorrections}
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Clock3 />
              )}
              Read time corrections
            </Button>
            <span className='truncate text-sm text-neutral-500 dark:text-neutral-400'>
              {selectedTi.name || 'Unnamed TI'}
            </span>
          </>
        ) : (
          <span className='text-sm text-neutral-500 dark:text-neutral-400'>
            Select a TI row to read its meter profile
          </span>
        )}
      </section>
      <SurveyTable columns={columns} rows={rows} rowProps={rowProps} />
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
      {timeCorrections && (
        <section className='flex flex-col gap-2'>
          <h2 className='text-sm font-medium'>
            Time correction history — newest first
          </h2>
          {timeCorrections.length === 0 ? (
            <p className='text-sm text-neutral-500 dark:text-neutral-400'>
              The meter has no recorded time corrections.
            </p>
          ) : (
            <div className='max-h-96 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800'>
              <table className='w-full border-collapse text-sm'>
                <thead className='sticky top-0 bg-neutral-100 text-left dark:bg-neutral-900'>
                  <tr>
                    <th className='px-3 py-2'>Record</th>
                    <th className='px-3 py-2'>Time before correction</th>
                    <th className='px-3 py-2'>Time after correction</th>
                    <th className='px-3 py-2'>Change (seconds)</th>
                  </tr>
                </thead>
                <tbody>
                  {timeCorrections.map((record) => (
                    <tr
                      key={record.index}
                      className='border-t border-neutral-100 dark:border-neutral-800'
                    >
                      <td className='px-3 py-1.5 tabular-nums'>
                        {10 - record.index}
                      </td>
                      <td className='px-3 py-1.5 tabular-nums'>
                        {record.before}
                      </td>
                      <td className='px-3 py-1.5 tabular-nums'>
                        {record.after}
                      </td>
                      <td className='px-3 py-1.5 tabular-nums'>
                        {record.secondsChanged === null
                          ? 'Undecodable'
                          : `${record.secondsChanged > 0 ? '+' : ''}${record.secondsChanged}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className='text-xs text-neutral-500 dark:text-neutral-400'>
            Shows the meter&apos;s last 10 stored corrections, newest first.
          </p>
        </section>
      )}
    </div>
  );
}
