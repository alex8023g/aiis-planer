import { randomUUID } from 'node:crypto';

import { Client } from 'minio';

const endPoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;

if (!endPoint || !accessKey || !secretKey) {
  throw new Error(
    'MINIO_ENDPOINT, MINIO_ACCESS_KEY или MINIO_SECRET_KEY не заданы',
  );
}

/// Бакет — в переменной, а не константой в коде: на проде он может называться
/// иначе, а заводить ради этого отдельную сборку незачем.
export const BUCKET = process.env.MINIO_BUCKET || 'contracts';

const createMinioClient = () =>
  new Client({
    endPoint,
    port: Number(process.env.MINIO_PORT ?? 9000),
    /// Строка из .env: 'false' — это истинное значение, сравниваем явно.
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey,
    secretKey,
  });

// В dev-режиме Next.js перезагружает модули, поэтому клиент кэшируется
// в globalThis — иначе на каждой перезагрузке создаётся новый.
const globalForMinio = globalThis as unknown as {
  minio?: ReturnType<typeof createMinioClient>;
};

export const minio = globalForMinio.minio ?? createMinioClient();

if (process.env.NODE_ENV !== 'production') {
  globalForMinio.minio = minio;
}

/// Бакет заводим из кода, а не руками в консоли: иначе про этот шаг придётся
/// помнить при каждом переезде на новый сервер. Вызов идемпотентный.
export async function ensureBucket(): Promise<void> {
  if (await minio.bucketExists(BUCKET)) return;

  await minio.makeBucket(BUCKET);
}

/// Ключ объекта: contracts/<id договора>/<uuid>-<имя файла>.
/// uuid — чтобы два одноимённых скана не затирали друг друга; имя файла в ключе
/// оставляем для читаемости при разборе бакета глазами, но чистим от всего, что
/// ломает путь. Настоящее имя для скачивания хранится в базе.
export function objectKey(contractId: string, fileName: string): string {
  const safe = fileName.replace(/[/\\]/g, '_').replace(/\s+/g, '_').slice(-100);

  return `contracts/${contractId}/${randomUUID()}-${safe}`;
}
