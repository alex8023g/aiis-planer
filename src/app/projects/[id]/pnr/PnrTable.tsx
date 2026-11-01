'use client';

import { useMemo } from 'react';

import type { SurveyColumn } from '@/app/projects/[id]/aiis2/survey-data';
import { SurveyTable } from '@/components/SurveyTable';
import { cell, spans, text } from '@/lib/survey-cells';
import type { PnrTi } from '@/lib/tis';

const columns: SurveyColumn[] = [
  { title: 'наименование ТИ', minWidth: 280 },
  { title: 'тип ПУ', minWidth: 160 },
  { title: '№ ПУ', minWidth: 120 },
  { title: 'связн. адр. сч.', minWidth: 48, compact: true },
  { title: 'IMEI модема', minWidth: 160 },
  { title: 'IP', minWidth: 140 },
];

/// Только для просмотра. IMEI и IP — модема группы, общего на её ТИ,
/// поэтому у соседних ТИ одной группы ячейки объединены.
export function PnrTable({ tis }: { tis: PnrTi[] }) {
  const rows = useMemo(() => {
    const modemSpans = spans(tis.map((ti) => ti.modemId));

    return tis.map((ti, index) => [
      text(ti.name),
      text(ti.meterType),
      text(ti.meterNumber),
      text(ti.meterAddress),
      cell(ti.modemImei ?? '', modemSpans[index]),
      cell(ti.ip ?? '', modemSpans[index]),
    ]);
  }, [tis]);

  return <SurveyTable columns={columns} rows={rows} />;
}
