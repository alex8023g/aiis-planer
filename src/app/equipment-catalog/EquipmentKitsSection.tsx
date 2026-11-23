'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { deleteEquipmentKit } from '@/app/equipment-catalog/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import type { EquipmentKitOption } from '@/lib/specification';

export function EquipmentKitsSection({
  kits,
  editable,
  editing,
  linkHeading = true,
}: {
  kits: EquipmentKitOption[];
  editable: boolean;
  editing: boolean;
  linkHeading?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function removeKit(kit: EquipmentKitOption) {
    if (
      !window.confirm(`Удалить комплект «${kit.name}»? Это нельзя отменить.`)
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteEquipmentKit(kit.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className='w-fit max-w-full overflow-x-auto rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
      <div className='mb-2 flex min-h-7 flex-wrap items-center gap-3'>
        <h2 className='text-sm font-semibold'>
          {linkHeading ? (
            <Link
              href='/equipment-catalog/kits'
              className='hover:underline'
            >
              Типовые комплекты
            </Link>
          ) : (
            'Типовые комплекты'
          )}
        </h2>
        {editable && editing && (
          <Link
            href='/equipment-catalog/new-kit'
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Plus />
            Добавить комплект
          </Link>
        )}
      </div>
      {error && (
        <p
          role='alert'
          className='mb-2 text-sm text-red-600 dark:text-red-400'
        >
          {error}
        </p>
      )}
      {kits.length === 0 ? (
        <p className='text-sm text-neutral-500'>Комплектов пока нет</p>
      ) : (
        <div className='flex flex-col gap-3'>
          {kits.map((kit) => (
            <article
              key={kit.id}
              className='overflow-hidden rounded-md border border-neutral-200 shadow-xs dark:border-neutral-700'
            >
              <div className='flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800/60'>
                <h3 className='text-sm font-semibold'>{kit.name}</h3>
                {editable && editing && (
                  <div className='flex gap-2'>
                    <Link
                      href={`/equipment-catalog/${kit.id}/edit`}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      <Pencil />
                      Редактировать
                    </Link>
                    <Button
                      variant='outline'
                      size='sm'
                      className='text-red-600 dark:text-red-400'
                      disabled={pending}
                      onClick={() => removeKit(kit)}
                    >
                      <Trash2 />
                      Удалить
                    </Button>
                  </div>
                )}
              </div>
              <table className='w-full border-collapse text-sm'>
                <thead className='text-neutral-500 dark:text-neutral-400'>
                  <tr>
                    <th className='w-16 px-2 py-1 text-center font-medium'>
                      №
                    </th>
                    <th className='px-2 py-1 text-left font-medium'>
                      Наименование
                    </th>
                    <th className='px-2 py-1 text-left font-medium'>
                      Марка / характеристика
                    </th>
                    <th className='w-24 px-2 py-1 text-center font-medium'>
                      Кол-во
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {kit.items.map((item, index) => (
                    <tr
                      key={index}
                      className='border-t border-neutral-200 dark:border-neutral-800'
                    >
                      <td className='px-2 py-1 text-center'>{index + 1}</td>
                      <td className='px-2 py-1'>{item.kind}</td>
                      <td className='px-2 py-1'>{item.model ?? '—'}</td>
                      <td className='px-2 py-1 text-center'>
                        {item.quantity ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
