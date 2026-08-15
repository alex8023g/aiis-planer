'use client';

import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import { deleteProject } from '@/app/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ProjectMenu({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm(`Удалить проект «${projectName}»?`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className='flex items-center gap-2'>
      {error && <span className='text-xs text-destructive'>{error}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label='Действия с проектом'
              disabled={isPending}
            >
              <EllipsisVertical />
            </Button>
          }
        />
        <DropdownMenuContent align='end'>
          {/* TODO: диалог редактирования проекта пока не реализован. */}
          <DropdownMenuItem>
            <Pencil />
            Редактировать
          </DropdownMenuItem>
          <DropdownMenuItem variant='destructive' onClick={handleDelete}>
            <Trash2 />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
