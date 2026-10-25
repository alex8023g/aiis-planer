import { Header } from '@/components/Header';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { getEquipmentKits } from '@/lib/specification';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Справочник оборудования' };

/// Справочник оборудования: виды с марками и типовые комплекты.
/// Пока только просмотр — новые виды и марки заводит редактор спецификации
/// при сохранении.
export default async function EquipmentCatalogPage() {
  const user = await requireUser();
  const [kinds, kits] = await Promise.all([
    prisma.equipmentKind.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        _count: { select: { items: true } },
        models: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, _count: { select: { items: true } } },
        },
      },
    }),
    getEquipmentKits(),
  ]);
  const modelCount = kinds.reduce((sum, kind) => sum + kind.models.length, 0);

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='equipmentcatalog'
        meta={`Видов: ${kinds.length} · марок: ${modelCount} · комплектов: ${kits.length}`}
      />
      <main className='mx-auto flex flex-col gap-2 p-2 sm:p-4'>
        <section className='w-fit max-w-full overflow-x-auto rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
          <h2 className='mb-2 text-sm font-semibold'>Виды и марки</h2>
          {kinds.length === 0 ? (
            <p className='text-sm text-neutral-500'>Справочник пуст</p>
          ) : (
            <table className='border-collapse text-sm'>
              <thead className='bg-neutral-100 dark:bg-neutral-800'>
                <tr>
                  <th className='px-2 py-1 text-left font-medium'>
                    Наименование
                  </th>
                  <th className='px-2 py-1 text-left font-medium'>
                    Марка / характеристика
                  </th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((kind) => {
                  /// Строка на марку, вид объединён по высоте.
                  /// Позиции вида без марки — своей строкой (null): у вида
                  /// без марок она единственная, у вида с марками — только
                  /// если такие позиции есть, иначе их бы нигде не было видно.
                  const withoutModel =
                    kind._count.items -
                    kind.models.reduce((sum, m) => sum + m._count.items, 0);
                  const rows = [
                    ...kind.models,
                    ...(kind.models.length === 0 || withoutModel > 0
                      ? [null]
                      : []),
                  ];
                  return rows.map((model, index) => (
                    <tr
                      key={model?.id ?? kind.id}
                      className={
                        index === 0
                          ? 'border-t border-neutral-200 dark:border-neutral-800'
                          : undefined
                      }
                    >
                      {index === 0 && (
                        <td
                          className='px-2 py-1 align-top'
                          rowSpan={rows.length}
                        >
                          {kind.name}
                        </td>
                      )}
                      <td className='px-2 py-1'>
                        {model ? (
                          model.name
                        ) : kind.models.length > 0 ? (
                          <span className='text-neutral-500 italic'>
                            без марки
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}
        </section>
        <section className='w-fit max-w-full overflow-x-auto rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
          <h2 className='mb-2 text-sm font-semibold'>Типовые комплекты</h2>
          {kits.length === 0 ? (
            <p className='text-sm text-neutral-500'>Комплектов пока нет</p>
          ) : (
            <div className='flex flex-col gap-4'>
              {kits.map((kit) => (
                <div key={kit.name}>
                  <h3 className='mb-1 text-sm font-medium'>{kit.name}</h3>
                  <table className='border-collapse text-sm'>
                    <thead className='bg-neutral-100 dark:bg-neutral-800'>
                      <tr>
                        <th className='w-16 px-2 py-1 text-center font-medium'>
                          №
                        </th>
                        <th className='px-2 py-1 text-left font-medium'>
                          Наименование
                        </th>
                        <th className='px-2 py-1 text-left font-medium'>
                          Марка / характеристика
                        </th>
                        <th className='w-24 px-2 py-1 text-center font-medium'>
                          Кол-во
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {kit.items.map((item, index) => (
                        <tr
                          key={index}
                          className='border-t border-neutral-200 dark:border-neutral-800'
                        >
                          <td className='px-2 py-1 text-center'>{index + 1}</td>
                          <td className='px-2 py-1'>{item.kind}</td>
                          <td className='px-2 py-1'>{item.model ?? '—'}</td>
                          <td className='px-2 py-1 text-center'>
                            {item.quantity ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
