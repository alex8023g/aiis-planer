import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/// Оптимистичная проверка: смотрим только наличие cookie сессии, без запроса в
/// базу (см. docs/app/guides/authentication#optimistic-checks-with-proxy).
/// Настоящая проверка — в src/lib/session.ts на страницах и в экшенах.
export function proxy(request: NextRequest) {
  const hasSessionCookie = getSessionCookie(request) !== null;
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!hasSessionCookie && !isLoginPage) {
    const loginUrl = new URL('/login', request.nextUrl);
    /// Куда вернуть пользователя после входа.
    loginUrl.searchParams.set(
      'next',
      request.nextUrl.pathname + request.nextUrl.search,
    );

    return NextResponse.redirect(loginUrl);
  }

  /// Обратный редирект (вошедшего — с /login на /) здесь делать нельзя: cookie
  /// может остаться от истёкшей или отозванной сессии, и получился бы цикл
  /// / → /login → /. Этим занимается сама страница входа — она, в отличие от
  /// proxy, проверяет сессию по-настоящему.
  return NextResponse.next();
}

export const config = {
  /// Пропускаем сами маршруты авторизации и статику Next.js.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
