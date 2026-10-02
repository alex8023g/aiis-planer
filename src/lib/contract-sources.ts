import type { ContractSource } from '@/generated/prisma/enums';

/// Константы реестров держим отдельно от src/lib/contracts.ts: тот тянет prisma,
/// а подписи нужны и клиентским компонентам (ContractDialog) — иначе pg уехал бы
/// в браузерный бандл.

/// Названия реестров. Ключи совпадают с enum ContractSource в схеме.
export const contractSourceLabels: Record<ContractSource, string> = {
  epr_customer: 'ЭПР (мы заказчик)',
  rn_energo: 'РН-Энерго',
  sro: 'СРО',
};

export const contractSources = Object.keys(
  contractSourceLabels,
) as ContractSource[];

/// Пока в базе только 2026-й: реестры залиты скриптом scripts/extract_contracts.py.
export const REGISTRY_YEAR = 2026;

/// Лист-метка для договоров, заведённых руками. Импорт реестра делает upsert по
/// ключу [source, registryYear, sourceSheet, sourceRow] (см. prisma/seed-contracts.ts),
/// и такого имени листа в .xlsx нет — значит, перезаливка ручные строки не
/// затрёт и в свою нумерацию не влезет.
export const MANUAL_SHEET = 'вручную';
