'use client';

import { ArrowLeft, Check, Plus } from 'lucide-react';
import Link from 'next/link';
import { useId, useState, useTransition, type SubmitEvent } from 'react';

import {
  addCatalogItem,
  deleteCatalogItem,
  updateCatalogName,
  updateCatalogUnit,
} from '@/app/equipment-catalog/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cleanEquipmentName, equipmentKey } from '@/lib/equipment';
import type { ActionResult } from '@/lib/types';

type Kind = {
  id: string;
  name: string;
  unit: string;
  used: boolean;
  models: { id: string; name: string; used: boolean }[];
};

const th = 'px-2 py-1.5 text-left font-medium';
const td = 'px-2 py-1';
const line = 'border-t border-neutral-200 dark:border-neutral-800';

function CatalogFieldEditor({
  value,
  label,
  compact,
  onSave,
}: {
  value: string;
  label: string;
  compact?: boolean;
  onSave: (value: string) => Promise<ActionResult>;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSave(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText(cleanEquipmentName(text));
    });
  }

  return (
    <form onSubmit={save}>
      <div className='flex items-center gap-1'>
        <Input
          aria-label={label}
          value={text}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
          className={compact ? 'w-24' : 'min-w-40'}
        />
        <Button
          type='submit'
          variant='outline'
          size='icon-sm'
          aria-label={`Сохранить: ${label}`}
          disabled={pending || text === value}
        >
          <Check />
        </Button>
      </div>
      {error && (
        <p role='alert' className='text-xs text-red-600 dark:text-red-400'>
          {error}
        </p>
      )}
    </form>
  );
}

export function EditCatalogTable({ kinds }: { kinds: Kind[] }) {
  const addFormId = useId();
  const [kind, setKind] = useState('');
  const [model, setModel] = useState('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const existing = kinds.find(
    (item) => kind.trim() && equipmentKey(item.name) === equipmentKey(kind),
  );

  function remove(item: Kind, model: Kind['models'][number] | null) {
    const target = model
      ? `марку «${model.name}» вида «${item.name}»`
      : `вид «${item.name}»`;
    if (!window.confirm(`Удалить ${target}? Это нельзя отменить.`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteCatalogItem(item.id, model?.id ?? '');
      if (!result.ok) setError(result.error);
    });
  }

  function add(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addCatalogItem(kind, model, unit);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setKind('');
      setModel('');
      setUnit('');
    });
  }

  return (
    <section className='overflow-x-auto rounded-md border border-neutral-200 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900'>
      <table className='w-full border-collapse text-sm'>
        <thead className='text-neutral-500 dark:text-neutral-400'>
          <tr>
            <th className={th}>Наименование</th>
            <th className={th}>Марка / характеристика</th>
            <th className='w-24 px-2 py-1.5 text-left font-medium'>Ед. изм.</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr className='border-t border-neutral-200 dark:border-neutral-800'>
            <td className={td}>
              <form id={addFormId} onSubmit={add} className='pr-8'>
                <Input
                  aria-label='Новый вид'
                  placeholder='Вид'
                  list='catalog-kinds'
                  className='min-w-40'
                  value={kind}
                  disabled={pending}
                  onChange={(event) => setKind(event.target.value)}
                />
                <datalist id='catalog-kinds'>
                  {kinds.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </form>
            </td>
            <td className={td}>
              <div className='pr-8'>
                <Input
                  form={addFormId}
                  aria-label='Новая марка'
                  placeholder='Марка / характеристика'
                  className='min-w-40'
                  value={model}
                  disabled={pending}
                  onChange={(event) => setModel(event.target.value)}
                />
              </div>
            </td>
            <td className={td}>
              <Input
                form={addFormId}
                aria-label='Ед. изм.'
                placeholder='Ед. изм.'
                className='w-24'
                value={existing ? existing.unit : unit}
                disabled={pending || !!existing}
                onChange={(event) => setUnit(event.target.value)}
              />
            </td>
            <td className='px-1 py-0.5 text-right'>
              <Button
                form={addFormId}
                type='submit'
                variant='outline'
                size='sm'
                aria-label='Добавить'
                disabled={pending || !kind.trim()}
              >
                <Plus />
                Добавить
              </Button>
            </td>
          </tr>
        </tbody>
        <tbody>
          {kinds.map((item) => {
            const rows = item.models.length > 0 ? item.models : [null];
            return rows.map((row, index) => (
              <tr key={row?.id ?? item.id}>
                {index === 0 && (
                  <td
                    className={`${td} ${line} align-top`}
                    rowSpan={rows.length}
                  >
                    <CatalogFieldEditor
                      key={`${item.id}:${item.name}`}
                      value={item.name}
                      label={`Наименование: ${item.name}`}
                      onSave={(value) => updateCatalogName(item.id, '', value)}
                    />
                  </td>
                )}
                <td className={`${td} ${line}`}>
                  {row ? (
                    <CatalogFieldEditor
                      key={`${row.id}:${row.name}`}
                      value={row.name}
                      label={`Марка: ${item.name} — ${row.name}`}
                      onSave={(value) =>
                        updateCatalogName(item.id, row.id, value)
                      }
                    />
                  ) : (
                    '—'
                  )}
                </td>
                {index === 0 && (
                  <td
                    className={`${td} ${line} align-top`}
                    rowSpan={rows.length}
                  >
                    <CatalogFieldEditor
                      key={`${item.id}:${item.unit}`}
                      value={item.unit}
                      label={`Ед. изм.: ${item.name}`}
                      compact
                      onSave={(value) => updateCatalogUnit(item.id, value)}
                    />
                  </td>
                )}
                <td className={`${line} px-1 py-0.5 text-right`}>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    aria-label={`Удалить: ${item.name} ${row?.name ?? ''}`}
                    title={
                      (row ? row.used : item.used)
                        ? 'Есть в спецификациях или комплектах'
                        : undefined
                    }
                    disabled={pending || (row ? row.used : item.used)}
                    onClick={() => remove(item, row)}
                  >
                    Удалить
                  </Button>
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
      {error && (
        <p role='alert' className='mt-2 text-sm text-red-600 dark:text-red-400'>
          {error}
        </p>
      )}
      <p className='mt-2 text-xs text-neutral-500'>
        Изменения видов, марок и единиц измерения применяются ко всем
        спецификациям и комплектам, где они используются.
      </p>
      <div className='mt-3 flex justify-end border-t border-neutral-200 pt-3 dark:border-neutral-800'>
        <Link
          href='/equipment-catalog'
          className={buttonVariants({ variant: 'ghost' })}
        >
          <ArrowLeft />
          Назад
        </Link>
      </div>
    </section>
  );
}
