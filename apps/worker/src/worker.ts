export const WORKER_NAME = 'DevPulse Worker';

export type WorkerLogger = (message: string) => void;

export interface WorkerRuntime {
  stop: () => void;
}

export function startWorker(log: WorkerLogger = console.log): WorkerRuntime {
  log(`[${WORKER_NAME}] started; no job consumer is configured yet`);

  // No queue consumer exists yet, so this idle timer keeps the standalone process alive.
  const keepAliveTimer = setInterval(() => undefined, 60_000);

  let stopped = false;

  return {
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      clearInterval(keepAliveTimer);
      log(`[${WORKER_NAME}] shutdown complete`);
    },
  };
}
