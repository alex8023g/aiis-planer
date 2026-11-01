'use client';

import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
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
import type { ProjectModem } from '@/lib/tis';

import { deleteModem } from './actions';

/// Удаление модема с подтверждением. Привязанный к группе модем удалить
/// можно, но диалог предупреждает: группа останется без модема.
export function DeleteModemDialog({
  projectId,
  modem,
  onDeleted,
}: {
  projectId: string;
  modem: ProjectModem;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const name = modem.imei ?? modem.type;

  function handleOpenChange(next: boolean) {
    if (next) setError(null);
    setOpen(next);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteModem(projectId, modem.id);

      if (!result.ok) return setError(result.error);
      setOpen(false);
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant='outline'>
            <Trash2 />
            Удалить модем
          </Button>
        }
      />
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Удалить модем{name && ` «${name}»`}?</DialogTitle>
          <DialogDescription>
            Модем удалится вместе с SIM-картой.
            {modem.tiNumbers &&
              ` Он привязан к ТИ ${modem.tiNumbers} — их группа останется без модема.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {error && (
            <p
              role='alert'
              className='mr-auto self-center text-sm text-destructive'
            >
              {error}
            </p>
          )}
          <DialogClose render={<Button variant='outline'>Отмена</Button>} />
          <Button
            variant='destructive'
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? 'Удаление…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
