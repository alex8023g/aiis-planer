import { Channel } from '@/lib/types';

/// Слоты SIM-карт модема. По основной карте опрашивают, её показывают таблицы
/// опроса; запасная видна только на странице «Модемы и SIM».
export const MAIN_SIM_SLOT = 1;
export const RESERVE_SIM_SLOT = 2;

/// Канал карты по умолчанию: основную опрашивают по GPRS, запасная — CSD.
export function defaultSimChannel(slot: number): Channel {
  return slot === RESERVE_SIM_SLOT ? Channel.Csd : Channel.Gprs;
}
