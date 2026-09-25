'use client';

import {
  useId,
  useState,
  useTransition,
  type ReactElement,
  type SubmitEvent,
} from 'react';

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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ContractSource } from '@/generated/prisma/enums';
import type { ContractFormFields } from '@/lib/contract-form';
import { contractSourceLabels, contractSources } from '@/lib/contract-sources';

/// Обязателен только номер: реестры приходят дырявыми, и пустая ячейка в них —
/// нормальное состояние, а не ошибка ввода (см. validate в
/// src/app/contracts/actions.ts).
const noErrors = { number: false, amount: false };

export type ContractDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialValues: ContractFormFields;
  /// Выбор реестра показываем только при создании: у существующей строки смена
  /// реестра может занять чужую координату в исходном файле, и updateContract
  /// это поле не пишет (см. ContractFormFields).
  sourceField?: boolean;
  onSubmit: (
    fields: ContractFormFields,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  trigger?: ReactElement;
};

export function ContractDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialValues,
  sourceField = false,
  onSubmit,
  trigger,
}: ContractDialogProps) {
  /// Диалогов на странице по одному на строку таблицы, поэтому id полей
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

  function updateField(key: keyof ContractFormFields, value: string) {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: false }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = formState.amount.trim().replace(',', '.');
    const nextErrors = {
      number: formState.number.trim() === '',
      /// Сумма необязательна, но если её ввели — это должно быть число:
      /// текст вместо суммы живёт в отдельном поле «Примечание к сумме».
      amount: amount !== '' && !(Number(amount) >= 0),
    };

    setErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) return;

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

  /// Текстовое поле в одну строку — их здесь девять, и каждое отличается только
  /// подписью и ключом.
  function textField(
    key: keyof ContractFormFields,
    label: string,
    options: { type?: string; invalid?: boolean; placeholder?: string } = {},
  ) {
    return (
      <Field data-invalid={options.invalid}>
        <Label htmlFor={`contract-${key}-${fieldId}`}>{label}</Label>
        <Input
          id={`contract-${key}-${fieldId}`}
          name={key}
          type={options.type}
          placeholder={options.placeholder}
          aria-invalid={options.invalid}
          value={formState[key]}
          onChange={(event) => updateField(key, event.target.value)}
        />
      </Field>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className='max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className='grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4'
        >
          <FieldGroup className='min-h-0 gap-4 overflow-y-auto pr-1'>
            {sourceField && (
              <Field>
                <Label>Реестр</Label>
                <RadioGroup
                  aria-label='Реестр'
                  value={formState.source}
                  onValueChange={(value) =>
                    updateField('source', value as ContractSource)
                  }
                >
                  {contractSources.map((source) => (
                    <Label
                      key={source}
                      className='gap-2 font-normal'
                      htmlFor={`contract-source-${source}-${fieldId}`}
                    >
                      <RadioGroupItem
                        id={`contract-source-${source}-${fieldId}`}
                        value={source}
                      />
                      {contractSourceLabels[source]}
                    </Label>
                  ))}
                </RadioGroup>
              </Field>
            )}

            <div className='grid gap-4 @md/field-group:grid-cols-2'>
              <Field data-invalid={errors.number}>
                <Label htmlFor={`contract-number-${fieldId}`}>
                  Номер договора
                </Label>
                <Input
                  id={`contract-number-${fieldId}`}
                  name='number'
                  aria-invalid={errors.number}
                  value={formState.number}
                  onChange={(event) =>
                    updateField('number', event.target.value)
                  }
                />
                <FieldError>{errors.number && 'Укажите номер'}</FieldError>
              </Field>
              {textField('signedAt', 'Дата подписания', { type: 'date' })}
            </div>

            <div className='grid gap-4 @md/field-group:grid-cols-2'>
              {textField('counterparty', 'Контрагент')}
              {textField('objectName', 'Объект')}
            </div>

            <Field>
              <Label htmlFor={`contract-subject-${fieldId}`}>Предмет</Label>
              <Textarea
                id={`contract-subject-${fieldId}`}
                name='subject'
                rows={3}
                value={formState.subject}
                onChange={(event) => updateField('subject', event.target.value)}
              />
            </Field>

            <div className='grid gap-4 @md/field-group:grid-cols-2'>
              <Field data-invalid={errors.amount}>
                <Label htmlFor={`contract-amount-${fieldId}`}>Сумма, ₽</Label>
                <Input
                  id={`contract-amount-${fieldId}`}
                  name='amount'
                  inputMode='decimal'
                  aria-invalid={errors.amount}
                  value={formState.amount}
                  onChange={(event) =>
                    updateField('amount', event.target.value)
                  }
                />
                <FieldError>
                  {errors.amount && 'Сумма должна быть числом'}
                </FieldError>
              </Field>
              <Field>
                <Label htmlFor={`contract-amountNote-${fieldId}`}>
                  Примечание к сумме
                </Label>
                <Input
                  id={`contract-amountNote-${fieldId}`}
                  name='amountNote'
                  value={formState.amountNote}
                  onChange={(event) =>
                    updateField('amountNote', event.target.value)
                  }
                />
                <FieldDescription>
                  Показывается вместо суммы, если сумма не заполнена.
                </FieldDescription>
              </Field>
            </div>

            <div className='grid gap-4 @md/field-group:grid-cols-2'>
              {textField('vatNote', 'НДС', { placeholder: 'НДС 20%' })}
              {textField('dsNote', 'Допсоглашение')}
            </div>

            <div className='grid gap-4 @md/field-group:grid-cols-2'>
              {textField('endsAt', 'Срок до', { type: 'date' })}
              {textField('termText', 'Срок текстом', {
                placeholder: '180 к.д.',
              })}
            </div>

            {textField('statusText', 'Статус')}
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
