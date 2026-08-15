'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  stageKeys,
  stageLabels,
  stageSubtaskKeys,
  subtaskLabels,
  taskStatusKeys,
  taskStatusLabels,
} from '@/lib/stages';
import { TaskStatus, type Stages } from '@/lib/types';
import type { NewProjectFormFields } from '@/lib/stages';
import {
  useId,
  useState,
  useTransition,
  type ReactElement,
  type SubmitEvent,
} from 'react';

/// Цвет — единственный видимый признак статуса, текст остаётся в aria-label и
/// title. Обводка окрашена всегда, заливка появляется у выбранного статуса.
const taskStatusColors: Record<TaskStatus, string> = {
  [TaskStatus.NotStarted]:
    'border-zinc-400/60 data-checked:border-zinc-400 data-checked:bg-zinc-400 data-checked:text-background',
  [TaskStatus.InProgress]:
    'border-amber-500/60 data-checked:border-amber-500 data-checked:bg-amber-500 data-checked:text-background',
  [TaskStatus.Completed]:
    'border-emerald-500/60 data-checked:border-emerald-500 data-checked:bg-emerald-500 data-checked:text-background',
};

/// Общий статус этапа: значение, если все применимые подзадачи в одном
/// статусе, иначе null — тогда ни одна радиокнопка этапа не выбрана.
function commonStatus(
  subtasks: Record<string, TaskStatus | null>,
): TaskStatus | null {
  const applicable = Object.values(subtasks).filter(
    (status): status is TaskStatus => status !== null,
  );
  const first = applicable[0] ?? null;

  return applicable.every((status) => status === first) ? first : null;
}

const noErrors = {
  name: false,
  responsible: false,
  dateStart: false,
  duration: false,
};

export type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  /// Значения, с которыми открывается форма: пустые для нового проекта,
  /// текущие — для редактирования.
  initialValues: NewProjectFormFields;
  onSubmit: (
    fields: NewProjectFormFields,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  trigger?: ReactElement;
};

