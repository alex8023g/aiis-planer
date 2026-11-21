'use client';

import { ArrowLeft, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition, type SubmitEvent } from 'react';

import {
  addCatalogItem,
  deleteCatalogItem,
} from '@/app/equipment-catalog/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { equipmentKey } from '@/lib/equipment';

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

export function EditCatalogTable({ kinds }: { kinds: Kind[] }) {
  const [kind, setKind] = useState('');
  const [model, setModel] = useState('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const existing = kinds.find(
    (item) => kind.trim() && equipmentKey(item.name) === equipmentKey(kind),
  );

  function remove(kindId: string, modelId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteCatalogItem(kindId, modelId);
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
            <th className='w-24 px-2 py-1.5 text-left font-medium'>Ед. изм.</th>
            <th className={th}>Марка / характеристика</th>
            <th className='w-10' />
          </tr>
        </thead>
        <tbody>
          <tr className='border-t border-neutral-200 dark:border-neutral-800'>
            <td className={td} colSpan={4}>
              <form
                onSubmit={add}
                className='flex flex-wrap items-center gap-2'
              >
                <Input
                  aria-label='Новый вид'
                  placeholder='Вид'
                  list='catalog-kinds'
                  className='min-w-40 flex-1'
                  value={kind}
                  disabled={pending}
                  onChange={(event) => setKind(event.target.value)}
                />
                <datalist id='catalog-kinds'>
                  {kinds.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
                <Input
                  aria-label='Ед. изм.'
                  placeholder='Ед. изм.'
                  className='w-24'
                  value={existing ? existing.unit : unit}
                  disabled={pending || !!existing}
                  onChange={(event) => setUnit(event.target.value)}
                />
                <Input
                  aria-label='Новая марка'
                  placeholder='Марка / характеристика'
                  className='min-w-40 flex-1'
                  value={model}
                  disabled={pending}
                  onChange={(event) => setModel(event.target.value)}
                />
                <Button
                  type='submit'
                  variant='outline'
                  size='icon-sm'
                  aria-label='Добавить'
                  disabled={pending || !kind.trim()}
                >
                  <Plus />
                </Button>
              </form>
            </td>
          </tr>
        </tbody>
        <tbody>
          {kinds.map((item) => {
            const rows = item.models.length > 0 ? item.models : [null];
            return rows.map((row, index) => (
              <tr key={row?.id ?? item.id}>
                {index === 0 && (
                  <>
                    <td
                      className={`${td} ${line} align-top`}
                      rowSpan={rows.length}
                    >
                      {item.name}
                    </td>
                    <td
                      className={`${td} ${line} align-top`}
                      rowSpan={rows.length}
                    >
                      {item.unit}
                    </td>
                  </>
                )}
                <td className={`${td} ${line}`}>{row?.name ?? '—'}</td>
                <td className={`${line} px-1 py-0.5 text-right`}>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon-sm'
                    aria-label={`Удалить: ${item.name} ${row?.name ?? ''}`}
                    title={
                      (row ? row.used : item.used)
                        ? 'Есть в спецификациях или комплектах'
                        : undefined
                    }
                    disabled={pending || (row ? row.used : item.used)}
                    onClick={() => remove(item.id, row?.id ?? '')}
                  >
                    <Minus />
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
