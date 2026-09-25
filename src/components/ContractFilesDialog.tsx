'use client';

import dayjs from 'dayjs';
import { Download, Trash2 } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import {
  deleteContractFile,
  uploadContractFile,
} from '@/app/contracts/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formatSize,
  MAX_FILE_SIZE,
  type ContractFileItem,
} from '@/lib/contract-files';

export function ContractFilesDialog({
  contractId,
  contractNumber,
  files,
  open,
  onOpenChange,
}: {
  contractId: string;
  contractNumber: string;
  /// Список приходит со страницы уже загруженным: она серверная и всё равно
  /// ходит в базу за строками таблицы.
  files: ContractFileItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fieldId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /// Смена ключа заставляет React выбросить старый <input type='file'> и
  /// поставить новый: значение такого поля нельзя сбросить из кода, а после
  /// загрузки имя файла не должно висеть в поле.
  const [inputKey, setInputKey] = useState(0);

  function reset() {
    setFile(null);
    setError(null);
    setInputKey((key) => key + 1);
  }

  /// Диалог остаётся смонтированным и после закрытия, поэтому чистим форму при
  /// каждом открытии — как в ContractDialog.
  function handleOpenChange(next: boolean) {
    if (next) reset();

    onOpenChange(next);
  }

  function handleUpload() {
    if (!file) return setError('Выберите файл');

    /// Проверяем до отправки: файл больше bodySizeLimit Next оборвёт сам, и
    /// до экшена с его понятным текстом дело не дойдёт.
    if (file.size > MAX_FILE_SIZE) {
      return setError(`Файл больше ${formatSize(MAX_FILE_SIZE)}`);
    }

    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const result = await uploadContractFile(contractId, formData);

      if (!result.ok) return setError(result.error);

      /// Список файлов приедет сам: экшен дёргает revalidatePath, и страница
      /// передаст диалогу новый files. Наше дело — освободить поле.
      reset();
    });
  }

  function handleDelete(item: ContractFileItem) {
    if (!window.confirm(`Удалить файл «${item.fileName}»?`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteContractFile(item.id);

      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Файлы: {contractNumber}</DialogTitle>
        </DialogHeader>

        <div className='min-h-0 overflow-y-auto pr-1'>
          {files.length === 0 ? (
            <p className='py-4 text-sm text-muted-foreground'>
              Файлов пока нет.
            </p>
          ) : (
            <ul className='divide-y divide-border'>
              {files.map((item) => (
                <li
                  key={item.id}
                  className='flex items-center gap-2 py-2 text-sm'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='truncate'>{item.fileName}</div>
                    <div className='text-xs text-muted-foreground'>
                      {formatSize(item.size)} ·{' '}
                      {dayjs(item.createdAt).format('DD.MM.YYYY')}
                      {item.uploadedBy && ` · ${item.uploadedBy}`}
                    </div>
                  </div>
                  {/* nativeButton={false} обязателен: внутри не <button>, а
                      ссылка, и без этого Base UI ругается на потерю нативной
                      семантики кнопки. Здесь она и не нужна — это скачивание. */}
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    nativeButton={false}
                    aria-label={`Скачать ${item.fileName}`}
                    render={<a href={`/api/contracts/files/${item.id}`} />}
                  >
                    <Download />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={`Удалить ${item.fileName}`}
                    disabled={isPending}
                    onClick={() => handleDelete(item)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className='flex-col items-stretch gap-3 sm:flex-col'>
          <Field>
            <Label htmlFor={`contract-file-${fieldId}`}>Добавить файл</Label>
            <Input
              key={inputKey}
              id={`contract-file-${fieldId}`}
              type='file'
              className='h-auto py-1.5'
              disabled={isPending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <FieldDescription>
              PDF, изображения, Word и Excel. До {formatSize(MAX_FILE_SIZE)}.
            </FieldDescription>
          </Field>
          <div className='flex items-center justify-end gap-2'>
            {error && (
              <p className='mr-auto text-sm text-destructive'>{error}</p>
            )}
            <Button
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Закрыть
            </Button>
            <Button onClick={handleUpload} disabled={isPending || !file}>
              {isPending ? 'Загрузка…' : 'Загрузить'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
