'use client';

import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, useTransition, type SubmitEvent } from 'react';

import {
  addSpecificationItem,
  deleteSpecificationItem,
  updateSpecificationItem,
  type SpecificationItemFields,
} from '@/app/projects/[id]/aiis/[facilityId]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ActionResult, SpecificationItem } from '@/lib/types';

const emptyFields: SpecificationItemFields = {
  name: '',
  model: '',
  quantity: 1,
};

/// Количество из инпута: пустую строку и мусор превращаем в 0, чтобы проверка
/// «от 1» в экшене поймала их одинаково.
function toQuantity(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SpecificationTable({
  projectId,
  facilityId,
  items,
  canEdit,
}: {
  projectId: string;
  /// Объект, спецификацию которого показывает таблица: спецификация
  /// принадлежит объекту, а не проекту.
  facilityId: string;
  items: SpecificationItem[];
  /// Может ли текущий пользователь менять проект (см. canEditProject).
  /// Экшены проверяют это заново: спрятанной кнопки мало.
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /// id позиции, которую сейчас правят, и её значения. null — правок нет.
  const [editing, setEditing] = useState<
    (SpecificationItemFields & { id: string }) | null
  >(null);
  const [draft, setDraft] = useState(emptyFields);

  /// Экшены возвращают ошибку значением, а не исключением, поэтому результат
  /// разбирается здесь: успех — onDone, иначе показываем текст.
  function run(action: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      onDone?.();
    });
  }

  function handleAdd(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => addSpecificationItem(projectId, facilityId, draft),
      /// Форма добавления остаётся на месте: позиции обычно вводят подряд.
      () => setDraft(emptyFields),
    );
  }

  function handleSave() {
    if (!editing) return;
    const { id, ...fields } = editing;
    run(
      () => updateSpecificationItem(projectId, facilityId, id, fields),
      () => setEditing(null),
    );
  }

  function handleDelete(item: SpecificationItem) {
    if (!window.confirm(`Удалить позицию «${item.name}»?`)) return;
    run(() => deleteSpecificationItem(projectId, facilityId, item.id));
  }

  const total = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className='flex flex-col gap-3'>
      {error && <p className='text-sm text-destructive'>{error}</p>}

      <div className='overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
        <table className='w-full text-left text-sm'>
          <thead className='text-xs text-neutral-500 dark:text-neutral-400'>
            <tr className='border-b border-neutral-200 dark:border-neutral-800'>
              <th className='w-10 px-4 py-3 font-medium'>№</th>
              <th className='px-4 py-3 font-medium'>Наименование</th>
              <th className='px-4 py-3 font-medium'>Модель</th>
              <th className='w-32 px-4 py-3 text-right font-medium'>
                Количество
              </th>
              {canEdit && (
                <th className='w-24 px-4 py-3'>
                  <span className='sr-only'>Действия</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const edited = editing?.id === item.id ? editing : null;

              return (
                <tr
                  key={item.id}
                  className='border-b border-neutral-200 last:border-0 dark:border-neutral-800'
                >
                  <td className='px-4 py-2 text-neutral-500 dark:text-neutral-400'>
                    {index + 1}
                  </td>
                  <td className='px-4 py-2'>
                    {edited ? (
                      <Input
                        value={edited.name}
                        aria-label='Наименование'
                        onChange={(event) =>
                          setEditing({ ...edited, name: event.target.value })
                        }
                      />
                    ) : (
                      item.name
                    )}
                  </td>
                  <td className='px-4 py-2'>
                    {edited ? (
                      <Input
                        value={edited.model}
                        aria-label='Модель'
                        onChange={(event) =>
                          setEditing({ ...edited, model: event.target.value })
                        }
                      />
                    ) : (
                      (item.model ?? '—')
                    )}
                  </td>
                  <td className='px-4 py-2 text-right whitespace-nowrap'>
                    {edited ? (
                      <Input
                        type='number'
                        min={1}
                        step={1}
                        value={edited.quantity}
                        aria-label='Количество'
                        className='text-right'
                        onChange={(event) =>
                          setEditing({
                            ...edited,
                            quantity: toQuantity(event.target.value),
                          })
                        }
                      />
                    ) : (
                      item.quantity
                    )}
                  </td>
                  {canEdit && (
                    <td className='px-4 py-2'>
                      <div className='flex justify-end gap-1'>
                        {edited ? (
                          <>
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label='Сохранить'
                              disabled={isPending}
                              onClick={handleSave}
                            >
                              <Check />
                            </Button>
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label='Отменить'
                              disabled={isPending}
                              onClick={() => setEditing(null)}
                            >
                              <X />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label='Редактировать'
                              disabled={isPending}
                              onClick={() => {
                                setError(null);
                                setEditing({
                                  ...item,
                                  model: item.model ?? '',
                                });
                              }}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label='Удалить'
                              disabled={isPending}
                              onClick={() => handleDelete(item)}
                            >
                              <Trash2 />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 5 : 4}
                  className='px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400'
                >
                  Спецификация пуста
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className='text-sm text-neutral-500 dark:text-neutral-400'>
        Позиций: {items.length} · единиц: {total}
      </p>

      {canEdit && (
        <form
          onSubmit={handleAdd}
          noValidate
          className='flex flex-wrap items-end gap-2'
        >
          <Input
            value={draft.name}
            placeholder='Наименование'
            aria-label='Наименование новой позиции'
            className='w-full sm:w-80'
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          <Input
            value={draft.model}
            placeholder='Модель'
            aria-label='Модель новой позиции'
            className='w-full sm:w-56'
            onChange={(event) =>
              setDraft({ ...draft, model: event.target.value })
            }
          />
          <Input
            type='number'
            min={1}
            step={1}
            value={draft.quantity}
            aria-label='Количество новой позиции'
            className='w-24 text-right'
            onChange={(event) =>
              setDraft({ ...draft, quantity: toQuantity(event.target.value) })
            }
          />
          <Button type='submit' variant='outline' disabled={isPending}>
            <Plus />
            Добавить
          </Button>
        </form>
      )}
    </div>
  );
}
