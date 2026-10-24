'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { SpecificationRow } from '@/lib/specification';

import { saveGroupSpecification, type SpecificationDraft } from './actions';

/// Строка черновика: key держит React-ключ стабильным, пока строки
/// переставляют, — по индексу поля ввода перепутались бы местами.
type DraftRow = SpecificationDraft & { key: number };

const EMPTY_DRAFT: SpecificationDraft = {
  name: '',
  model: '',
  quantity: '1',
  unit: 'шт',
};

const INPUT_CLASS =
  'w-full rounded border border-neutral-300 bg-transparent px-1 py-0.5 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-400';

function toDrafts(items: SpecificationRow[]): DraftRow[] {
  return items.map((item, index) => ({
    key: index,
    name: item.name,
    model: item.model ?? '',
    quantity: String(item.quantity),
    unit: item.unit,
  }));
}

export function SpecificationTable({
  projectId,
  groupId,
  items,
  canEdit,
}: {
  projectId: string;
  groupId: string;
  items: SpecificationRow[];
  canEdit: boolean;
}) {
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [nextKey, setNextKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editing = drafts !== null;

  function startEditing() {
    const rows = toDrafts(items);

    setDrafts(rows.length > 0 ? rows : [{ ...EMPTY_DRAFT, key: 0 }]);
    setNextKey(Math.max(rows.length, 1));
    setError(null);
  }

  function cancel() {
    setDrafts(null);
    setError(null);
  }

  function change(
    index: number,
    field: keyof SpecificationDraft,
    value: string,
  ) {
    setDrafts((rows) =>
      rows!.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function move(index: number, by: -1 | 1) {
    setDrafts((rows) => {
      const next = [...rows!];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setDrafts((rows) => rows!.filter((_row, i) => i !== index));
  }

  function add() {
    setDrafts((rows) => [...rows!, { ...EMPTY_DRAFT, key: nextKey }]);
    setNextKey((key) => key + 1);
  }

  function save() {
    startTransition(async () => {
      const result = await saveGroupSpecification(
        projectId,
        groupId,
        drafts!.map(({ name, model, quantity, unit }) => ({
          name,
          model,
          quantity,
          unit,
        })),
      );

      if (result.ok) {
        setDrafts(null);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className='w-fit max-w-full shrink-0 overflow-x-auto rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
      <div className='mb-2 flex items-center gap-2'>
        <h2 className='text-sm font-semibold'>Спецификация</h2>
        {canEdit && !editing && (
          <Button variant='ghost' size='xs' onClick={startEditing}>
            <Pencil />
            Изменить
          </Button>
        )}
      </div>
      {!editing && items.length === 0 ? (
        <p className='text-sm text-neutral-500'>Не указана</p>
      ) : (
        <table className='border-collapse text-sm'>
          <thead className='bg-neutral-100 dark:bg-neutral-800'>
            <tr>
              <th className='w-16 px-2 py-1 text-center font-medium'>№ п/п</th>
              <th className='px-2 py-1 text-left font-medium'>
                Наименование оборудования
              </th>
              <th className='px-2 py-1 text-left font-medium'>Марка</th>
              <th className='w-24 px-2 py-1 text-center font-medium'>Кол-во</th>
              <th className='w-24 px-2 py-1 text-center font-medium'>
                Ед. изм.
              </th>
              {editing && <th className='w-24' />}
            </tr>
          </thead>
          <tbody>
            {editing
              ? drafts.map((row, index) => (
                  <tr
                    key={row.key}
                    className='border-t border-neutral-200 dark:border-neutral-800'
                  >
                    <td className='px-2 py-1 text-center'>{index + 1}</td>
                    <td className='px-2 py-1'>
                      <input
                        aria-label={`Наименование, строка ${index + 1}`}
                        value={row.name}
                        disabled={isPending}
                        onChange={(event) =>
                          change(index, 'name', event.target.value)
                        }
                        className={`${INPUT_CLASS} min-w-64`}
                      />
                    </td>
                    <td className='px-2 py-1'>
                      <input
                        aria-label={`Марка, строка ${index + 1}`}
                        value={row.model}
                        disabled={isPending}
                        onChange={(event) =>
                          change(index, 'model', event.target.value)
                        }
                        className={`${INPUT_CLASS} min-w-48`}
                      />
                    </td>
                    <td className='px-2 py-1'>
                      <input
                        aria-label={`Кол-во, строка ${index + 1}`}
                        inputMode='numeric'
                        value={row.quantity}
                        disabled={isPending}
                        onChange={(event) =>
                          change(index, 'quantity', event.target.value)
                        }
                        className={`${INPUT_CLASS} text-center`}
                      />
                    </td>
                    <td className='px-2 py-1'>
                      <input
                        aria-label={`Ед. изм., строка ${index + 1}`}
                        value={row.unit}
                        disabled={isPending}
                        onChange={(event) =>
                          change(index, 'unit', event.target.value)
                        }
                        className={`${INPUT_CLASS} text-center`}
                      />
                    </td>
                    <td className='px-1 py-1 whitespace-nowrap'>
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        aria-label='Выше'
                        disabled={isPending || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        aria-label='Ниже'
                        disabled={isPending || index === drafts.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        aria-label='Удалить строку'
                        disabled={isPending}
                        onClick={() => remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))
              : items.map((item, index) => (
                  <tr
                    key={item.id}
                    className='border-t border-neutral-200 dark:border-neutral-800'
                  >
                    <td className='px-2 py-1 text-center'>{index + 1}</td>
                    <td className='px-2 py-1'>{item.name}</td>
                    <td className='px-2 py-1'>{item.model ?? '—'}</td>
                    <td className='px-2 py-1 text-center'>{item.quantity}</td>
                    <td className='px-2 py-1 text-center'>{item.unit}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      )}
      {editing && (
        <div className='mt-2 flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={isPending}
            onClick={add}
          >
            <Plus />
            Добавить строку
          </Button>
          <Button size='sm' disabled={isPending} onClick={save}>
            <Check />
            Сохранить
          </Button>
          <Button
            variant='ghost'
            size='sm'
            disabled={isPending}
            onClick={cancel}
          >
            <X />
            Отмена
          </Button>
          {error && <p className='text-xs text-red-600'>{error}</p>}
        </div>
      )}
    </section>
  );
}
