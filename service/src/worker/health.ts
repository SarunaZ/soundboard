export const WORKER_HEALTH_MESSAGE = 'soundboard-worker-health';

type HealthMessage = { type: typeof WORKER_HEALTH_MESSAGE; healthy: boolean };

export function createWorkerHealthHeartbeat({
  send,
  checkDatabase,
  toolsAvailable,
  intervalMs = 1_000,
}: {
  send?: (message: HealthMessage, callback?: (error: Error | null) => void) => void;
  checkDatabase: () => boolean;
  toolsAvailable: boolean;
  intervalMs?: number;
}) {
  let cycleHealthy = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const heartbeat = () => {
    if (!send) return;
    let databaseHealthy = false;
    try { databaseHealthy = checkDatabase(); } catch { databaseHealthy = false; }
    const message: HealthMessage = {
      type: WORKER_HEALTH_MESSAGE,
      healthy: toolsAvailable && databaseHealthy && cycleHealthy,
    };
    try { send(message, () => undefined); } catch { /* IPC can disconnect during shutdown. */ }
  };

  return {
    markCycleHealthy(healthy: boolean) { cycleHealthy = healthy; },
    start() {
      if (!send || timer) return;
      heartbeat();
      timer = setInterval(heartbeat, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
