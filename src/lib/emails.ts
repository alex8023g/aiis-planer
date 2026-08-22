/// Почты сравниваются по точному совпадению, поэтому и в базу, и в проверки
/// они попадают через одну нормализацию.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/// Проверка ровно на «похоже на адрес»: настоящую валидацию делает Google,
/// пускать в приложение по этому списку никого нельзя — он лишь раздаёт доступ
/// к проекту тому, кто уже вошёл под этой почтой.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// Разбирает список почт из формы: запятые, точки с запятой, переводы строк.
/// Возвращает нормализованные адреса без повторов, в исходном порядке.
export function parseEmailList(
  value: string,
): { ok: true; emails: string[] } | { ok: false; invalid: string } {
  const emails: string[] = [];

  for (const raw of value.split(/[,;\s]+/)) {
    const email = normalizeEmail(raw);

    if (!email) continue;
    if (!emailPattern.test(email)) return { ok: false, invalid: email };
    if (!emails.includes(email)) emails.push(email);
  }

  return { ok: true, emails };
}
