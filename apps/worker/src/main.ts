import { startWorker, WORKER_NAME } from './worker';

const worker = startWorker();
let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[${WORKER_NAME}] received ${signal}; shutting down`);
  worker.stop();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
