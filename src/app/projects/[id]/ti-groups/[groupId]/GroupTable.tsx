'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Check, Pencil } from 'lucide-react';
import Link from 'next/link';
import { surveyTiCells, surveyTiColumns, type SurveyTi } from '@/lib/survey-ti';

import { ProposedMeterInput } from './ProposedMeterInput';

const PROPOSED_METER_TITLE = 'замена сч.';

/// Колонки без значка-выбора (первая) и без «подключён» (последняя): итог
/// Connect живёт только на клиенте таблицы опроса.
const FIRST = 1;
const LAST = surveyTiColumns.length - 1;
const VISIBLE_COLUMNS = surveyTiColumns
  .map((column, index) => ({ column, index }))
  .filter(
    ({ column, index }) =>
      index >= FIRST &&
      index < LAST &&
      !['опрос', 'тех. решение', 'IP', 'адрес счётчика'].includes(
        column.title,
      ),
  );

export function TiGroupTable({
  projectId,
  tis,
  canEdit,
  previousGroupId,
  nextGroupId,
}: {
  projectId: string;
  tis: SurveyTi[];
  canEdit: boolean;
  previousGroupId: string | undefined;
  nextGroupId: string | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const rows = surveyTiCells(tis);

  return (
    <>
      <div className='flex h-12 w-full shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
        {canEdit && (
          <Button
            variant={editing ? 'default' : 'outline'}
            aria-pressed={editing}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? <Check /> : <Pencil />}
            {editing ? 'Готово' : 'Редактировать'}
          </Button>
        )}
        <nav
          aria-label='Навигация по группам ТИ'
          className='ml-auto flex items-center'
        >
          {previousGroupId ? (
            <Link
              href={`/projects/${projectId}/ti-groups/${previousGroupId}`}
              aria-label='Предыдущая группа'
              className='rounded px-3 py-1 text-lg hover:bg-neutral-200 dark:hover:bg-neutral-800'
            >
              ←
            </Link>
          ) : (
            <span className='px-3 py-1 text-lg text-neutral-400' aria-hidden>
              ←
            </span>
          )}
          {nextGroupId ? (
            <Link
              href={`/projects/${projectId}/ti-groups/${nextGroupId}`}
              aria-label='Следующая группа'
              className='rounded px-3 py-1 text-lg hover:bg-neutral-200 dark:hover:bg-neutral-800'
            >
              →
            </Link>
          ) : (
            <span className='px-3 py-1 text-lg text-neutral-400' aria-hidden>
              →
            </span>
          )}
        </nav>
      </div>
      <div className='shrink-0 rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'>
        <table className='w-full border-collapse text-sm'>
          <thead className='bg-neutral-100 dark:bg-neutral-800'>
            <tr>
              {VISIBLE_COLUMNS.map(({ column }) => (
                <th
                  key={column.title}
                  style={{ minWidth: column.minWidth }}
                  className='px-2 py-1 text-left font-medium'
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={tis[rowIndex].id}
                className='border-t border-neutral-200 dark:border-neutral-800'
              >
                {VISIBLE_COLUMNS.map(({ column, index }, colIndex) => {
                  const cell = row[index];
                  const editable =
                    canEdit && editing && column.title === PROPOSED_METER_TITLE;

                  return cell === null ? null : (
                    <td
                      key={colIndex}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      className='px-2 py-1 align-top whitespace-pre-wrap'
                    >
                      {editable ? (
                        <ProposedMeterInput
                          projectId={projectId}
                          tiId={tis[rowIndex].id}
                          value={cell.v}
                        />
                      ) : (
                        cell.v
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
