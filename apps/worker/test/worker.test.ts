import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { startWorker, WORKER_NAME } from '../src/worker';

void test('worker logs startup and stops only once', () => {
  const messages: string[] = [];
  const worker = startWorker((message) => messages.push(message));

  worker.stop();
  worker.stop();

  assert.equal(WORKER_NAME, 'DevPulse Worker');
  assert.deepEqual(messages, [
    '[DevPulse Worker] started; no job consumer is configured yet',
    '[DevPulse Worker] shutdown complete',
  ]);
});
