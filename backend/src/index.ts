import { env } from './config/env';
import { createApp } from './app';
import { getDeviceAdapter } from './iot';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { ensureSystemPresets } from './modules/lighting/presets.service';

async function main() {
  await prisma.$connect();
  await ensureSystemPresets();
  const adapter = getDeviceAdapter();
  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on :${env.PORT} (docs: /api/docs) — IoT transport: ${adapter.kind}${adapter.isSimulated ? ' [SIMULATED]' : ''}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
