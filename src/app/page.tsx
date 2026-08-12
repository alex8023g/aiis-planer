import { AddProjectDialog } from '@/components/AddProjectDialog';
import { ProjectGantt, statusStyles } from '@/components/ProjectGantt';
import { Dialog } from '@/components/ui/dialog';
import { TaskStatus, type Project } from '@/lib/types';

const projects: Project[] = [
  // {
  //   id: 'alpha',
  //   name: 'Петрус',
  //   responsible: 'Иванов И.И.',
  //   dateStart: '2025-08-10',
  //   stages: {
  //     ppo: {
  //       duration: 20,
  //       subtasks: {
  //         dogovor: TaskStatus.Completed,
  //         dopusk: TaskStatus.Completed,
  //         visit: TaskStatus.Completed,
  //         specification: TaskStatus.Completed,
  //         xml20000: null,
  //         report: TaskStatus.Completed,
  //       },
  //     },
  //     design: {
  //       duration: 30,
  //       startAfter: { stage: 'ppo', subtask: 'visit' },
  //       subtasks: {
  //         tz: TaskStatus.Completed,
  //         rd: TaskStatus.InProgress,
  //         td: TaskStatus.NotStarted,
  //       },
  //     },
  //     supply: {
  //       duration: 20,
  //       startAfter: { stage: 'ppo', subtask: 'specification' },
  //       subtasks: {
  //         request: TaskStatus.Completed,
  //         received: TaskStatus.Completed,
  //         assembled: TaskStatus.InProgress,
  //         sent: TaskStatus.NotStarted,
  //         delivered: TaskStatus.NotStarted,
  //       },
  //     },
  //     smrPnr: {
  //       duration: 25,
  //       startAfter: { stage: 'ppo', subtask: 'visit' },
  //       subtasks: {
  //         dopusk: TaskStatus.NotStarted,
  //         visit: TaskStatus.NotStarted,
  //         allWorks: TaskStatus.NotStarted,
  //       },
  //     },
  //     poverka: null,
  //     algorithm: null,
  //     metrology: null,
  //   },
  // },
  {
    id: 'beta',
    name: 'Дубки',
    responsible: 'Петров П.П.',
    dateStart: '2025-08-10',
    stages: {
      ppo: {
        duration: 15,
        subtasks: {
          dogovor: null,
          dopusk: TaskStatus.Completed,
          visit: TaskStatus.Completed,
          summary: TaskStatus.Completed,
          specification: TaskStatus.Completed,
          xml20000: TaskStatus.Completed,
          report: TaskStatus.InProgress,
        },
      },
      supply: {
        duration: 20,
        startAfter: { stage: 'ppo', subtask: 'specification' },
        subtasks: {
          request: TaskStatus.Completed,
          received: TaskStatus.Completed,
          assembled: TaskStatus.InProgress,
          sent: TaskStatus.NotStarted,
          delivered: TaskStatus.NotStarted,
        },
      },
      smrPnr: {
        duration: 30,
        startAfter: { stage: 'supply', subtask: 'delivered' },
        subtasks: {
          dopusk: TaskStatus.NotStarted,
          visit: TaskStatus.NotStarted,
          allWorks: TaskStatus.NotStarted,
        },
      },
      poverka: null,
      algorithm: null,
      metrology: null,
      design: null,
    },
  },
  {
    id: 'gamma',
    name: 'Цементум волга',
    responsible: null,
    dateStart: '2025-08-10',
    stages: {
      ppo: {
        duration: 18,
        subtasks: {
          dogovor: TaskStatus.Completed,
          dopusk: TaskStatus.Completed,
          visit: TaskStatus.InProgress,
          summary: TaskStatus.NotStarted,
          specification: TaskStatus.NotStarted,
          xml20000: TaskStatus.NotStarted,
          report: TaskStatus.NotStarted,
        },
      },
      design: {
        duration: 35,
        startAfter: { stage: 'ppo', subtask: 'summary' },
        subtasks: {
          tz: TaskStatus.NotStarted,
          rd: TaskStatus.NotStarted,
          td: TaskStatus.NotStarted,
        },
      },
      supply: {
        duration: 25,
        startAfter: { stage: 'ppo', subtask: 'specification' },
        subtasks: {
          request: TaskStatus.NotStarted,
          received: TaskStatus.NotStarted,
          assembled: TaskStatus.NotStarted,
          sent: TaskStatus.NotStarted,
          delivered: TaskStatus.NotStarted,
        },
      },
      smrPnr: {
        duration: 28,
        startAfter: { stage: 'design', subtask: 'td' },
        subtasks: {
          dopusk: TaskStatus.NotStarted,
          visit: TaskStatus.NotStarted,
          allWorks: TaskStatus.NotStarted,
        },
      },
      poverka: {
        duration: 12,
        startAfter: { stage: 'ppo', subtask: 'xml20000' },
        subtasks: {
          dogovor: TaskStatus.NotStarted,
          dopusk: TaskStatus.NotStarted,
          visit: TaskStatus.NotStarted,
          arshin: TaskStatus.NotStarted,
        },
      },
      algorithm: {
        duration: 15,
        startAfter: { stage: 'ppo', subtask: 'summary' },
        subtasks: {
          sendTask: TaskStatus.NotStarted,
          done: TaskStatus.NotStarted,
        },
      },
      metrology: {
        duration: 10,
        startAfter: { stage: 'poverka', subtask: 'arshin' },
        subtasks: {
          documents: TaskStatus.NotStarted,
          vniims: TaskStatus.NotStarted,
          rosstandart: TaskStatus.NotStarted,
          poverkaAiis: TaskStatus.NotStarted,
        },
      },
    },
  },
];

export default function Home() {
  return (
    <div className='min-h-screen bg-neutral-50 p-6 text-neutral-900 sm:p-10 dark:bg-neutral-950 dark:text-neutral-100'>
      <main className='/max-w-4xl mx-auto'>
        <header className='mb-8'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Графики проектов
          </h1>
          <AddProjectDialog />
          <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
            Проектов: {projects.length}
          </p>
        </header>

        <div className='flex flex-col gap-6'>
          {projects.map((project) => (
            <ProjectGantt key={project.id} project={project} />
          ))}
        </div>

        <div className='mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-500 dark:text-neutral-400'>
          {Object.values(TaskStatus).map((status) => (
            <span key={status} className='flex items-center gap-2'>
              <span
                className={`h-3 w-3 rounded-sm ${statusStyles[status].dot}`}
              />
              {statusStyles[status].label}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}
