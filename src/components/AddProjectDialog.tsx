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
import { newProjectFormFields, stageKeys, stageLabels } from '@/lib/stages';
import type { Stages } from '@/lib/types';
import { createProject } from '@/app/actions';
import { useState, useTransition, type SubmitEvent } from 'react';

export function AddProjectDialog() {
  const [open, setOpen] = useState(false);
  const [formState, setFormState] = useState(newProjectFormFields);
  const [errors, setErrors] = useState({
    name: false,
    responsible: false,
    dateStart: false,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = {
      name: formState.name.trim() === '',
      responsible: formState.responsible.trim() === '',
      dateStart: formState.dateStart === '',
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setSubmitError(null);
    startTransition(async () => {
      const result = await createProject(formState);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      setFormState(newProjectFormFields);
      setOpen(false);
    });
  }

  function updateField(key: keyof typeof errors, value: string) {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: false }));
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant='outline'>Открыть Диалог</Button>}
      />
      <DialogContent className='max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Новый объекта</DialogTitle>
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
            <Field data-invalid={errors.name}>
              <Label htmlFor='project-name'>Название Проекта</Label>
              <Input
                id='project-name'
                name='name'
                aria-invalid={errors.name}
                value={formState.name}
                onChange={(event) => updateField('name', event.target.value)}
              />
              {/* <FieldError>{errors.name && 'Укажите название проекта'}</FieldError> */}
            </Field>
            <Field data-invalid={errors.responsible}>
              <Label htmlFor='project-responsible'>Ответственный</Label>
              <Input
                id='project-responsible'
                name='responsible'
                aria-invalid={errors.responsible}
                value={formState.responsible}
                onChange={(event) =>
                  updateField('responsible', event.target.value)
                }
              />
              {/* <FieldError>{errors.responsible && 'Укажите ответственного'}</FieldError> */}
            </Field>
            <Field data-invalid={errors.dateStart}>
              <Label htmlFor='project-date-start'>Дата начала</Label>
              <Input
                id='project-date-start'
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

            <FieldSeparator />

            <FieldSet className='gap-2'>
              <FieldLegend variant='label' className='mb-0'>
                Этапы
              </FieldLegend>
              {stageKeys.map((key) => {
                const stage = formState.stages[key];
                return (
                  <Field key={key} orientation='horizontal'>
                    <Checkbox
                      id={`stage-${key}`}
                      name={`stages.${key}.include`}
                      checked={stage.include}
                      onCheckedChange={(checked) =>
                        updateStage(key, { include: checked })
                      }
                    />
                    <Label htmlFor={`stage-${key}`} className='flex-1'>
                      {stageLabels[key]}
                    </Label>
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
              {isPending ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
