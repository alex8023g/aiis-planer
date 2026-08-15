import { prisma } from '@/lib/prisma';

const API_URL = 'https://isdayoff.ru/api/getdata';

/// Календарь года из isdayoff.ru: строка из цифр, по одному символу на день
/// года (0 — рабочий, 1 — выходной, 2 — сокращённый, 4 — рабочий по covid).
/// В ответе с ошибкой приходит короткий код вида "100", поэтому длину проверяем.
function isValidCalendar(days: string, year: number): boolean {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return days.length === (isLeap ? 366 : 365) && /^\d+$/.test(days);
}

async function fetchCalendar(year: number): Promise<string> {
  const response = await fetch(`${API_URL}?year=${year}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`isdayoff.ru ответил ${response.status}`);
  }

  const days = (await response.text()).trim();
  if (!isValidCalendar(days, year)) {
    throw new Error(`isdayoff.ru вернул некорректный календарь: ${days}`);
  }

  return days;
}

/// Календарь выходных за год: сначала из БД, при отсутствии — из isdayoff.ru
/// с сохранением в БД.
export async function getDaysOff(
  year: number = new Date().getFullYear(),
): Promise<string> {
  const cached = await prisma.isDayOff.findUnique({ where: { year } });
  if (cached) return cached.days;

  const days = await fetchCalendar(year);
  const saved = await prisma.isDayOff.upsert({
    where: { year },
    create: { year, days },
    update: { days },
  });

  return saved.days;
}
