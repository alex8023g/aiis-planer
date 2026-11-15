import {
  Channel,
  EquipmentState,
  TransformerState,
} from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { MAIN_SIM_SLOT } from '@/lib/sim-card';

import type { TiDetails } from './ti-details';

const meterSelect = {
  state: true,
  type: true,
  number: true,
  isCompliant: true,
  meterAddress: true,
  dateInstalled: true,
  dateRemoved: true,
} as const;

const transformerSelect = {
  typeA: true,
  typeB: true,
  typeC: true,
  numberA: true,
  numberB: true,
  numberC: true,
  ratio: true,
  dateInstalled: true,
  dateRemoved: true,
} as const;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

type DbTransformer = {
  typeA: string | null;
  typeB: string | null;
  typeC: string | null;
  numberA: string | null;
  numberB: string | null;
  numberC: string | null;
  ratio: string | null;
  dateInstalled: Date | null;
  dateRemoved: Date | null;
};

function transformer(row: DbTransformer | undefined): TiDetails['tt'] {
  if (!row) return null;

  return {
    type: [row.typeA, row.typeB, row.typeC],
    number: [row.numberA, row.numberB, row.numberC],
    ratio: row.ratio,
    dateInstalled: iso(row.dateInstalled),
    dateRemoved: iso(row.dateRemoved),
  };
}

/// Данные ТИ проекта сверх таблицы опроса (колонки в ./ti-details.ts) — по id ТИ.
/// Доступ не проверяется, как и в getSurveyTis: проект уже прочитан
/// вызывающим.
export async function getTiDetails(
  projectId: string,
): Promise<Record<string, TiDetails>> {
  const tis = await prisma.ti.findMany({
    where: { projectId },
    select: {
      id: true,
      notes: true,
      meters: { select: meterSelect },
      /// ТТ и ТН у ТИ по одному, и строки есть всегда — с состоянием «есть
      /// ли трансформатор».
      tt: { select: { ...transformerSelect, state: true } },
      tn: { select: { ...transformerSelect, state: true } },
      group: {
        select: {
          id: true,
          uspd: { select: { type: true, number: true } },
          modem: {
            select: {
              kind: true,
              type: true,
              port: true,
              simCards: {
                where: { slot: MAIN_SIM_SLOT },
                select: { channel: true, number: true, provider: true },
              },
            },
          },
          sidePolling: { select: { description: true } },
          notes: { select: { description: true } },
        },
      },
    },
  });

  return Object.fromEntries(
    tis.map((ti) => {
      const meter = (state: EquipmentState) => {
        const row = ti.meters.find((item) => item.state === state);

        return row
          ? {
              type: row.type,
              number: row.number,
              isCompliant: row.isCompliant,
              meterAddress: row.meterAddress,
              dateInstalled: iso(row.dateInstalled),
              dateRemoved: iso(row.dateRemoved),
            }
          : null;
      };
      const group = ti.group;
      const modem = group?.modem;

      const details: TiDetails = {
        notes: ti.notes,
        currentMeter: meter(EquipmentState.current),
        proposedMeter: meter(EquipmentState.proposed),
        removedMeter: meter(EquipmentState.removed),
        /// Данные трансформатора — только когда он есть: у «нет» и «не
        /// выяснили» его колонки пустые.
        ttState: ti.tt?.state ?? TransformerState.unknown,
        tt:
          ti.tt?.state === TransformerState.present ? transformer(ti.tt) : null,
        tnState: ti.tn?.state ?? TransformerState.unknown,
        tn:
          ti.tn?.state === TransformerState.present ? transformer(ti.tn) : null,
        group: group
          ? {
              id: group.id,
              uspd: group.uspd,
              modem: modem
                ? {
                    kind: modem.kind,
                    type: modem.type,
                    port: modem.port,
                    /// Канал — основной карты; без карты — GPRS, как в базе по
                    /// умолчанию.
                    channel: modem.simCards[0]?.channel ?? Channel.gprs,
                    sim: modem.simCards[0] ?? null,
                  }
                : null,
              sidePolling: group.sidePolling?.description ?? null,
              notes: group.notes?.description ?? null,
            }
          : null,
      };

      return [ti.id, details];
    }),
  );
}
