'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState, useTransition, type SubmitEvent } from 'react';

import {
  createEquipmentKit,
  type KitDraftItem,
} from '@/app/equipment-catalog/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Kind = {
  id: string;
  name: string;
  models: { id: string; name: string }[];
};

const emptyItem = (): KitDraftItem => ({
  kindId: '',
  modelId: '',
  quantity: '1',
});
const selectClass =
  'h-8 w-full rounded border border-neutral-300 bg-transparent px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900';

export function AddEquipmentKit({ kinds }: { kinds: Kind[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [items, setItems] = useState<KitDraftItem[]>([emptyItem()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(index: number, patch: Partial<KitDraftItem>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createEquipmentKit(name, items);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          setName('');
          setItems([emptyItem()]);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button variant='outline' size='sm'>
            <Plus />
            Добавить комплект
          </Button>
        }
      />
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Добавить комплект</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className='grid gap-3'>
          <label className='grid gap-1 text-sm'>
            Название комплекта
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </label>
          {kinds.length === 0 && (
            <p className='text-sm text-neutral-500'>
              Сначала добавьте оборудование в спецификацию.
            </p>
          )}
          {items.map((item, index) => {
            const kind = kinds.find((entry) => entry.id === item.kindId);
            return (
              <div
                key={index}
                className='grid items-end gap-2 sm:grid-cols-[2fr_2fr_6rem_auto]'
              >
                <label className='grid gap-1 text-sm'>
                  Наименование
                  <select
                    className={selectClass}
                    value={item.kindId}
                    disabled={pending}
                    onChange={(event) =>
                      change(index, { kindId: event.target.value, modelId: '' })
                    }
                  >
                    <option value=''>Выберите вид</option>
                    {kinds.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='grid gap-1 text-sm'>
                  Марка / характеристика
                  <select
                    className={selectClass}
                    value={item.modelId}
                    disabled={pending || !kind}
                    onChange={(event) =>
                      change(index, { modelId: event.target.value })
                    }
                  >
                    <option value=''>Без марки</option>
                    {kind?.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='grid gap-1 text-sm'>
                  Кол-во
                  <Input
                    type='number'
                    min='1'
                    max='2147483647'
                    step='1'
                    value={item.quantity}
                    disabled={pending}
                    onChange={(event) =>
                      change(index, { quantity: event.target.value })
                    }
                  />
                </label>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  aria-label={`Удалить строку ${index + 1}`}
                  disabled={pending}
                  onClick={() =>
                    setItems((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={pending || items.length >= 500}
              onClick={() => setItems((current) => [...current, emptyItem()])}
            >
              <Plus />
              Добавить строку
            </Button>
          </div>
          {error && (
            <p role='alert' className='text-sm text-red-600 dark:text-red-400'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='ghost'
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
            <Button type='submit' disabled={pending || kinds.length === 0}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
