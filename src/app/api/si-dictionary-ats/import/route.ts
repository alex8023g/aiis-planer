import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/lib/session';
import {
  importSiDictionary,
  SiDictionaryImportError,
} from '@/lib/siDictionaryAts';
import { UserRole } from '@/lib/types';

/// A full import takes minutes; platforms that honour this won't cut it off.
export const maxDuration = 1800;

/// Replaces the ATS SI dictionary with the uploaded export. The body is the
/// raw file (not multipart form data), so it can be parsed as a stream
/// instead of being buffered: the export is ~400 MB.
///
/// This route is excluded from the proxy (src/proxy.ts): the proxy buffers at
/// most 10 MB of a request body and would hand us a truncated file. So the
/// session is checked here, and only an admin may replace the dictionary — it
/// is shared by everyone.
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Требуется вход' }, { status: 401 });
  }

  if (user.role !== UserRole.Admin) {
    return Response.json(
      { error: 'Загружать справочник может только администратор' },
      { status: 403 },
    );
  }

  if (!request.body) {
    return Response.json({ error: 'Файл не передан' }, { status: 400 });
  }

  const fileName =
    decodeURIComponent(request.headers.get('x-file-name') ?? '') ||
    'import.xml';

  try {
    const result = await importSiDictionary(request.body, fileName);

    revalidatePath('/si-dictionary-ats');

    return Response.json(result);
  } catch (error) {
    if (error instanceof SiDictionaryImportError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error('SI dictionary import failed', error);

    return Response.json(
      { error: 'Не удалось загрузить справочник' },
      { status: 500 },
    );
  }
}
