'use client';

import { Paperclip, Trash2, X } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  useTransition,
  type ReactElement,
  type SubmitEvent,
} from 'react';

import {
  deleteContractFile,
  uploadContractFile,
} from '@/app/contracts/actions';
import { FileBadge } from '@/components/FileBadge';
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
import {
  formatSize,
  MAX_FILE_SIZE,
  openHref,
  splitFileName,
  type ContractFileItem,
} from '@/lib/contract-files';
import type { ContractFormFields } from '@/lib/contract-form';
import { contractSourceLabels, contractSources } from '@/lib/contract-sources';

/// Обязателен только номер: реестры приходят дырявыми, и пустая ячейка в них —
/// нормальное состояние, а не ошибка ввода (см. validate в
/// src/app/contracts/actions.ts).
const noErrors = { number: false, amount: false };

/// Те же типы, что пропускает uploadContractFile: фильтр в окне выбора лишь
/// подсказка, настоящая проверка — на сервере.
const acceptedFiles =
  '.pdf,.jpg,.jpeg,.png,.heic,.tif,.tiff,.doc,.docx,.xls,.xlsx';

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
  /// id нужен, чтобы после сохранения загрузить выбранные в форме файлы: у
  /// нового договора его до createContract просто нет.
  onSubmit: (
    fields: ContractFormFields,
  ) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  trigger?: ReactElement;
  /// Уже приложенные файлы — только у существующего договора. После удаления
  /// список обновится сам: экшен дёргает revalidatePath, и страница передаст
  /// новый files.
  files?: ContractFileItem[];
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
  files = [],
}: ContractDialogProps) {
  /// Диалогов на странице по одному на строку таблицы, поэтому id полей
  /// уникализируем — иначе label/htmlFor указывали бы на чужие инпуты.
  const fieldId = useId();
  const [formState, setFormState] = useState(initialValues);
  const [errors, setErrors] = useState(noErrors);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /// Договор уже сохранён, но часть файлов не загрузилась. Повторная отправка
  /// тогда только догружает файлы: второй createContract завёл бы дубль.
  const [savedId, setSavedId] = useState<string | null>(null);

  /// Форма живёт, пока смонтирован диалог, поэтому при каждом открытии
  /// возвращаем её к initialValues.
  function handleOpenChange(next: boolean) {
    if (next) {
      setFormState(initialValues);
      setErrors(noErrors);
      setSubmitError(null);
      setPendingFiles([]);
      setFileError(null);
      setSavedId(null);
    }
    onOpenChange(next);
  }

  function updateField(key: keyof ContractFormFields, value: string) {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: false }));
  }

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const tooBig = picked.filter((file) => file.size > MAX_FILE_SIZE);

    setFileError(
      tooBig.length > 0
        ? `Больше ${formatSize(MAX_FILE_SIZE)}: ${tooBig.map((file) => file.name).join(', ')}`
        : null,
    );
    setPendingFiles((prev) => [
      ...prev,
      ...picked.filter((file) => file.size <= MAX_FILE_SIZE),
    ]);
  }

  /// Удаление сразу, без «Сохранить»: файл лежит отдельно от полей формы, и
  /// «Отмена» его всё равно не вернула бы.
  function handleDeleteFile(file: ContractFileItem) {
    if (!window.confirm(`Удалить файл «${file.fileName}»?`)) return;

    setFileError(null);
    startTransition(async () => {
      const result = await deleteContractFile(file.id);

      if (!result.ok) setFileError(result.error);
    });
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  /// Загружаем по одному: экшен принимает один файл, а общий размер пачки
  /// упёрся бы в bodySizeLimit. Возвращаем то, что не загрузилось.
  async function uploadPending(contractId: string) {
    const failed: File[] = [];
    const messages: string[] = [];

    for (const file of pendingFiles) {
      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadContractFile(contractId, formData);

      if (!result.ok) {
        failed.push(file);
        messages.push(`«${file.name}»: ${result.error}`);
      }
    }

    return { failed, messages };
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
      let contractId = savedId;

      if (!contractId) {
        const result = await onSubmit(formState);

        if (!result.ok) {
          setSubmitError(result.error);
          return;
        }

        contractId = result.id;
      }

      const { failed, messages } = await uploadPending(contractId);

      if (failed.length > 0) {
        setSavedId(contractId);
        setPendingFiles(failed);
        setSubmitError(
          `Договор сохранён, но файлы не загружены — ${messages.join('; ')}`,
        );
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

            <Field>
              <Label>Файлы</Label>
              {files.length > 0 && (
                <ul className='divide-y divide-border rounded-md border'>
                  {files.map((file) => {
                    const href = `/api/contracts/files/${file.id}`;
                    const open = openHref(file);

                    return (
                      <li
                        key={file.id}
                        className='flex items-center gap-2 py-1 pr-1 pl-3 text-sm'
                      >
                        <FileBadge fileName={file.fileName} />
                        <a
                          href={open ?? href}
                          {...(open && {
                            target: '_blank',
                            rel: 'noopener noreferrer',
                          })}
                          title={file.fileName}
                          className='min-w-0 flex-1 truncate underline-offset-2 hover:underline'
                        >
                          {splitFileName(file.fileName).base}
                        </a>
                        <span className='text-xs text-muted-foreground'>
                          {formatSize(file.size)}
                        </span>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-sm'
                          aria-label={`Удалить ${file.fileName}`}
                          disabled={isPending}
                          onClick={() => handleDeleteFile(file)}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {pendingFiles.length > 0 && (
                <ul className='divide-y divide-border rounded-md border'>
                  {pendingFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className='flex items-center gap-2 py-1 pr-1 pl-3 text-sm'
                    >
                      <FileBadge fileName={file.name} />
                      <span
                        className='min-w-0 flex-1 truncate'
                        title={file.name}
                      >
                        {splitFileName(file.name).base}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {formatSize(file.size)}
                      </span>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`Убрать ${file.name}`}
                        disabled={isPending}
                        onClick={() => removeFile(index)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileInputRef}
                type='file'
                multiple
                hidden
                accept={acceptedFiles}
                onChange={(event) => {
                  addFiles(event.target.files);
                  /// Иначе повторный выбор того же файла не вызовет onChange.
                  event.target.value = '';
                }}
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='w-fit!'
                disabled={isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip />
                Прикрепить файл
              </Button>
              <FieldError>{fileError}</FieldError>
              <FieldDescription>
                PDF, изображения, Word и Excel. До {formatSize(MAX_FILE_SIZE)}.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            {submitError && (
              <p className='mr-auto self-center text-sm text-destructive'>
                {submitError}
              </p>
            )}
            <DialogClose render={<Button variant='outline'>Отмена</Button>} />
            <Button type='submit' disabled={isPending}>
              {isPending
                ? pendingFiles.length > 0
                  ? 'Сохранение и загрузка…'
                  : 'Сохранение…'
                : savedId
                  ? 'Загрузить файлы'
                  : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
