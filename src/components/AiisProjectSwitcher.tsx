'use client';

import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type AiisProject = {
  id: string;
  name: string;
};

/// Разделы проекта, между которыми переключается шапка: `/projects/{id}/{slug}`.
const sections = [
  { slug: 'aiis4', title: 'АИИС 4' },
  { slug: 'meter-reader', title: 'MeterReader' },
] as const;

type Section = (typeof sections)[number]['slug'];

export function AiisProjectSwitcher({
  currentProjectId,
  projects,
  section,
}: {
  currentProjectId: string;
  projects: AiisProject[];
  /// Раздел, в котором остаёмся при смене проекта.
  section: Section;
}) {
  const router = useRouter();
  const sortedProjects = [...projects].sort((first, second) =>
    first.name.localeCompare(second.name, 'ru'),
  );
  const currentProject = projects.find(
    (project) => project.id === currentProjectId,
  );
  const sectionTitle = sections.find(({ slug }) => slug === section)?.title;

  /// Хлебные крошки «проект / раздел». Название проекта ведёт на его
  /// страницу, стрелка рядом — к тому же разделу другого проекта; меню
  /// раздела — к другому разделу того же проекта.
  return (
    <span className='inline-flex items-center'>
      <Link
        href={`/projects/${currentProjectId}`}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'h-auto max-w-80 px-1 text-xl font-semibold tracking-tight',
        )}
      >
        <span className='truncate'>{currentProject?.name}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={`Выбрать проект ${sectionTitle}`}
            >
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent className='w-80'>
          {sortedProjects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}/${section}`)}
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
      <span className='mr-1 text-neutral-400 dark:text-neutral-500'>/</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='sm'
              className='h-auto px-1 text-xl font-semibold tracking-tight'
              aria-label='Выбрать раздел проекта'
            >
              {sectionTitle}
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent className='w-48'>
          {sections.map(({ slug, title }) => (
            <DropdownMenuItem
              key={slug}
              onClick={() =>
                router.push(`/projects/${currentProjectId}/${slug}`)
              }
            >
              <Check
                className={slug === section ? 'opacity-100' : 'opacity-0'}
              />
              {title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
