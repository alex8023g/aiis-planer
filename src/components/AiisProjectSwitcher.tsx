'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type AiisProject = {
  id: string;
  name: string;
};

export function AiisProjectSwitcher({
  currentProjectId,
  projects,
}: {
  currentProjectId: string;
  projects: AiisProject[];
}) {
  const router = useRouter();
  const sortedProjects = [...projects].sort((first, second) =>
    first.name.localeCompare(second.name, 'ru'),
  );
  const currentProject = projects.find(
    (project) => project.id === currentProjectId,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='sm'
            className='h-auto max-w-80 px-1 text-xl font-semibold tracking-tight'
            aria-label='Выбрать проект АИИС 4'
          >
            <span className='truncate'>{currentProject?.name}</span>
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent className='w-80'>
        {sortedProjects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => router.push(`/projects/${project.id}/aiis4`)}
          >
            <Check
              className={
                project.id === currentProjectId ? 'opacity-100' : 'opacity-0'
              }
            />
            <span className='truncate'>{project.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
