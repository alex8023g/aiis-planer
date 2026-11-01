'use client';

import { Plus } from 'lucide-react';
import { useId, useState, useTransition, type SubmitEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createModem, type NewModemFields } from './actions';

const emptyFields: NewModemFields = {
  type: '',
  imei: '',
  simNumber: '',
  ip: '',
  provider: '',
};

/// Все поля необязательны: модем заводят, ещё не зная о нём всего, и
/// дописывают потом.
export function AddModemDialog({ projectId }: { projectId: string }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(emptyFields);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /// Форма живёт, пока смонтирован диалог, поэтому при каждом открытии
  /// очищаем её.
  function handleOpenChange(next: boolean) {
    if (next) {
      setFields(emptyFields);
      setSubmitError(null);
    }
    setOpen(next);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    startTransition(async () => {
      const result = await createModem(projectId, fields);

      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  function input(key: keyof NewModemFields, label: string, mono = false) {
    const id = `modem-${key}-${fieldId}`;

    return (
      <Field>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          name={key}
          autoComplete='off'
          className={mono ? 'font-mono' : undefined}
          value={fields[key]}
          onChange={(event) =>
            setFields((prev) => ({ ...prev, [key]: event.target.value }))
          }
        />
      </Field>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant='outline'>
            <Plus />
            Добавить модем с сим-картой
          </Button>
        }
      />
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Добавить модем с сим-картой</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className='grid gap-4'>
          <FieldGroup className='gap-3'>
            {input('type', 'Тип модема')}
            {input('imei', 'IMEI', true)}
            {input('simNumber', '№ SIM-карты')}
            {input('ip', 'IP', true)}
            {input('provider', 'Оператор')}
          </FieldGroup>
          <DialogFooter>
            {submitError && (
              <p className='mr-auto self-center text-sm text-destructive'>
                {submitError}
              </p>
            )}
            <DialogClose render={<Button variant='outline'>Отмена</Button>} />
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Сохранение…' : 'Добавить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