export function ProjectDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialValues,
  onSubmit,
  trigger,
}: ProjectDialogProps) {
  /// Диалогов на странице несколько (по одному на проект), поэтому id полей
  /// уникализируем — иначе label/htmlFor указывали бы на чужие инпуты.
  const fieldId = useId();
  const [formState, setFormState] = useState(initialValues);
  const [errors, setErrors] = useState(noErrors);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /// Форма живёт, пока смонтирован диалог, поэтому при каждом открытии
  /// возвращаем её к initialValues.
  function handleOpenChange(next: boolean) {
    if (next) {
      setFormState(initialValues);
      setErrors(noErrors);
      setSubmitError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = {
      name: formState.name.trim() === '',
      responsible: formState.responsible.trim() === '',
      dateStart: formState.dateStart === '',
      duration: !Number.isFinite(formState.duration) || formState.duration < 1,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitError(null);
    startTransition(async () => {
      const result = await onSubmit(formState);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  function updateField(
    key: 'name' | 'responsible' | 'dateStart',
    value: string,
  ) {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: false }));
  }

  function updateDuration(value: number) {
    setFormState((prev) => ({ ...prev, duration: value }));
    setErrors((prev) => ({ ...prev, duration: false }));
  }

  function updateStage(
    key: keyof Stages,
    patch: Partial<(typeof formState.stages)[keyof Stages]>,
  ) {
    setFormState((prev) => ({
      ...prev,
      stages: { ...prev.stages, [key]: { ...prev.stages[key], ...patch } },
    }));
  }

  function updateSubtask(
    key: keyof Stages,
    subtaskKey: string,
    status: TaskStatus | null,
  ) {
    setFormState((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [key]: {
          ...prev.stages[key],
          subtasks: { ...prev.stages[key].subtasks, [subtaskKey]: status },
        },
      },
    }));
  }

  /// Статус этапа — массовая установка: применяется ко всем применимым
  /// подзадачам (у неприменимых status остаётся null).
  function updateStageStatus(key: keyof Stages, status: TaskStatus) {
    setFormState((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [key]: {
          ...prev.stages[key],
          subtasks: Object.fromEntries(
            Object.entries(prev.stages[key].subtasks).map(
              ([subtaskKey, current]) => [
                subtaskKey,
                current === null ? null : status,
              ],
            ),
          ),
        },
      },
    }));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className='max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* <DialogDescription>
              Заполните данные проекта и выберите этапы. Нажмите «Сохранить»,
              когда закончите.
            </DialogDescription> */}
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className='grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4'
        >
          <FieldGroup className='min-h-0 gap-4 overflow-y-auto pr-1'>
            <div className='grid gap-4 @md/field-group:grid-cols-2'>
              <Field data-invalid={errors.name}>
                <Label htmlFor={`project-name-${fieldId}`}>
                  Название Проекта
                </Label>
                <Input
                  id={`project-name-${fieldId}`}
                  name='name'
                  aria-invalid={errors.name}
                  value={formState.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
                {/* <FieldError>{errors.name && 'Укажите название проекта'}</FieldError> */}
              </Field>
              <Field data-invalid={errors.responsible}>
                <Label htmlFor={`project-responsible-${fieldId}`}>
                  Ответственный
                </Label>
                <Input
                  id={`project-responsible-${fieldId}`}
                  name='responsible'
                  aria-invalid={errors.responsible}
                  value={formState.responsible}
                  onChange={(event) =>
                    updateField('responsible', event.target.value)
                  }
                />
                {/* <FieldError>{errors.responsible && 'Укажите ответственного'}</FieldError> */}
              </Field>
            </div>
            <div className='grid gap-4 @md/field-group:grid-cols-2'>
              <Field data-invalid={errors.dateStart}>
                <Label htmlFor={`project-date-start-${fieldId}`}>
                  Дата начала
                </Label>
                <Input
                  id={`project-date-start-${fieldId}`}
                  name='dateStart'
                  type='date'
                  aria-invalid={errors.dateStart}
                  value={formState.dateStart}
                  onChange={(event) =>
                    updateField('dateStart', event.target.value)
                  }
                />
                {/* <FieldError>{errors.dateStart && 'Укажите дату начала'}</FieldError> */}
              </Field>
              <Field data-invalid={errors.duration}>
                <Label htmlFor={`project-duration-${fieldId}`}>
                  Длительность, р.д.
                </Label>
                <Input
                  id={`project-duration-${fieldId}`}
                  name='duration'
                  type='number'
                  min={1}
                  aria-invalid={errors.duration}
                  value={formState.duration}
                  onChange={(event) =>
                    updateDuration(event.target.valueAsNumber || 0)
                  }
                />
                {/* <FieldError>{errors.duration && 'Укажите длительность'}</FieldError> */}
              </Field>
            </div>

            <FieldSeparator />

            <FieldSet className='gap-3'>
              <FieldLegend variant='label' className='mb-0'>
                Этапы
              </FieldLegend>
              {stageKeys.map((key) => {
                const stage = formState.stages[key];
                return (
                  <div key={key} className='flex flex-col gap-2'>
                    <Field orientation='horizontal'>
                      <Checkbox
                        id={`stage-${key}-${fieldId}`}
                        name={`stages.${key}.include`}
                        checked={stage.include}
                        onCheckedChange={(checked) =>
                          updateStage(key, { include: checked })
                        }
                      />
                      <Label
                        htmlFor={`stage-${key}-${fieldId}`}
                        className='flex-1'
                      >
                        {stageLabels[key]}
                      </Label>
                      <RadioGroup
                        aria-label={`${stageLabels[key]}: статус всех подзадач`}
                        disabled={!stage.include}
                        value={commonStatus(stage.subtasks)}
                        onValueChange={(value) =>
                          updateStageStatus(key, value as TaskStatus)
                        }
                        className='flex flex-row gap-2 data-disabled:opacity-50'
                      >
                        {taskStatusKeys.map((status) => (
                          <RadioGroupItem
                            key={status}
                            value={status}
                            aria-label={`${taskStatusLabels[status]} — все подзадачи`}
                            title={`${taskStatusLabels[status]} — все подзадачи`}
                            className={taskStatusColors[status]}
                          />
                        ))}
                      </RadioGroup>
                      <Input
                        aria-label={`${stageLabels[key]}: длительность, дн.`}
                        name={`stages.${key}.duration`}
                        type='number'
                        min={1}
                        className='w-20'
                        disabled={!stage.include}
                        value={stage.duration}
                        onChange={(event) =>
                          updateStage(key, {
                            duration: event.target.valueAsNumber || 0,
                          })
                        }
                      />
                      <span className='text-sm text-muted-foreground'>дн.</span>
                    </Field>
                    <div className='grid gap-x-6 gap-y-2 pl-6 @md/field-group:grid-cols-2'>
                      {stageSubtaskKeys[key].map((subtaskKey) => {
                        const status = stage.subtasks[subtaskKey];
                        return (
                          <div
                            key={subtaskKey}
                            className='flex flex-row items-center gap-2'
                          >
                            <Label className='min-w-0 flex-1 gap-1.5 text-xs font-normal text-muted-foreground has-disabled:opacity-50 has-data-checked:text-foreground'>
                              <Checkbox
                                name={`stages.${key}.subtasks.${subtaskKey}`}
                                className='size-3.5'
                                disabled={!stage.include}
                                checked={status !== null}
                                onCheckedChange={(checked) =>
                                  updateSubtask(
                                    key,
                                    subtaskKey,
                                    checked ? TaskStatus.NotStarted : null,
                                  )
                                }
                              />
                              <span className='truncate'>
                                {subtaskLabels[subtaskKey] ?? subtaskKey}
                              </span>
                            </Label>
                            <RadioGroup
                              aria-label={`${subtaskLabels[subtaskKey] ?? subtaskKey}: статус`}
                              name={`stages.${key}.subtasks.${subtaskKey}.status`}
                              disabled={!stage.include || status === null}
                              value={status}
                              onValueChange={(value) =>
                                updateSubtask(
                                  key,
                                  subtaskKey,
                                  value as TaskStatus,
                                )
                              }
                              className='flex flex-row gap-1.5 data-disabled:opacity-40'
                            >
                              {taskStatusKeys.map((option) => (
                                <RadioGroupItem
                                  key={option}
                                  value={option}
                                  aria-label={taskStatusLabels[option]}
                                  title={taskStatusLabels[option]}
                                  className={`size-3.5 ${taskStatusColors[option]}`}
                                />
                              ))}
                            </RadioGroup>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </FieldSet>
          </FieldGroup>
          <DialogFooter>
            {submitError && (
              <p className='mr-auto self-center text-sm text-destructive'>
                {submitError}
              </p>
            )}
            <DialogClose render={<Button variant='outline'>Отмена</Button>} />
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Сохранение…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
