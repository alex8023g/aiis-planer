/// Белый список почт, которым разрешён вход. Задаётся через ALLOWED_EMAILS
/// (адреса через запятую). Пустой список = вход закрыт для всех.
const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

if (allowedEmails.size === 0) {
  console.warn(
    'ALLOWED_EMAILS не задан — вход в приложение закрыт для всех аккаунтов',
  );
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;

  return allowedEmails.has(email.trim().toLowerCase());
}
