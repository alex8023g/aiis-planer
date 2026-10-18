'use client';

import { LoaderCircle, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';

/// Import of the ATS SI dictionary: the button lives in the page header, the
/// progress in the page body, so they share state through this context.
///
/// The file is sent as the raw request body (see
/// src/app/api/si-dictionary-ats/import/route.ts). The server reads the body
/// only as fast as it writes rows, so upload progress follows the import
/// itself; after the last byte the server still writes the final batch and
/// commits — that is the "finishing" stage. XMLHttpRequest rather than fetch:
/// fetch does not report upload progress.

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string; loaded: number; total: number }
  | { kind: 'finishing'; fileName: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

type ImportContext = {
  status: Status;
  start: (file: File) => void;
};

const Context = createContext<ImportContext | null>(null);

function useImport(): ImportContext {
  const value = useContext(Context);

  if (!value) {
    throw new Error(
      'SiDictionaryImport components need SiDictionaryImportProvider',
    );
  }

  return value;
}

const isRunning = (status: Status) =>
  status.kind === 'uploading' || status.kind === 'finishing';

function resultMessage(data: Record<string, number>): string {
  const n = (value: number) => value.toLocaleString('ru-RU');

  return `Загружено: ${n(data.meterModifications)} счётчиков, ${n(data.currentTransformerNames)} ТТ, ${n(data.voltageTransformerNames)} ТН, ${n(data.uspdNames)} УСПД`;
}

export function SiDictionaryImportProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const running = isRunning(status);

  /// Leaving the page aborts the upload and rolls the import back — ask first.
  useEffect(() => {
    if (!running) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();

    window.addEventListener('beforeunload', warn);

    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  function start(file: File) {
    const request = new XMLHttpRequest();
    const fileName = file.name;

    setStatus({ kind: 'uploading', fileName, loaded: 0, total: file.size });

    request.upload.onprogress = (event) => {
      setStatus({
        kind: 'uploading',
        fileName,
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : file.size,
      });
    };
    request.upload.onload = () => setStatus({ kind: 'finishing', fileName });
    request.onload = () => {
      let data: Record<string, unknown> = {};

      try {
        data = JSON.parse(request.responseText);
      } catch {}

      if (request.status >= 200 && request.status < 300) {
        setStatus({
          kind: 'done',
          message: resultMessage(data as Record<string, number>),
        });
        router.refresh();
      } else {
        setStatus({
          kind: 'error',
          message:
            typeof data.error === 'string' ? data.error : 'Ошибка импорта',
        });
      }
    };
    request.onerror = () =>
      setStatus({ kind: 'error', message: 'Сервер не ответил' });

    request.open('POST', '/api/si-dictionary-ats/import');
    request.setRequestHeader('Content-Type', 'application/xml');
    request.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    request.send(file);
  }

  return (
    <Context.Provider value={{ status, start }}>{children}</Context.Provider>
  );
}

/// Header button: picks the XML export and starts the import.
export function SiDictionaryImportButton() {
  const { status, start } = useImport();
  const input = useRef<HTMLInputElement>(null);
  const running = isRunning(status);

  return (
    <>
      <input
        ref={input}
        type='file'
        accept='.xml,application/xml,text/xml'
        className='hidden'
        onChange={(event) => {
          const file = event.target.files?.[0];

          /// Reset so picking the same file again still fires onChange.
          event.target.value = '';

          if (file) start(file);
        }}
      />
      <Button
        variant='outline'
        size='sm'
        disabled={running}
        onClick={() => input.current?.click()}
      >
        {running ? <LoaderCircle className='animate-spin' /> : <Upload />}
        Импорт СИ
      </Button>
    </>
  );
}

/// Progress of the running import, or the result of the last one.
export function SiDictionaryImportProgress() {
  const { status } = useImport();

  if (status.kind === 'idle') return null;

  if (status.kind === 'done' || status.kind === 'error') {
    return (
      <p
        role='status'
        className={
          status.kind === 'error'
            ? 'mb-6 max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
            : 'mb-6 max-w-3xl rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
        }
      >
        {status.message}
      </p>
    );
  }

  const percent =
    status.kind === 'uploading' && status.total > 0
      ? Math.min(100, Math.round((status.loaded / status.total) * 100))
      : 100;
  const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

  return (
    <div className='mb-6 max-w-3xl rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
      <div className='flex items-baseline justify-between gap-4 text-sm'>
        <span className='truncate'>Импорт {status.fileName}</span>
        <span className='shrink-0 text-neutral-500 tabular-nums dark:text-neutral-400'>
          {status.kind === 'uploading'
            ? `${mb(status.loaded)} из ${mb(status.total)} МБ · ${percent}%`
            : 'Завершение…'}
        </span>
      </div>
      <div
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.kind === 'uploading' ? percent : undefined}
        className='mt-2 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800'
      >
        <div
          className={
            status.kind === 'finishing'
              ? 'h-full animate-pulse rounded-full bg-neutral-900 dark:bg-neutral-100'
              : 'h-full rounded-full bg-neutral-900 transition-[width] duration-300 dark:bg-neutral-100'
          }
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className='mt-2 text-xs text-neutral-500 dark:text-neutral-400'>
        Займёт несколько минут. Не закрывайте страницу — импорт прервётся, и
        останется прежний справочник.
      </p>
    </div>
  );
}
