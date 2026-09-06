'use client';

import { ArrowRight, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, useTransition, type SubmitEvent } from 'react';

import {
  addMeasurementPoint,
  deleteMeasurementPoint,
  moveMeasurementPoints,
  updateMeasurementPoint,
  type MeasurementPointFields,
} from '@/app/projects/[id]/aiis/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { ActionResult, Facility, MeasurementPoint } from '@/lib/types';

/// Готового select в ui/ нет, а заводить его ради одного поля незачем: беру
/// нативный и повторяю оформление Input.
const selectClass =
  'h-8 min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

/// Точки одного объекта. Таблица знает только свою группу: объект новой точки
/// не спрашивается — он и есть тот, под чьим заголовком стоит форма.
export function MeasurementPointTable({
  projectId,
  facilityId,
  facilities,
  points,
  canEdit,
}: {
  projectId: string;
  /// Объект этой группы; null — точки, за которыми объект ещё не закреплён.
  facilityId: string | null;
  /// Все объекты проекта: нужны, чтобы точку можно было перенести на другой.
  facilities: Facility[];
  points: MeasurementPoint[];
  /// Может ли текущий пользователь менять проект (см. canEditProject).
  /// Экшены проверяют это заново: спрятанной кнопки мало.
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /// id точки, которую сейчас правят, и её значения. null — правок нет.
  const [editing, setEditing] = useState<
    (MeasurementPointFields & { id: string }) | null
  >(null);
  const [draft, setDraft] = useState({
    name: '',
    meterModel: '',
    meterNumber: '',
    meterLocation: '',
  });
  /// Отмеченные точки: их переносят на объект пачкой. Набор живёт только пока
  /// с ним работают — после переноса страница приходит заново, и он ни к чему.
  const [selected, setSelected] = useState<string[]>([]);
  /// Объект, на который переносим отмеченное. Пустая строка — «Без объекта».
  const [moveTo, setMoveTo] = useState('');

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
      () =>
        addMeasurementPoint(projectId, {
          ...draft,
          facilityId: facilityId ?? '',
        }),
      /// Форма добавления остаётся на месте: точки обычно заводят подряд.
      () =>
        setDraft({
          name: '',
          meterModel: '',
          meterNumber: '',
          meterLocation: '',
        }),
    );
  }

  function handleSave() {
    if (!editing) return;
    const { id, ...fields } = editing;
    run(
      () => updateMeasurementPoint(projectId, id, fields),
      () => setEditing(null),
    );
  }

  function toggle(id: string) {
    setError(null);
    setSelected((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  function handleMove(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => moveMeasurementPoints(projectId, selected, moveTarget),
      () => setSelected([]),
    );
  }

  function handleDelete(point: MeasurementPoint) {
    if (!window.confirm(`Удалить точку учёта «${point.name}»?`)) return;
    run(
      () => deleteMeasurementPoint(projectId, point.id),
      () => setSelected((current) => current.filter((id) => id !== point.id)),
    );
  }

  /// Куда переносить: любой объект, кроме того, на котором точки уже стоят, —
  /// и «Без объекта», если они не здесь. Перенос на себя же ничего не менял бы.
  const moveTargets = [
    ...(facilityId === null ? [] : [{ id: '', name: 'Без объекта' }]),
    ...facilities.filter((facility) => facility.id !== facilityId),
  ];
  const allSelected = points.length > 0 && selected.length === points.length;
  /// Выбранный объект может исчезнуть из списка (его удалили или переименовали
  /// группу), да и по умолчанию в состоянии пусто — тогда берём первый
  /// доступный, чтобы кнопка переносила туда же, что показано в поле.
  const moveTarget =
    moveTargets.find((target) => target.id === moveTo)?.id ??
    moveTargets[0]?.id ??
    '';

  /// Колонок в строке: номер, наименование, модель, заводской номер, место
  /// установки и, для редактора, ещё отметка и действия.
  const columns = canEdit ? 7 : 5;

  return (
    <div className='flex flex-col gap-2'>
      {error && <p className='text-sm text-destructive'>{error}</p>}

      <div className='overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800'>
        <table className='w-full text-left text-sm'>
          <thead className='text-xs text-neutral-500 dark:text-neutral-400'>
            <tr className='border-b border-neutral-200 dark:border-neutral-800'>
              {canEdit && (
                <th className='w-8 py-2 pl-4'>
                  <Checkbox
                    aria-label='Отметить все точки группы'
                    checked={allSelected}
                    disabled={points.length === 0}
                    onCheckedChange={(checked) => {
                      setError(null);
                      setSelected(
                        checked ? points.map((point) => point.id) : [],
                      );
                    }}
                  />
                </th>
              )}
              <th className='w-10 px-4 py-2 font-medium'>№</th>
              <th className='px-4 py-2 font-medium'>Наименование</th>
              <th className='px-4 py-2 font-medium'>Модель прибора учёта</th>
              <th className='px-4 py-2 font-medium'>Заводской номер</th>
              <th className='px-4 py-2 font-medium'>Место установки</th>
              {canEdit && (
                <th className='w-24 px-4 py-2'>
                  <span className='sr-only'>Действия</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => {
              const edited = editing?.id === point.id ? editing : null;

              /// Правка занимает всю строку: в ней есть ещё и объект, а
              /// отдельной колонки под него нет — внутри группы он у всех точек
              /// один и тот же, и колонка стояла бы пустой.
              if (edited) {
                return (
                  <tr
                    key={point.id}
                    className='border-b border-neutral-200 last:border-0 dark:border-neutral-800'
                  >
                    <td colSpan={columns} className='px-4 py-2'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Input
                          value={edited.name}
                          aria-label='Наименование'
                          className='w-full sm:w-72'
                          onChange={(event) =>
                            setEditing({ ...edited, name: event.target.value })
                          }
                        />
                        <Input
                          value={edited.meterModel}
                          aria-label='Модель прибора учёта'
                          className='w-full sm:w-56'
                          onChange={(event) =>
                            setEditing({
                              ...edited,
                              meterModel: event.target.value,
                            })
                          }
                        />
                        <Input
                          value={edited.meterNumber}
                          aria-label='Заводской номер прибора учёта'
                          className='w-full sm:w-40'
                          onChange={(event) =>
                            setEditing({
                              ...edited,
                              meterNumber: event.target.value,
                            })
                          }
                        />
                        <Input
                          value={edited.meterLocation}
                          aria-label='Место установки прибора учёта'
                          className='w-full sm:w-48'
                          onChange={(event) =>
                            setEditing({
                              ...edited,
                              meterLocation: event.target.value,
                            })
                          }
                        />
                        <select
                          value={edited.facilityId}
                          aria-label='Объект'
                          className={selectClass}
                          onChange={(event) =>
                            setEditing({
                              ...edited,
                              facilityId: event.target.value,
                            })
                          }
                        >
                          <option value=''>Без объекта</option>
                          {facilities.map((facility) => (
                            <option key={facility.id} value={facility.id}>
                              {facility.name}
                            </option>
                          ))}
                        </select>
                        <div className='ml-auto flex gap-1'>
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
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={point.id}
                  className='border-b border-neutral-200 last:border-0 dark:border-neutral-800'
                >
                  {canEdit && (
                    <td className='py-2 pl-4'>
                      <Checkbox
                        aria-label={`Отметить точку «${point.name}»`}
                        checked={selected.includes(point.id)}
                        onCheckedChange={() => toggle(point.id)}
                      />
                    </td>
                  )}
                  <td className='px-4 py-2 text-neutral-500 dark:text-neutral-400'>
                    {index + 1}
                  </td>
                  <td className='px-4 py-2'>{point.name}</td>
                  <td className='px-4 py-2'>{point.meterModel ?? '—'}</td>
                  <td className='px-4 py-2 whitespace-nowrap'>
                    {point.meterNumber ?? '—'}
                  </td>
                  <td className='px-4 py-2'>{point.meterLocation ?? '—'}</td>
                  {canEdit && (
                    <td className='px-4 py-2'>
                      <div className='flex justify-end gap-1'>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          aria-label='Редактировать'
                          disabled={isPending}
                          onClick={() => {
                            setError(null);
                            setEditing({
                              id: point.id,
                              name: point.name,
                              meterModel: point.meterModel ?? '',
                              meterNumber: point.meterNumber ?? '',
                              meterLocation: point.meterLocation ?? '',
                              facilityId: point.facilityId ?? '',
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
                          onClick={() => handleDelete(point)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {points.length === 0 && (
              <tr>
                <td
                  colSpan={columns}
                  className='px-4 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400'
                >
                  Точек учёта нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Панель переноса появляется вместе с отметками: пока ничего не
          отмечено, переносить нечего, и место она не занимает. */}
      {canEdit && selected.length > 0 && moveTargets.length > 0 && (
        <form
          onSubmit={handleMove}
          noValidate
          className='flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950/40'
        >
          <span className='text-sm'>Отмечено точек: {selected.length}</span>
          <select
            value={moveTarget}
            aria-label='Куда перенести отмеченные точки'
            className={selectClass}
            onChange={(event) => setMoveTo(event.target.value)}
          >
            {moveTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
          <Button
            type='submit'
            variant='outline'
            size='sm'
            disabled={isPending}
          >
            <ArrowRight />
            Перенести
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={isPending}
            onClick={() => setSelected([])}
          >
            Снять отметки
          </Button>
        </form>
      )}

      {canEdit && (
        <form
          onSubmit={handleAdd}
          noValidate
          className='flex flex-wrap items-end gap-2'
        >
          <Input
            value={draft.name}
            placeholder='Наименование точки'
            aria-label='Наименование новой точки'
            className='w-full sm:w-72'
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          <Input
            value={draft.meterModel}
            placeholder='Модель прибора учёта'
            aria-label='Модель прибора учёта новой точки'
            className='w-full sm:w-56'
            onChange={(event) =>
              setDraft({ ...draft, meterModel: event.target.value })
            }
          />
          <Input
            value={draft.meterNumber}
            placeholder='Заводской номер'
            aria-label='Заводской номер прибора учёта новой точки'
            className='w-full sm:w-40'
            onChange={(event) =>
              setDraft({ ...draft, meterNumber: event.target.value })
            }
          />
          <Input
            value={draft.meterLocation}
            placeholder='Место установки'
            aria-label='Место установки прибора учёта новой точки'
            className='w-full sm:w-48'
            onChange={(event) =>
              setDraft({ ...draft, meterLocation: event.target.value })
            }
          />
          <Button
            type='submit'
            variant='outline'
            size='sm'
            disabled={isPending}
          >
            <Plus />
            Добавить точку
          </Button>
        </form>
      )}
    </div>
  );
}
