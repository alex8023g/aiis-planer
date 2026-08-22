'use client';

import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import { deleteProject, updateProject } from '@/app/actions';
import { ProjectDialog } from '@/components/ProjectDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { projectToFormFields } from '@/lib/stages';
import type { NewProjectFormFields } from '@/lib/stages';
import type { Project } from '@/lib/types';

export function ProjectMenu({ project }: { project: Project }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function handleDelete() {
    if (!window.confirm(`Удалить проект «${project.name}»?`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteProject(project.id);
      if (!result.ok) setError(result.error);
    });
  }

  function handleUpdate(fields: NewProjectFormFields) {
    return updateProject(project.id, fields);
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
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil />
            Редактировать
          </DropdownMenuItem>
          <DropdownMenuItem variant='destructive' onClick={handleDelete}>
            <Trash2 />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Редактирование: ${project.name}`}
        submitLabel='Сохранить'
        initialValues={projectToFormFields(project)}
        membersRequired
        onSubmit={handleUpdate}
      />
    </div>
  );
}
