import { Pencil } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';

export type EquipmentKindRow = {
  id: string;
  name: string;
  unit: string;
  _count: { items: number };
  models: { id: string; name: string; _count: { items: number } }[];
};

export function EquipmentKindsSection({
  kinds,
  editable,
  editing,
  linkHeading = true,
}: {
  kinds: EquipmentKindRow[];
  editable: boolean;
  editing: boolean;
  linkHeading?: boolean;
}) {
  return (
    <section className='w-fit max-w-full overflow-x-auto rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
      <div className='mb-2 flex min-h-7 flex-wrap items-center gap-3'>
        <h2 className='text-sm font-semibold'>
          {linkHeading ? (
            <Link
              href='/equipment-catalog/equipments'
              className='hover:underline'
            >
              Оборудование и материалы
            </Link>
          ) : (
            'Виды и марки'
          )}
        </h2>
        {editable && editing && (
          <Link
            href='/equipment-catalog/edit'
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Pencil />
            Редактировать
          </Link>
        )}
      </div>
      {kinds.length === 0 ? (
        <p className='text-sm text-neutral-500'>Справочник пуст</p>
      ) : (
        <table className='border-collapse text-sm'>
          <thead className='bg-neutral-100 dark:bg-neutral-800'>
            <tr>
              <th className='px-2 py-1 text-left font-medium'>Наименование</th>
              <th className='px-2 py-1 text-left font-medium'>
                Марка / характеристика
              </th>
              <th className='px-2 py-1 text-left font-medium'>Ед. изм.</th>
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
                ...(kind.models.length === 0 || withoutModel > 0 ? [null] : []),
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
                    <td className='px-2 py-1 align-top' rowSpan={rows.length}>
                      {kind.name}
                    </td>
                  )}
                  <td className='px-2 py-1'>
                    {model ? (
                      model.name
                    ) : kind.models.length > 0 ? (
                      <span className='text-neutral-500 italic'>без марки</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {index === 0 && (
                    <td className='px-2 py-1 align-top' rowSpan={rows.length}>
                      {kind.unit}
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
