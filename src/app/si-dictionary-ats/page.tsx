import { Header } from '@/components/Header';
import { SiDictionaryAtsSearch } from '@/components/SiDictionaryAtsSearch';
import {
  SiDictionaryImportButton,
  SiDictionaryImportProgress,
  SiDictionaryImportProvider,
} from '@/components/SiDictionaryImport';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Справочник СИ АТС' };

/// Поиск отдаёт не больше стольких строк на категорию: справочник большой
/// (счётчиков — тысячи), а страница не постраничная.
const RESULT_LIMIT = 50;

/// null/"" → «—»; дату показываем без времени — у стоп-дат его и нет.
function cell(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';

  return value instanceof Date
    ? value.toLocaleDateString('ru-RU', { timeZone: 'UTC' })
    : String(value);
}

/// Массив значений в одну ячейку: "5, 1, no-transformer" или «—», если пуст.
function listCell(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : '—';
}

/// Три стоп-даты в одну ячейку — отдельная колонка на каждую раздула бы
/// таблицу, а стоп-дата есть не у каждой записи.
function stopDatesCell(row: {
  stopDateAiis: Date | null;
  stopDateIsu: Date | null;
  stopDateUnion: Date | null;
}): string {
  const parts = [
    row.stopDateAiis && `АИИС: ${cell(row.stopDateAiis)}`,
    row.stopDateIsu && `ИСУ: ${cell(row.stopDateIsu)}`,
    row.stopDateUnion && `UNION: ${cell(row.stopDateUnion)}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '—';
}

async function searchDictionary(q: string) {
  const where = { name: { contains: q, mode: 'insensitive' as const } };
  /// У счётчика ищут и по имени типа («Альфа A1800»), не только по имени
  /// модификации («A1801RAL-...») — иначе запрос по типу ничего не находит.
  const meterWhere = {
    OR: [
      where,
      { type: { name: { contains: q, mode: 'insensitive' as const } } },
    ],
  };

  const [meters, currentTransformers, voltageTransformers, uspd] =
    await Promise.all([
      prisma.atsMeterModification.findMany({
        where: meterWhere,
        select: {
          atsCode: true,
          name: true,
          manufacturer: true,
          activeChannels: true,
          reactiveChannels: true,
          ratedCurrents: true,
          ratedVoltages: true,
          accuracyClasses: true,
          inStopList: true,
          comment: true,
          stopDateAiis: true,
          stopDateIsu: true,
          stopDateUnion: true,
          type: {
            select: {
              name: true,
              grsiCode: true,
              isIntegral: true,
              calibrationInterval: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      prisma.atsCurrentTransformerName.findMany({
        where,
        select: {
          id: true,
          name: true,
          isDigital: true,
          comment: true,
          stopDateAiis: true,
          stopDateIsu: true,
          stopDateUnion: true,
          type: {
            select: {
              grsiCode: true,
              calibrationIntervals: true,
              manufacturers: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      prisma.atsVoltageTransformerName.findMany({
        where,
        select: {
          id: true,
          name: true,
          isDigital: true,
          comment: true,
          stopDateAiis: true,
          stopDateIsu: true,
          stopDateUnion: true,
          type: {
            select: {
              grsiCode: true,
              calibrationIntervals: true,
              manufacturers: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      prisma.atsUspdName.findMany({
        where,
        select: {
          id: true,
          name: true,
          comment: true,
          stopDateAiis: true,
          stopDateIsu: true,
          stopDateUnion: true,
          type: {
            select: {
              grsiCode: true,
              calibrationIntervals: true,
              manufacturers: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
    ]);

  return { meters, currentTransformers, voltageTransformers, uspd };
}

/// Категория результатов поиска — таблица со всеми полями записи.
function ResultTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: { key: string; cells: string[] }[];
}) {
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className='mb-2 text-sm font-semibold'>
        {title} (
        {rows.length === RESULT_LIMIT ? `${RESULT_LIMIT}+` : rows.length})
      </h2>
      <div className='min-w-max rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
        <table className='w-full border-collapse text-left text-sm whitespace-nowrap'>
          <thead className='text-xs text-neutral-500 dark:text-neutral-400'>
            <tr className='border-b border-neutral-200 dark:border-neutral-800'>
              {columns.map((column) => (
                <th key={column} className='px-3 py-2 font-medium'>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className='border-b border-neutral-200 last:border-0 dark:border-neutral-800'
              >
                {row.cells.map((value, index) => (
                  <td key={index} className='px-3 py-2 align-top'>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function SiDictionaryAtsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q: rawQuery } = await searchParams;
  const q = rawQuery?.trim() || undefined;

  const [lastImport, meters, currentTransformers, voltageTransformers, uspd] =
    await Promise.all([
      prisma.atsDictionaryImport.findFirst({ orderBy: { importedAt: 'desc' } }),
      prisma.atsMeterModification.count(),
      prisma.atsCurrentTransformerName.count(),
      prisma.atsVoltageTransformerName.count(),
      prisma.atsUspdName.count(),
    ]);
  const counts = [
    { label: 'Счётчики (модификации)', value: meters },
    { label: 'Трансформаторы тока (марки)', value: currentTransformers },
    { label: 'Трансформаторы напряжения (марки)', value: voltageTransformers },
    { label: 'УСПД (марки)', value: uspd },
  ];

  /// Пустой справочник искать нечего — запрос вхолостую не идёт.
  const results = lastImport && q ? await searchDictionary(q) : null;
  const noResults =
    results !== null &&
    results.meters.length === 0 &&
    results.currentTransformers.length === 0 &&
    results.voltageTransformers.length === 0 &&
    results.uspd.length === 0;

  return (
    /// The import button is in the header and its progress in main, so both
    /// sit under one provider.
    <SiDictionaryImportProvider>
      <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
        <Header
          user={user}
          current='sidictionaryats'
          /// The dictionary is shared by everyone, so only an admin replaces it;
          /// the import route checks the role again.
          action={user.role === UserRole.Admin && <SiDictionaryImportButton />}
        />
        <main className='mx-auto p-6 pt-3'>
          <SiDictionaryImportProgress />
          <div className='mb-3 max-w-3xl'>
            <SiDictionaryAtsSearch />
          </div>
          {lastImport ? (
            <>
              {/* Пока ищут, сводка о загруженной выгрузке только мешает —
                  прячем её, пока поле поиска не очищено. */}
              {!q && (
                <>
                  <p className='text-sm text-neutral-500 dark:text-neutral-400'>
                    Выгрузка от {lastImport.generatedAt.toLocaleString('ru-RU')}{' '}
                    · {lastImport.fileName} · загружена{' '}
                    {lastImport.importedAt.toLocaleString('ru-RU')}
                  </p>
                  <dl className='mt-6 grid max-w-3xl gap-4 sm:grid-cols-2'>
                    {counts.map((item) => (
                      <div
                        key={item.label}
                        className='rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
                      >
                        <dt className='text-sm text-neutral-500 dark:text-neutral-400'>
                          {item.label}
                        </dt>
                        <dd className='mt-1 text-2xl font-semibold tabular-nums'>
                          {item.value.toLocaleString('ru-RU')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {q && (
                <div className='space-y-6'>
                  {noResults ? (
                    <p className='text-sm text-neutral-500 dark:text-neutral-400'>
                      Ничего не найдено по запросу «{q}».
                    </p>
                  ) : (
                    <>
                      <ResultTable
                        title='Счётчики'
                        columns={[
                          'Наименование',
                          'Тип',
                          'Код ГРСИ',
                          'Интегральный',
                          'Межпов. интервал, лет',
                          'Акт. каналов',
                          'Реакт. каналов',
                          'Номинальные токи',
                          'Номинальные напряжения',
                          'Классы точности',
                          'В стоп-листе',
                          'Стоп-даты',
                          'Комментарий',
                          'Производитель',
                        ]}
                        rows={(results?.meters ?? []).map((row) => ({
                          key: row.atsCode,
                          cells: [
                            cell(row.name),
                            cell(row.type.name),
                            cell(row.type.grsiCode),
                            row.type.isIntegral ? 'да' : '—',
                            cell(row.type.calibrationInterval),
                            cell(row.activeChannels),
                            cell(row.reactiveChannels),
                            listCell(row.ratedCurrents),
                            listCell(row.ratedVoltages),
                            listCell(row.accuracyClasses),
                            row.inStopList ? 'да' : '—',
                            stopDatesCell(row),
                            cell(row.comment),
                            cell(row.manufacturer),
                          ],
                        }))}
                      />
                      <ResultTable
                        title='Трансформаторы тока'
                        columns={[
                          'Наименование',
                          'Код ГРСИ',
                          'Межпов. интервалы, лет',
                          'Производители',
                          'Цифровой',
                          'Стоп-даты',
                          'Комментарий',
                        ]}
                        rows={(results?.currentTransformers ?? []).map(
                          (row) => ({
                            key: String(row.id),
                            cells: [
                              cell(row.name),
                              cell(row.type.grsiCode),
                              listCell(
                                row.type.calibrationIntervals.map(String),
                              ),
                              listCell(row.type.manufacturers),
                              row.isDigital ? 'да' : '—',
                              stopDatesCell(row),
                              cell(row.comment),
                            ],
                          }),
                        )}
                      />
                      <ResultTable
                        title='Трансформаторы напряжения'
                        columns={[
                          'Наименование',
                          'Код ГРСИ',
                          'Межпов. интервалы, лет',
                          'Производители',
                          'Цифровой',
                          'Стоп-даты',
                          'Комментарий',
                        ]}
                        rows={(results?.voltageTransformers ?? []).map(
                          (row) => ({
                            key: String(row.id),
                            cells: [
                              cell(row.name),
                              cell(row.type.grsiCode),
                              listCell(
                                row.type.calibrationIntervals.map(String),
                              ),
                              listCell(row.type.manufacturers),
                              row.isDigital ? 'да' : '—',
                              stopDatesCell(row),
                              cell(row.comment),
                            ],
                          }),
                        )}
                      />
                      <ResultTable
                        title='УСПД'
                        columns={[
                          'Наименование',
                          'Код ГРСИ',
                          'Межпов. интервалы, лет',
                          'Производители',
                          'Стоп-даты',
                          'Комментарий',
                        ]}
                        rows={(results?.uspd ?? []).map((row) => ({
                          key: String(row.id),
                          cells: [
                            cell(row.name),
                            cell(row.type.grsiCode),
                            listCell(row.type.calibrationIntervals.map(String)),
                            listCell(row.type.manufacturers),
                            stopDatesCell(row),
                            cell(row.comment),
                          ],
                        }))}
                      />
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className='text-sm text-neutral-500 dark:text-neutral-400'>
              Справочник ещё не загружен.
              {user.role === UserRole.Admin &&
                ' Загрузите XML-выгрузку АТС кнопкой «Импорт СИ».'}
            </p>
          )}
        </main>
      </div>
    </SiDictionaryImportProvider>
  );
}
