'use client';

import { ArrowLeft, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type SubmitEvent } from 'react';

import {
  createEquipmentKit,
  updateEquipmentKit,
} from '@/app/equipment-catalog/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Kind = {
  id: string;
  name: string;
  models: { id: string; name: string }[];
};

/// Строка справочника: вид с маркой, а у вида без марок — вид сам по себе.
type Equipment = {
  key: string;
  kindId: string;
  kind: string;
  modelId: string;
  model: string | null;
};

export type KitRow = Equipment & { quantity: string };

export type InitialKit = { id: string; name: string; items: KitRow[] };

function equipmentRows(kinds: Kind[]): Equipment[] {
  return kinds.flatMap((kind): Equipment[] =>
    kind.models.length === 0
      ? [
          {
            key: kind.id,
            kindId: kind.id,
            kind: kind.name,
            modelId: '',
            model: null,
          },
        ]
      : kind.models.map((model) => ({
          key: `${kind.id}:${model.id}`,
          kindId: kind.id,
          kind: kind.name,
          modelId: model.id,
          model: model.name,
        })),
  );
}

const card =
  'overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900';
const cardHeader =
  'flex min-h-12 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/60';
const th = 'px-2 py-1.5 text-left font-medium';
const td = 'px-2 py-1';
const row = 'border-t border-neutral-200 dark:border-neutral-800';

export function NewKitForm({
  kinds,
  initial,
}: {
  kinds: Kind[];
  initial?: InitialKit;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [kit, setKit] = useState<KitRow[]>(initial?.items ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inKit = new Set(kit.map((item) => item.key));
  const available = equipmentRows(kinds).filter((item) => !inKit.has(item.key));

  function add(item: Equipment) {
    setKit((current) => [...current, { ...item, quantity: '1' }]);
  }

  function remove(key: string) {
    setKit((current) => current.filter((item) => item.key !== key));
  }

  function setQuantity(key: string, quantity: string) {
    setKit((current) =>
      current.map((item) => (item.key === key ? { ...item, quantity } : item)),
    );
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const draft = kit.map(({ kindId, modelId, quantity }) => ({
        kindId,
        modelId,
        quantity,
      }));
      const result = initial
        ? await updateEquipmentKit(initial.id, name, draft)
        : await createEquipmentKit(name, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/equipment-catalog');
    });
  }

  return (
    <div className='grid items-start gap-4 lg:grid-cols-2'>
      <section className={card}>
        <div className={cardHeader}>
          <h2 className='text-sm font-semibold'>Оборудование</h2>
          <span className='text-sm text-neutral-500'>{available.length}</span>
        </div>
        {available.length === 0 ? (
          <p className='p-3 text-sm text-neutral-500'>
            {kinds.length === 0
              ? 'Справочник пуст'
              : 'Всё оборудование уже в комплекте'}
          </p>
        ) : (
          <div className='max-h-[calc(100vh-10rem)] overflow-auto'>
            <table className='w-full border-collapse text-sm'>
              <thead className='sticky top-0 bg-white text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400'>
                <tr>
                  <th className={th}>Наименование</th>
                  <th className={th}>Марка / характеристика</th>
                  <th className='w-10' />
                </tr>
              </thead>
              <tbody>
                {available.map((item) => (
                  <tr key={item.key} className={row}>
                    <td className={td}>{item.kind}</td>
                    <td className={td}>{item.model ?? '—'}</td>
                    <td className='px-1 py-0.5 text-right'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`Добавить в комплект: ${item.kind} ${item.model ?? ''}`}
                        disabled={pending}
                        onClick={() => add(item)}
                      >
                        <Plus />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form onSubmit={submit} className={card}>
        <div className={cardHeader}>
          <h2 className='text-sm font-semibold'>Комплект</h2>
          <span className='text-sm text-neutral-500'>{kit.length}</span>
        </div>
        <div className='grid gap-3 p-3'>
          <label className='grid gap-1 text-sm'>
            Название комплекта
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              autoFocus
            />
          </label>
          {kit.length === 0 ? (
            <p className='rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700'>
              Добавьте оборудование кнопкой «+» слева
            </p>
          ) : (
            <table className='w-full border-collapse text-sm'>
              <thead className='text-neutral-500 dark:text-neutral-400'>
                <tr>
                  <th className='w-10 px-2 py-1.5 text-center font-medium'>
                    №
                  </th>
                  <th className={th}>Наименование</th>
                  <th className={th}>Марка / характеристика</th>
                  <th className='w-24 px-2 py-1.5 text-center font-medium'>
                    Кол-во
                  </th>
                  <th className='w-10' />
                </tr>
              </thead>
              <tbody>
                {kit.map((item, index) => (
                  <tr key={item.key} className={row}>
                    <td className='px-2 py-1 text-center'>{index + 1}</td>
                    <td className={td}>{item.kind}</td>
                    <td className={td}>{item.model ?? '—'}</td>
                    <td className='px-1 py-0.5'>
                      <Input
                        type='number'
                        min='1'
                        max='2147483647'
                        step='1'
                        aria-label={`Кол-во, строка ${index + 1}`}
                        className='h-7 text-center'
                        value={item.quantity}
                        disabled={pending}
                        onChange={(event) =>
                          setQuantity(item.key, event.target.value)
                        }
                      />
                    </td>
                    <td className='px-1 py-0.5 text-right'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`Убрать из комплекта: строка ${index + 1}`}
                        disabled={pending}
                        onClick={() => remove(item.key)}
                      >
                        <Minus />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {error && (
            <p role='alert' className='text-sm text-red-600 dark:text-red-400'>
              {error}
            </p>
          )}
          <div className='flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800'>
            <Link
              href='/equipment-catalog'
              className={buttonVariants({ variant: 'ghost' })}
            >
              <ArrowLeft />
              Отмена
            </Link>
            <Button type='submit' disabled={pending || kit.length === 0}>
              Сохранить
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
