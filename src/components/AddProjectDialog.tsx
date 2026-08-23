'use client';

import { useState } from 'react';

import { createProject } from '@/app/actions';
import { ProjectDialog } from '@/components/ProjectDialog';
import { Button } from '@/components/ui/button';
import { newProjectFormFields } from '@/lib/stages';

export function AddProjectDialog() {
  const [open, setOpen] = useState(false);

  return (
    <ProjectDialog
      open={open}
      onOpenChange={setOpen}
      title='Добавить проект'
      submitLabel='Создать'
      initialValues={newProjectFormFields}
      onSubmit={createProject}
      trigger={
        <Button variant='outline' size='sm'>
          Добавить проект
        </Button>
      }
    />
  );
}
