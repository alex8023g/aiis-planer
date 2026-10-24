import type { PrismaClient } from '../../src/generated/prisma/client';
import { cleanEquipmentName, equipmentKey } from '../../src/lib/equipment';

/// Справочник оборудования из спецификации МЛЗ
/// (docs/excel_examples/спецификация оборуд-я МЛЗ 2026-10-05.xlsx). Опечатки
/// книги поправлены: «Кабль» → «Кабель», «iRZ ATM42.В» с кириллической В
/// сводится к латинской сама — по equipmentKey.
const CATALOG: { kind: string; unit: string; models: string[] }[] = [
  {
    kind: 'Прибор учета',
    unit: 'шт',
    models: [
      'ПСЧ-4ТМ.05МД.21',
      'ПСЧ-4ТМ.05МД.05',
      'ПСЧ-4ТМ.06Т.62',
      'ПСЧ-4ТМ.06Т.05.11',
      'СЭБ-1ТМ.04Т.63.00.00',
    ],
  },
  { kind: 'Шкаф связи', unit: 'шт', models: ['ЩМП 02 IP54 250х300х155мм'] },
  { kind: 'Шкаф учета', unit: 'шт', models: ['ЭПМ ЩУ 620х600х170 мм, IP31'] },
  { kind: 'Бокс', unit: 'шт', models: ['IEK ЩРН-П-6 ИЭК MKP12-N-06-40-20'] },
  { kind: 'Разветвитель RS-485', unit: 'шт', models: ['R110-R4'] },
  { kind: 'Блок питания', unit: 'шт', models: ['MDR-20-12'] },
  { kind: 'GPRS терминал', unit: 'шт', models: ['iRZ ATM42.A', 'iRZ ATM42.B'] },
  { kind: 'Антенна', unit: 'шт', models: ['ЛИДЕР-М 700-2700 МГц'] },
  { kind: 'Удлинитель антенны', unit: 'шт', models: ['RG-58 10 метров'] },
  { kind: 'Автомат 2х полюсный', unit: 'шт', models: ['DEKraft 2Р С6А'] },
  { kind: 'DIN-рейка', unit: 'шт', models: ['07-03-009 7,5х35х250мм'] },
  { kind: 'Кабель питания', unit: 'м', models: ['ВВГнг 2х1.5'] },
  { kind: 'Интерфейсный кабель', unit: 'м', models: ['F/UTP 2x2x0,52 мм'] },
  {
    kind: 'Кабель заземления',
    unit: 'м',
    models: ['ПуГВнг(А)LS желто-зеленый 1х4'],
  },
  { kind: 'Испытательная колодка', unit: 'шт', models: ['КИП-С'] },
  { kind: 'Кабель для вторичных цепей', unit: 'м', models: [] },
  {
    kind: 'Расходные материалы',
    unit: 'комп.',
    models: ['саморезы, клипсы, стяжки, хомуты и т.д.'],
  },
];

type CatalogIndex = Map<string, { id: string; models: Map<string, string> }>;

/// Справочник из базы по equipmentKey: сравнивать по нему умеет только код.
async function loadCatalog(prisma: PrismaClient): Promise<CatalogIndex> {
  const kinds = await prisma.equipmentKind.findMany({
    select: {
      id: true,
      name: true,
      models: { select: { id: true, name: true } },
    },
  });

  return new Map(
    kinds.map((kind) => [
      equipmentKey(kind.name),
      {
        id: kind.id,
        models: new Map(
          kind.models.map((model) => [equipmentKey(model.name), model.id]),
        ),
      },
    ]),
  );
}

/// Заводит справочник: только недостающее, уже заведённое не трогает —
/// справочник общий на все проекты, и его правки из приложения повторный seed
/// не затирает. Заведённое узнаётся по equipmentKey, а не по точному имени:
/// иначе «кабель заземления» из приложения и «Кабель заземления» отсюда
/// встали бы рядом.
export async function seedEquipment(prisma: PrismaClient): Promise<number> {
  const catalog = await loadCatalog(prisma);

  for (const entry of CATALOG) {
    let kind = catalog.get(equipmentKey(entry.kind));

    if (!kind) {
      const created = await prisma.equipmentKind.create({
        data: { name: cleanEquipmentName(entry.kind), unit: entry.unit },
        select: { id: true },
      });

      kind = { id: created.id, models: new Map() };
    }

    for (const model of entry.models) {
      if (kind.models.has(equipmentKey(model))) continue;

      await prisma.equipmentModel.create({
        data: { kindId: kind.id, name: cleanEquipmentName(model) },
      });
    }
  }

  return CATALOG.length;
}

/// id вида и марки из справочника — для позиций спецификации в seed. Вид и
/// марка должны там уже быть (см. seedEquipment): seed с опечаткой пусть
/// падает, а не заводит в справочник лишнее.
export async function equipmentIds(
  prisma: PrismaClient,
  kind: string,
  model: string | null,
): Promise<{ kindId: string; modelId: string | null }> {
  const found = (await loadCatalog(prisma)).get(equipmentKey(kind));

  if (!found) throw new Error(`В справочнике нет вида «${kind}»`);
  if (model === null) return { kindId: found.id, modelId: null };

  const modelId = found.models.get(equipmentKey(model));

  if (!modelId) throw new Error(`У вида «${kind}» нет марки «${model}»`);

  return { kindId: found.id, modelId };
}
