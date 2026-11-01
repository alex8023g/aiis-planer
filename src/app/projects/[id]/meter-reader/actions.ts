'use server';

import { prisma } from '@/lib/prisma';
import { getProject } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import {
  parseConnection,
  readMeterProfile,
  type MeterProfileReading,
} from './power_reader';

const DEFAULT_METER_PORT = '6001';

export type ReadMeterProfileResult =
  { ok: true; reading: MeterProfileReading } | { ok: false; error: string };

/// Read the latest available profile day from a meter. Connection details are
/// loaded by TI id rather than accepted from the browser.
export async function readMeterProfileForTi(
  projectId: string,
  tiId: string,
): Promise<ReadMeterProfileResult> {
  const user = await requireUser();

  if (!(await getProject(projectId, user))) {
    return { ok: false, error: 'Проект не найден' };
  }

  const ti = await prisma.ti.findFirst({
    where: { id: tiId, projectId },
    select: {
      name: true,
      connection: { select: { meterAddress: true, port: true } },
      group: {
        select: {
          modem: { select: { simCard: { select: { ip: true } } } },
        },
      },
    },
  });

  if (!ti) return { ok: false, error: 'ТИ не найдена — обновите страницу' };

  const ip = ti.group?.modem?.simCard?.ip;
  const address = ti.connection?.meterAddress;

  if (!ip) return { ok: false, error: 'У ТИ не указан IP' };
  if (!address) return { ok: false, error: 'У ТИ не указан адрес счётчика' };

  try {
    const config = parseConnection({
      ip,
      port: ti.connection?.port || DEFAULT_METER_PORT,
      address,
    });
    const reading = await readMeterProfile(config);

    return { ok: true, reading };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
