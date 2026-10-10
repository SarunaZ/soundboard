import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

export class PipelineError extends Error {
  constructor(message = 'That URL could not be processed. Try another video.') { super(message); }
}

function cleanChildEnv(tempDir: string): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: tempDir, TMPDIR: tempDir, LANG: 'C.UTF-8' };
}

/** Spawn with an argument vector, bounded output/time, and process-tree termination. */
export async function runTool(bin: string, args: string[], options: {
  cwd: string; timeoutMs: number; maxOutputBytes?: number; signal?: AbortSignal;
  watchFiles?: { directory: string; prefix: string; maxBytes: number };
}): Promise<string> {
  const child = spawn(bin, args, {
    cwd: options.cwd,
    env: cleanChildEnv(options.cwd),
    shell: false,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (options.signal?.aborted) {
    try { child.kill('SIGKILL'); } catch { /* not started */ }
    throw new PipelineError();
  }
  const chunks: Buffer[] = [];
  let outputBytes = 0;
  let failure: Error | undefined;
  const cap = options.maxOutputBytes ?? 64 * 1024;
  child.stdout.on('data', (data: Buffer) => {
    outputBytes += data.length;
    if (outputBytes > cap) {
      failure = new PipelineError();
      try { process.platform === 'win32' ? child.kill('SIGKILL') : child.pid && process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ }
    }
    else chunks.push(data);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const killTree = () => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch { /* already exited */ }
  };
  const abort = () => { failure = new PipelineError(); killTree(); };
  timer = setTimeout(() => { failure = new PipelineError(); killTree(); }, options.timeoutMs);
  const watch = options.watchFiles ? setInterval(() => {
    void fs.readdir(options.watchFiles!.directory).then(async names => {
      for (const name of names) {
        if (!name.startsWith(options.watchFiles!.prefix)) continue;
        const stat = await fs.stat(path.join(options.watchFiles!.directory, name));
        if (stat.size > options.watchFiles!.maxBytes) {
          failure = new PipelineError('The source is larger than the 32 MB limit.');
          killTree();
          return;
        }
      }
    }).catch(() => undefined);
  }, 250) : undefined;
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const [code] = await once(child, 'close') as [number | null];
    if (failure || options.signal?.aborted || code !== 0) throw failure ?? new PipelineError();
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    killTree();
    throw error instanceof PipelineError ? error : new PipelineError();
  } finally {
    if (timer) clearTimeout(timer);
    if (watch) clearInterval(watch);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function boundedFileSize(filePath: string, maximum: number): Promise<number> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > maximum) throw new PipelineError('The source is larger than the 32 MB limit.');
  return stat.size;
}

/** Stream 8 kHz mono PCM into fixed peak buckets; memory use is constant and the 20 min cap bounds work. */
export async function makePeaks(sourcePath: string, cwd: string, durationMs: number, signal?: AbortSignal): Promise<number[]> {
  const expectedSamples = Math.ceil(durationMs * 8);
  const bucketCount = Math.min(256, expectedSamples);
  const peaks = Array<number>(bucketCount).fill(0);
  const child = spawn('ffmpeg', ['-nostdin', '-v', 'error', '-i', sourcePath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], {
    cwd, env: cleanChildEnv(cwd), shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (signal?.aborted) {
    try { child.kill('SIGKILL'); } catch { /* not started */ }
    throw new PipelineError();
  }
  let carry: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let sampleIndex = 0;
  let overflow = false;
  child.stdout.on('data', (chunk: Buffer) => {
    const bytes = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    const usable = bytes.length - bytes.length % 2;
    for (let offset = 0; offset < usable; offset += 2) {
      if (sampleIndex >= expectedSamples * 1.01) { overflow = true; break; }
      const bucket = Math.min(bucketCount - 1, Math.floor(sampleIndex * bucketCount / expectedSamples));
      peaks[bucket] = Math.max(peaks[bucket]!, Math.abs(bytes.readInt16LE(offset)) / 32768);
      sampleIndex++;
    }
    carry = bytes.subarray(usable);
    if (overflow) {
      try { process.platform === 'win32' ? child.kill('SIGKILL') : child.pid && process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ }
    }
  });
  const killTree = () => {
    if (!child.pid) return;
    try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ }
  };
  const timer = setTimeout(killTree, 120_000);
  const abort = () => killTree();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const [code] = await once(child, 'close') as [number | null];
    if (signal?.aborted || overflow || code !== 0 || sampleIndex === 0) throw new PipelineError();
  } catch { killTree(); throw new PipelineError(); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  return peaks.map(value => Number(value.toFixed(4)));
}
