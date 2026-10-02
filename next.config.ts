import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /// Сканы договоров идут в MinIO через серверный экшен, а тело экшена по
      /// умолчанию ограничено 1 МБ. Потолок должен совпадать с MAX_FILE_SIZE
      /// из src/lib/files.ts.
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
