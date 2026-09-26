import dayjs from 'dayjs';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

import { AddContractDialog } from '@/components/AddContractDialog';
import { ContractRowMenu } from '@/components/ContractRowMenu';
import { FileBadge } from '@/components/FileBadge';
import { Header } from '@/components/Header';
import type { ContractSource } from '@/generated/prisma/enums';
import { openHref, splitFileName } from '@/lib/contract-files';
import {
  contractSourceLabels,
  contractSources,
  REGISTRY_YEAR,
} from '@/lib/contract-sources';
import {
  getContractCounts,
  getContracts,
  type ContractListItem,
} from '@/lib/contracts';
import { canEdit, requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Договоры' };

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const date = (value: Date | null) =>
  value ? dayjs(value).format('DD.MM.YYYY') : '—';

/// Сумма договора или, если в реестре вместо неё текст, сам текст.
function Amount({ row }: { row: ContractListItem }) {
  if (row.amount === null) {
    return (
      <span className='text-neutral-500 dark:text-neutral-400'>
        {row.amountNote ?? '—'}
      </span>
    );
  }

  return (
    <>
      <span className='font-medium whitespace-nowrap'>
        {money.format(row.amount)}
      </span>
      {(row.amountNote || row.vatNote) && (
        <div className='text-xs text-neutral-500 dark:text-neutral-400'>
          {[row.amountNote, row.vatNote].filter(Boolean).join(', ')}
        </div>
      )}
    </>
  );
}

/// Ссылки ведут на роут скачивания, а не в MinIO: он проверяет сессию, и
/// файлы видны всем, кто вошёл, — в отличие от меню строки, которое только для
/// редакторов.
function Files({ row }: { row: ContractListItem }) {
  if (row.files.length === 0) {
    return <span className='text-neutral-500 dark:text-neutral-400'>—</span>;
  }

  return (
    <ul className='w-44 space-y-1.5'>
      {row.files.map((file) => {
        const { base } = splitFileName(file.fileName);
        const href = `/api/contracts/files/${file.id}`;
        const open = openHref(file);

        return (
          <li key={file.id} className='flex items-center gap-2'>
            <FileBadge fileName={file.fileName} />
            <a
              href={open ?? href}
              {...(open && {
                target: '_blank',
                rel: 'noopener noreferrer',
              })}
              title={
                open ? `Открыть: ${file.fileName}` : `Скачать: ${file.fileName}`
              }
              className='min-w-0 flex-1 truncate text-neutral-800 underline-offset-2 hover:underline dark:text-neutral-200'
            >
              {base}
            </a>
            <a
              href={href}
              title='Скачать'
              aria-label={`Скачать ${file.fileName}`}
              className='shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
            >
              <Download className='size-3.5' />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/// Этапы есть только у части договоров, поэтому лежат в раскрывающейся
/// строке под основной: <details> обходится без клиентского компонента.
function Stages({ row }: { row: ContractListItem }) {
  return (
    <tr className='border-b border-neutral-200 last:border-0 dark:border-neutral-800'>
      <td colSpan={8} className='px-4 pb-3'>
        <details className='text-sm'>
          <summary className='cursor-pointer text-neutral-500 select-none hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'>
            Этапы: {row.stages.length}
          </summary>
          <ul className='mt-2 space-y-1 border-l border-neutral-200 pl-4 dark:border-neutral-800'>
            {row.stages.map((stage) => (
              <li key={stage.id} className='flex flex-wrap gap-x-3 gap-y-1'>
                <span className='text-neutral-500 dark:text-neutral-400'>
                  {stage.no}.
                </span>
                <span className='min-w-0 flex-1'>{stage.name}</span>
                {stage.amount !== null && (
                  <span className='whitespace-nowrap'>
                    {money.format(stage.amount)}
                  </span>
                )}
                <span className='whitespace-nowrap text-neutral-500 dark:text-neutral-400'>
                  {stage.statusText ?? '—'}
                  {stage.dueAt && ` · до ${date(stage.dueAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </td>
    </tr>
  );
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const user = await requireUser();
  /// Меню в строке — только тем, кто вправе менять. Право проверяется и в
  /// экшене: спрятанной кнопки мало (см. src/app/contracts/actions.ts).
  const editable = canEdit(user);

  const requested = (await searchParams).source;
  /// Чужое значение в адресе не должно ронять страницу — просто показываем всё.
  const source = contractSources.find((item) => item === requested);

  const [rows, counts] = await Promise.all([
    getContracts({ registryYear: REGISTRY_YEAR, source }),
    getContractCounts(REGISTRY_YEAR),
  ]);

  const total = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const withoutAmount = rows.filter((row) => row.amount === null).length;

  const tabs: {
    key: ContractSource | undefined;
    label: string;
    count: number;
  }[] = [
    {
      key: undefined,
      label: 'Все',
      count: Object.values(counts).reduce((sum, count) => sum + count, 0),
    },
    ...contractSources.map((key) => ({
      key,
      label: contractSourceLabels[key],
      count: counts[key],
    })),
  ];

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} current='contracts' />
      <main className='mx-auto p-6 sm:p-10'>
        <div className='mb-4 flex flex-wrap items-center gap-2'>
          {tabs.map((tab) => {
            const active = tab.key === source;
            return (
              <Link
                key={tab.key ?? 'all'}
                href={tab.key ? `/contracts?source=${tab.key}` : '/contracts'}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border-neutral-200 bg-white hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800'
                }`}
              >
                {tab.label}
                <span
                  className={
                    active
                      ? 'ml-1.5 opacity-60'
                      : 'ml-1.5 text-neutral-500 dark:text-neutral-400'
                  }
                >
                  {tab.count}
                </span>
              </Link>
            );
          })}
          {/* ml-auto прижимает кнопку к правому краю ряда вкладок. */}
          {editable && (
            <div className='ml-auto'>
              <AddContractDialog defaultSource={source ?? contractSources[0]} />
            </div>
          )}
        </div>

        <p className='mb-4 text-sm text-neutral-500 dark:text-neutral-400'>
          Договоров: {rows.length} · Сумма: {money.format(total)}
          {withoutAmount > 0 && ` · без суммы в реестре: ${withoutAmount}`}
        </p>

        {/* relative обязателен: иначе абсолютный sr-only в шапке таблицы не
            обрезается overflow-x-auto и растягивает всю страницу вширь. */}
        <div className='relative overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
          <table className='w-full text-left text-sm'>
            <thead className='text-xs text-neutral-500 dark:text-neutral-400'>
              <tr className='border-b border-neutral-200 dark:border-neutral-800'>
                <th className='px-4 py-3 font-medium'>Договор</th>
                <th className='px-4 py-3 font-medium'>Контрагент</th>
                <th className='px-4 py-3 font-medium'>Предмет</th>
                <th className='px-4 py-3 font-medium'>Сумма</th>
                <th className='px-4 py-3 font-medium'>Срок</th>
                <th className='px-4 py-3 font-medium'>Статус</th>
                <th className='px-4 py-3 font-medium'>Файлы</th>
                <th className='px-4 py-3'>
                  <span className='sr-only'>Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className='px-4 py-6 text-center text-neutral-500 dark:text-neutral-400'
                  >
                    Договоров за {REGISTRY_YEAR} год нет.
                  </td>
                </tr>
              )}

              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={
                      row.stages.length > 0
                        ? ''
                        : 'border-b border-neutral-200 last:border-0 dark:border-neutral-800'
                    }
                  >
                    <td className='px-4 py-3 align-top'>
                      <div className='font-medium'>{row.number}</div>
                      <div className='text-xs whitespace-nowrap text-neutral-500 dark:text-neutral-400'>
                        {date(row.signedAt)} ·{' '}
                        {contractSourceLabels[row.source]}
                      </div>
                    </td>
                    <td className='px-4 py-3 align-top'>
                      <div>{row.counterparty || '—'}</div>
                      {row.objectName && (
                        <div className='text-xs text-neutral-500 dark:text-neutral-400'>
                          {row.objectName}
                        </div>
                      )}
                    </td>
                    <td className='max-w-md px-4 py-3 align-top'>
                      {row.subject || '—'}
                    </td>
                    <td className='px-4 py-3 align-top'>
                      <Amount row={row} />
                    </td>
                    <td className='px-4 py-3 align-top text-neutral-500 dark:text-neutral-400'>
                      {row.endsAt ? date(row.endsAt) : (row.termText ?? '—')}
                    </td>
                    {/* Статусы в реестре бывают длиной в предложение: в одну
                        строку они растягивали колонку на полтаблицы. */}
                    <td className='max-w-56 min-w-32 px-4 py-3 align-top text-neutral-500 dark:text-neutral-400'>
                      <div>{row.statusText ?? row.originalState ?? '—'}</div>
                      {/* Допсоглашение — про состояние договора, а не про сумму. */}
                      {row.dsNote && (
                        <div className='text-xs'>ДС: {row.dsNote}</div>
                      )}
                    </td>
                    <td className='px-4 py-3 align-top'>
                      <Files row={row} />
                    </td>
                    <td className='px-4 py-3 align-top'>
                      {editable && <ContractRowMenu contract={row} />}
                    </td>
                  </tr>
                  {row.stages.length > 0 && <Stages row={row} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
