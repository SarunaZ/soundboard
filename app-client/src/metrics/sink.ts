/**
 * Where a batch of samples ends up — STEPS step 8.
 *
 * PLAN M0 allows the stub endpoint to be "a file on disk … until M1", so the
 * default sink is a JSON Lines file in the app's document directory. Step 13
 * points METRICS_ENDPOINT at the service's real /metrics and the same batches
 * go over HTTP instead — that constant is the whole of the change.
 *
 * Pull a dataset off a device with:
 *   adb exec-out run-as <applicationId> cat files/metrics/taps.jsonl > taps.jsonl
 */
import { Directory, File, Paths } from 'expo-file-system';

/** null until step 13. See the module comment. */
export const METRICS_ENDPOINT: string | null = null;

const DIR = 'metrics';
const NAME = 'taps.jsonl';

export function metricsFile(): File {
  const dir = new Directory(Paths.document, DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const file = new File(dir, NAME);
  if (!file.exists) file.create();
  return file;
}

/**
 * JSON Lines: appendable without rewriting, and readable line-by-line by
 * anything — jq, pandas, sqlite. A JSON array would have to be re-parsed and
 * rewritten on every flush.
 */
function encode(records: readonly object[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

export async function writeBatch(records: readonly object[]): Promise<void> {
  const body = encode(records);

  if (METRICS_ENDPOINT) {
    const res = await fetch(METRICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body,
    });
    if (res.ok) return;

    // Fall through to the file rather than throwing. This dataset exists to
    // characterise bad networks; a sink that discards samples exactly when the
    // network is bad would censor the tail we are trying to measure.
    console.warn(`[metrics] POST failed (${res.status}) — writing to file instead`);
  }

  // Synchronous, hence never called from the tap path. See metrics/index.ts.
  metricsFile().write(body, { append: true });
}

/** Whole dataset as raw JSONL. For pulling off the device during development. */
export function readAll(): string {
  const file = metricsFile();
  return file.exists ? file.textSync() : '';
}

export function clearAll(): void {
  const file = metricsFile();
  if (file.exists) file.delete();
}
