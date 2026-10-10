export interface BoundedSignal {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
}

export function boundedSignal(parent: AbortSignal | undefined, timeoutMs: number): BoundedSignal {
  const controller = new AbortController();
  let timeout = false;
  const forwardAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', forwardAbort, { once: true });
  const timer = setTimeout(() => {
    timeout = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeout,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', forwardAbort);
    },
  };
}
