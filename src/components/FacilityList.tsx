'use client';

import { Check, ListTree, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition, type SubmitEvent } from 'react';

import {
  addFacility,
  deleteFacility,
  updateFacility,
  type FacilityFields,
} from '@/app/projects/[id]/aiis/actions';
import { MeasurementPointTable } from '@/components/MeasurementPointTable';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  ActionResult,
  FacilityWithContent,
  MeasurementPoint,
} from '@/lib/types';

const emptyFields: FacilityFields = {
  name: '',
  currentDescription: '',
  technicalSolution: '',
};

/// Сколько единиц оборудования ставят на объекте: позиции складываются по
/// количеству, а не считаются строками.
function unitsOf(facility: FacilityWithContent): number {
  return facility.specification.reduce((sum, item) => sum + item.quantity, 0);
}

/// Объекты проекта: у каждого своё описание, свои точки учёта и своя
/// спецификация. Точки ведёт MeasurementPointTable, спецификацию — отдельная
/// страница объекта; здесь — сами объекты и то, что видно о них сразу.
export function FacilityList({
  projectId,
  facilities,
  unassigned,
  canEdit,
}: {
  projectId: string;
  facilities: FacilityWithContent[];
  /// Точки, за которыми объект ещё не закреплён: идут последней группой.
  unassigned: MeasurementPoint[];
  /// Может ли текущий пользователь менять проект (см. canEditProject).
  /// Экшены проверяют это заново: спрятанной кнопки мало.
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /// id объекта, который сейчас правят, и его значения. null — правок нет.
  const [editing, setEditing] = useState<
    (FacilityFields & { id: string }) | null
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
      () => addFacility(projectId, draft),
      /// Форма добавления остаётся на месте: объекты обычно заводят подряд.
      () => setDraft(emptyFields),
    );
  }

  function handleSave() {
    if (!editing) return;
    const { id, ...fields } = editing;
    run(
      () => updateFacility(projectId, id, fields),
      () => setEditing(null),
    );
  }

  function handleDelete(facility: FacilityWithContent) {
    /// Точки объекта останутся в проекте, а спецификация уйдёт вместе с ним —
    /// про то и другое предупреждаем заранее, отменить удаление нельзя.
    const parts = [
      facility.points.length > 0 &&
        `точки (${facility.points.length}) останутся в проекте без объекта`,
      facility.specification.length > 0 &&
        `спецификация (позиций: ${facility.specification.length}) будет удалена`,
    ].filter((part) => part !== false);

    const warning = parts.length
      ? `Удалить объект «${facility.name}»? Его ${parts.join(', ')}.`
      : `Удалить объект «${facility.name}»?`;

    if (!window.confirm(warning)) return;

    run(() => deleteFacility(projectId, facility.id));
  }

  /// Группа «Без объекта» — вход для новых точек: их набирают по проекту
  /// списком, а раскладывают по объектам потом. Поэтому редактору она видна
  /// всегда, даже пустая; смотрящему — только когда в ней что-то есть.
  const showUnassigned = unassigned.length > 0 || canEdit;

  return (
    <div className='flex flex-col gap-4'>
      {error && <p className='text-sm text-destructive'>{error}</p>}

      {facilities.map((facility) => {
        const edited = editing?.id === facility.id ? editing : null;
        const items = facility.specification.length;

        return (
          <section
            key={facility.id}
            className='rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
          >
            <div className='mb-3 flex flex-wrap items-start gap-2'>
              {edited ? (
                <div className='flex flex-1 flex-col gap-2'>
                  <Input
                    value={edited.name}
                    placeholder='Название объекта'
                    aria-label='Название объекта'
                    className='w-full sm:w-80'
                    onChange={(event) =>
                      setEditing({ ...edited, name: event.target.value })
                    }
                  />
                  <Textarea
                    value={edited.currentDescription}
                    placeholder='Что на объекте сейчас'
                    aria-label='Текущее состояние объекта'
                    className='w-full sm:max-w-2xl'
                    onChange={(event) =>
                      setEditing({
                        ...edited,
                        currentDescription: event.target.value,
                      })
                    }
                  />
                  <Textarea
                    value={edited.technicalSolution}
                    placeholder='Техническое решение: что делаем'
                    aria-label='Техническое решение'
                    className='w-full sm:max-w-2xl'
                    onChange={(event) =>
                      setEditing({
                        ...edited,
                        technicalSolution: event.target.value,
                      })
                    }
                  />
                </div>
              ) : (
                <div className='flex flex-1 flex-col gap-1'>
                  <div className='flex flex-wrap items-baseline gap-x-3'>
                    <h2 className='text-base font-semibold tracking-tight'>
                      {facility.name}
                    </h2>
                    <span className='text-xs text-neutral-500 dark:text-neutral-400'>
                      точек: {facility.points.length} ·{' '}
                      {items > 0
                        ? `позиций: ${items} · единиц: ${unitsOf(facility)}`
                        : 'спецификация пуста'}
                    </span>
                  </div>
                  {/* Оба текста держатся переносами строк: их набирают
                      абзацами, а не одной строкой. Пустой не показываем — с
                      подписью он выглядел бы недописанным, а не пустым. */}
                  {facility.currentDescription && (
                    <p className='max-w-3xl text-sm whitespace-pre-line text-neutral-600 dark:text-neutral-300'>
                      <span className='text-neutral-500 dark:text-neutral-400'>
                        Сейчас:{' '}
                      </span>
                      {facility.currentDescription}
                    </p>
                  )}
                  {facility.technicalSolution && (
                    <p className='max-w-3xl text-sm whitespace-pre-line text-neutral-600 dark:text-neutral-300'>
                      <span className='text-neutral-500 dark:text-neutral-400'>
                        Решение:{' '}
                      </span>
                      {facility.technicalSolution}
                    </p>
                  )}
                </div>
              )}

              <div className='ml-auto flex items-center gap-1'>
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
                    <Link
                      href={`/projects/${projectId}/aiis/${facility.id}`}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      <ListTree />
                      {canEdit ? 'Заполнить' : 'Спецификация'}
                    </Link>
                    {canEdit && (
                      <>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          aria-label='Редактировать объект'
                          disabled={isPending}
                          onClick={() => {
                            setError(null);
                            setEditing({
                              id: facility.id,
                              name: facility.name,
                              currentDescription: facility.currentDescription,
                              technicalSolution: facility.technicalSolution,
                            });
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          aria-label='Удалить объект'
                          disabled={isPending}
                          onClick={() => handleDelete(facility)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <MeasurementPointTable
              projectId={projectId}
              facilityId={facility.id}
              facilities={facilities}
              points={facility.points}
              canEdit={canEdit}
            />
          </section>
        );
      })}

      {showUnassigned && (
        <section className='rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
          <div className='mb-3 flex flex-wrap items-baseline gap-x-3'>
            {/* Это не объект, а место для новых точек: сюда их заводят, пока
                не решено, к какому объекту они относятся. Ни описания, ни
                спецификации у группы быть не может. */}
            <h2 className='text-base font-semibold tracking-tight'>
              Без объекта
            </h2>
            <span className='text-xs text-neutral-500 dark:text-neutral-400'>
              точек: {unassigned.length}
            </span>
          </div>

          <MeasurementPointTable
            projectId={projectId}
            facilityId={null}
            facilities={facilities}
            points={unassigned}
            canEdit={canEdit}
          />
        </section>
      )}

      {canEdit && (
        <form
          onSubmit={handleAdd}
          noValidate
          className='flex flex-col items-start gap-2'
        >
          <Input
            value={draft.name}
            placeholder='Название объекта'
            aria-label='Название нового объекта'
            className='w-full sm:w-80'
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          <Textarea
            value={draft.currentDescription}
            placeholder='Что на объекте сейчас'
            aria-label='Текущее состояние нового объекта'
            className='w-full sm:max-w-2xl'
            onChange={(event) =>
              setDraft({ ...draft, currentDescription: event.target.value })
            }
          />
          <Textarea
            value={draft.technicalSolution}
            placeholder='Техническое решение: что делаем'
            aria-label='Техническое решение нового объекта'
            className='w-full sm:max-w-2xl'
            onChange={(event) =>
              setDraft({ ...draft, technicalSolution: event.target.value })
            }
          />
          <Button type='submit' variant='outline' disabled={isPending}>
            <Plus />
            Добавить объект
          </Button>
        </form>
      )}
    </div>
  );
}
