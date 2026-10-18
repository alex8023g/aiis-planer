import 'server-only';

import { WiringScheme } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

/// Matching equipment types typed in surveys against the ATS SI dictionary.
///
/// Types are free text, so an exact match misses too much: people write
/// "ПСЧ-4ТМ.05 МК.00" for "ПСЧ-4ТМ.05МК.00", or "СЕ303" in Cyrillic for the
/// dictionary's Latin "CE 303". The key drops case, spaces and separators and
/// folds Cyrillic letters that look like Latin ones. Real differences — a
/// digit, a brand name in front — still don't match.

const SEPARATORS = /[\s\-._,()/]/g;
const CYRILLIC = 'асеорхукмтвн';
const LATIN = 'aceopxykmtbh';

export function dictionaryKey(name: string): string {
  let key = '';

  for (const char of name.toLowerCase().replace(SEPARATORS, '')) {
    const index = CYRILLIC.indexOf(char);

    key += index >= 0 ? LATIN[index] : char;
  }

  return key;
}

/// Verdict for a meter type: fit for AIIS or not, and why not — shown on
/// hover in the survey table. wiring — the connection scheme the dictionary
/// implies (see dictionaryWiring); null when the type is not found or its
/// entries disagree.
export type MeterDictionaryVerdict = { wiring: WiringScheme | null } & (
  { ok: true } | { ok: false; reason: string }
);

const NOT_FOUND = 'Тип не найден в справочнике АТС';
const NON_COMPLIANT_COMMENT = /не соответств/i;

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

/// Why a modification is not fit for AIIS; empty — it is fit. Not fit are
/// modifications that:
/// - belong to an integral type: it only counts total energy, without
///   interval profiles;
/// - have any stop date (AIIS, ISU, UNION) — even a future one — or are in
///   the stop list;
/// - say in the comment that they don't meet the requirements
///   ("Не соответствует техническим требованиям ОРЭМ …").
function failures(modification: {
  type: { isIntegral: boolean };
  stopDateAiis: Date | null;
  stopDateIsu: Date | null;
  stopDateUnion: Date | null;
  inStopList: boolean;
  comment: string | null;
}): string[] {
  const reasons: string[] = [];

  if (modification.type.isIntegral) reasons.push('Интегральный счётчик');
  if (modification.stopDateAiis) {
    reasons.push(`Стоп-дата АИИС: ${formatDate(modification.stopDateAiis)}`);
  }
  if (modification.stopDateIsu) {
    reasons.push(`Стоп-дата ИСУ: ${formatDate(modification.stopDateIsu)}`);
  }
  if (modification.stopDateUnion) {
    reasons.push(`Стоп-дата UNION: ${formatDate(modification.stopDateUnion)}`);
  }
  if (modification.inStopList) reasons.push('В стоп-листе');
  if (
    modification.comment &&
    NON_COMPLIANT_COMMENT.test(modification.comment)
  ) {
    reasons.push(modification.comment.trim());
  }

  return reasons;
}

/// Connection scheme from rated currents and voltages: current through a
/// transformer — a rated current in amperes ("1", "5"; "no-transformer" is
/// direct), voltage through a transformer — "transformer". Both through
/// transformers — indirect, one — semi-indirect, none — direct. Digital
/// meters and entries without ratings (integral meters) give nothing.
function dictionaryWiring(modification: {
  ratedCurrents: string[];
  ratedVoltages: string[];
}): WiringScheme | null {
  const { ratedCurrents, ratedVoltages } = modification;

  if (ratedCurrents.length === 0 || ratedVoltages.length === 0) return null;

  const isRating = (value: string) =>
    value !== 'no-transformer' && value !== 'digital';

  if (!ratedCurrents.some(isRating) && ratedCurrents.includes('digital')) {
    return null;
  }

  const currentTransformer = ratedCurrents.some(isRating);
  const voltageTransformer = ratedVoltages.includes('transformer');

  if (currentTransformer && voltageTransformer) return WiringScheme.indirect;
  if (currentTransformer || voltageTransformer) {
    return WiringScheme.semiIndirect;
  }

  return WiringScheme.direct;
}

/// Checker of meter types against the dictionary's meter modifications
/// (~3K names, read once per call). A name listed several times is fit if
/// any of its entries is; otherwise the reasons of all entries are given.
export async function getMeterDictionaryChecker(): Promise<
  (type: string) => MeterDictionaryVerdict
> {
  const modifications = await prisma.atsMeterModification.findMany({
    select: {
      name: true,
      stopDateAiis: true,
      stopDateIsu: true,
      stopDateUnion: true,
      inStopList: true,
      comment: true,
      ratedCurrents: true,
      ratedVoltages: true,
      type: { select: { isIntegral: true } },
    },
  });
  const fit = new Set<string>();
  const unfit = new Map<string, Set<string>>();
  /// Schemes of all entries of a name: one scheme is used only if they agree.
  const wirings = new Map<string, Set<WiringScheme | null>>();

  for (const modification of modifications) {
    const key = dictionaryKey(modification.name);
    const reasons = failures(modification);
    const known = wirings.get(key) ?? new Set<WiringScheme | null>();

    known.add(dictionaryWiring(modification));
    wirings.set(key, known);

    if (reasons.length === 0) {
      fit.add(key);
    } else {
      const known = unfit.get(key) ?? new Set<string>();

      reasons.forEach((reason) => known.add(reason));
      unfit.set(key, known);
    }
  }

  return (type) => {
    const key = dictionaryKey(type);
    const schemes = wirings.get(key);
    const wiring = schemes?.size === 1 ? [...schemes][0] : null;

    if (fit.has(key)) return { ok: true, wiring };

    const reasons = unfit.get(key);

    return {
      ok: false,
      reason: reasons ? [...reasons].join('\n') : NOT_FOUND,
      wiring,
    };
  };
}
