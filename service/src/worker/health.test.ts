import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerHealthHeartbeat, WORKER_HEALTH_MESSAGE } from './health.js';

test('worker health reports only tool, database, and poll-cycle status', () => {
  const messages: unknown[] = [];
  let databaseHealthy = true;
  const health = createWorkerHealthHeartbeat({
    send: (message, callback) => { messages.push(message); callback?.(null); },
    checkDatabase: () => databaseHealthy,
    toolsAvailable: true,
  });
  health.markCycleHealthy(true);
  health.start();
  health.stop();
  assert.deepEqual(messages, [{ type: WORKER_HEALTH_MESSAGE, healthy: true }]);

  databaseHealthy = false;
  health.start();
  health.stop();
  assert.deepEqual(messages[1], { type: WORKER_HEALTH_MESSAGE, healthy: false });
  assert.equal(JSON.stringify(messages).includes('path'), false);
});

test('worker health stays false before the first clean cycle and when tools are missing', () => {
  const messages: unknown[] = [];
  const unavailableTools = createWorkerHealthHeartbeat({
    send: message => { messages.push(message); },
    checkDatabase: () => true,
    toolsAvailable: false,
  });
  unavailableTools.markCycleHealthy(true);
  unavailableTools.start();
  unavailableTools.stop();
  assert.deepEqual(messages, [{ type: WORKER_HEALTH_MESSAGE, healthy: false }]);

  const beforeFirstCycle: unknown[] = [];
  const notPolled = createWorkerHealthHeartbeat({
    send: message => { beforeFirstCycle.push(message); },
    checkDatabase: () => true,
    toolsAvailable: true,
  });
  notPolled.start();
  notPolled.stop();
  assert.deepEqual(beforeFirstCycle, [{ type: WORKER_HEALTH_MESSAGE, healthy: false }]);
});

test('standalone worker health is a no-op without an IPC sender', () => {
  const health = createWorkerHealthHeartbeat({ checkDatabase: () => { throw new Error('must not query'); }, toolsAvailable: true });
  health.start();
  health.stop();
});
