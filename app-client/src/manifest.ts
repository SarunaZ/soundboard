import type { Manifest, ManifestEntry } from '../../shared/src/index';

const CLIP_KEY = /^clips\/[0-9a-f]{64}\.m4a$/;
const COLOR = /^#[0-9a-f]{6}$/i;

type JsonResponse = Pick<Response, 'json' | 'ok' | 'status' | 'statusText'>;
export type ManifestFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<JsonResponse>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function parseEntry(value: unknown, index: number): ManifestEntry {
  const entry = record(value, `pads[${index}]`);
  const prefix = `pads[${index}]`;
  const tags = entry.tags;
  const color = entry.color;

  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw new Error(`${prefix}.tags must be an array of strings`);
  }
  if (color !== null && (typeof color !== 'string' || !COLOR.test(color))) {
    throw new Error(`${prefix}.color must be null or a six-digit hex color`);
  }
  if (typeof entry.pinned !== 'boolean') {
    throw new Error(`${prefix}.pinned must be a boolean`);
  }

  const gridPos = finiteNumber(entry.gridPos, `${prefix}.gridPos`);
  const byteSize = finiteNumber(entry.byteSize, `${prefix}.byteSize`);
  const durationMs = finiteNumber(entry.durationMs, `${prefix}.durationMs`);
  const clipKey = nonEmptyString(entry.clipKey, `${prefix}.clipKey`);

  if (!Number.isInteger(gridPos) || gridPos < 0) {
    throw new Error(`${prefix}.gridPos must be a non-negative integer`);
  }
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    throw new Error(`${prefix}.byteSize must be a positive integer`);
  }
  if (durationMs <= 0) {
    throw new Error(`${prefix}.durationMs must be positive`);
  }
  if (!CLIP_KEY.test(clipKey)) {
    throw new Error(`${prefix}.clipKey must be a content-addressed M4A key`);
  }

  return {
    padId: nonEmptyString(entry.padId, `${prefix}.padId`),
    clipId: nonEmptyString(entry.clipId, `${prefix}.clipId`),
    name: nonEmptyString(entry.name, `${prefix}.name`),
    tags,
    color,
    gridPos,
    pinned: entry.pinned,
    clipKey,
    byteSize,
    durationMs,
  };
}

/** Validate the untrusted JSON before any value reaches the playback UI. */
export function parseManifest(value: unknown): Manifest {
  const input = record(value, 'manifest');
  const version = finiteNumber(input.version, 'manifest.version');
  const generatedAt = nonEmptyString(input.generatedAt, 'manifest.generatedAt');
  const baseUrl = nonEmptyString(input.baseUrl, 'manifest.baseUrl');

  if (!Number.isInteger(version) || version < 1) {
    throw new Error('manifest.version must be a positive integer');
  }
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('manifest.generatedAt must be an ISO date');
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    throw new Error('manifest.baseUrl must be an absolute URL');
  }
  if (parsedBase.protocol !== 'https:' || parsedBase.username || parsedBase.password) {
    throw new Error('manifest.baseUrl must be a credential-free HTTPS URL');
  }
  if (!Array.isArray(input.pads)) {
    throw new Error('manifest.pads must be an array');
  }

  const pads = input.pads.map(parseEntry);
  const occupied = new Set<number>();
  for (const pad of pads) {
    if (!pad.pinned) continue;
    if (occupied.has(pad.gridPos)) {
      throw new Error(`manifest has duplicate pinned gridPos ${pad.gridPos}`);
    }
    occupied.add(pad.gridPos);
  }

  return { version, generatedAt, baseUrl, pads };
}

export function clipUrl(baseUrl: string, clipKey: string): string {
  if (!CLIP_KEY.test(clipKey)) {
    throw new Error('clipKey must be a content-addressed M4A key');
  }
  return new URL(clipKey, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

export async function fetchManifest(
  manifestUrl: string,
  fetcher: ManifestFetch = fetch,
): Promise<Manifest> {
  const response = await fetcher(manifestUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`manifest request failed: ${response.status} ${response.statusText}`);
  }
  return parseManifest(await response.json());
}
