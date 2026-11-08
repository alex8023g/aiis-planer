'use client';

import { useId, useState, useTransition, type SubmitEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SurveyTi } from '@/lib/survey-ti';

import { replaceMeter } from './actions';

type MeterForm = { type: string; number: string };
type Editable = { type: boolean; number: boolean };

const emptyForm: MeterForm = { type: '', number: '' };

/// Замена счётчика ТИ: что стоит сейчас и что ставим взамен — тип и номер.
/// «Заменить» снимает текущий и ставит новый (см. replaceMeter). Пустые поля
/// перед этим можно дописать; записанное только показываем — его правят в
/// ячейках таблицы.
export function ReplaceMeterDialog({
  projectId,
  ti,
  open,
  onOpenChange,
}: {
  projectId: string;
  ti: SurveyTi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [current, setCurrent] = useState(emptyForm);
  const [proposed, setProposed] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /// Открывает диалог кнопка снаружи, onOpenChange(true) не приходит:
  /// форму чистим, когда open стал true.
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setCurrent(emptyForm);
      setProposed(emptyForm);
      setError(null);
    }
  }

  const currentEditable = editableFields(ti.currentMeter);
  const proposedEditable = editableFields(ti.proposedMeter);
  /// Новый счётчик без типа: ставить нечего.
  const proposedTypeMissing =
    !ti.proposedMeter?.type && proposed.type.trim() === '';

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (proposedTypeMissing) {
      setError('Укажите тип нового счётчика');
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await replaceMeter(projectId, ti.id, {
        current: changedFields(current, currentEditable),
        proposed: changedFields(proposed, proposedEditable),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            Замена счётчика{ti.number ? ` — ТИ ${ti.number}` : ''}
          </DialogTitle>
          {ti.name && (
            <p className='text-sm text-muted-foreground'>{ti.name}</p>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className='grid gap-4'>
          <FieldGroup className='gap-4'>
            <MeterFieldSet
              legend='Текущий'
              meter={ti.currentMeter}
              editable={currentEditable}
              form={current}
              onChange={setCurrent}
              disabled={isPending}
            />
            <MeterFieldSet
              legend='Новый'
              meter={ti.proposedMeter}
              editable={proposedEditable}
              form={proposed}
              onChange={setProposed}
              disabled={isPending}
              typeInvalid={error !== null && proposedTypeMissing}
            />
          </FieldGroup>
          {error && <p className='text-sm text-destructive'>{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant='outline' type='button' />}>
              Отмена
            </DialogClose>
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Заменяем…' : 'Заменить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/// Правимы поля, пустые в базе.
function editableFields(
  meter: { type: string | null; number: string | null } | null,
): Editable {
  return { type: !meter?.type, number: !meter?.number };
}

/// В экшен — только правимые поля; остальные null: их не трогаем.
function changedFields(form: MeterForm, editable: Editable) {
  return {
    type: editable.type ? form.type : null,
    number: editable.number ? form.number : null,
  };
}

/// Счётчик в диалоге: пустое поле — ввод, записанное — текстом.
function MeterFieldSet({
  legend,
  meter,
  editable,
  form,
  onChange,
  disabled,
  typeInvalid = false,
}: {
  legend: string;
  meter: { type: string | null; number: string | null } | null;
  editable: Editable;
  form: MeterForm;
  onChange: (form: MeterForm) => void;
  disabled: boolean;
  typeInvalid?: boolean;
}) {
  const fieldId = useId();

  return (
    <FieldSet>
      <FieldLegend>{legend}</FieldLegend>
      {editable.type ? (
        <Field data-invalid={typeInvalid}>
          <Label htmlFor={`type-${fieldId}`}>Тип</Label>
          <Input
            id={`type-${fieldId}`}
            value={form.type}
            disabled={disabled}
            aria-invalid={typeInvalid}
            onChange={(event) => onChange({ ...form, type: event.target.value })}
          />
        </Field>
      ) : (
        <MeterValue label='Тип' value={meter?.type} />
      )}
      {editable.number ? (
        <Field>
          <Label htmlFor={`number-${fieldId}`}>Номер</Label>
          <Input
            id={`number-${fieldId}`}
            value={form.number}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...form, number: event.target.value })
            }
          />
        </Field>
      ) : (
        <MeterValue label='Номер' value={meter?.number} />
      )}
    </FieldSet>
  );
}

/// Значение без правки: подпись и текст, пустое — прочерком.
function MeterValue({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className='grid grid-cols-[5rem_1fr] gap-2 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}
