import { BASE_BOARD_SLOTS, MAX_SOUNDBITES } from '../limits.ts';

const APPENDED_PAD_COLORS = [
  '#e05a47', '#e0873f', '#d9b13c', '#8fb141',
  '#4aa06b', '#3f9d92', '#3d87b0', '#4a68c0',
  '#6a56c2', '#8f4fbd', '#b8459f', '#c4407a',
  '#5a6270', '#6b7280', '#7c8695', '#8d97a6',
] as const;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export interface BoardAssignments {
  version: 1;
  slots: (string | null)[];
}

export type BoardPad<T extends { id: string; name: string; color: string; uri?: string } = {
  id: string;
  name: string;
  color: string;
  uri?: string;
  module?: number;
}> = T & { slotIndex: number; localClipId?: string };

export function emptyBoardAssignments(): BoardAssignments {
  return { version: 1, slots: Array.from({ length: BASE_BOARD_SLOTS }, () => null) };
}

export function parseBoardAssignments(value: unknown): BoardAssignments {
  if (!value || typeof value !== 'object') throw new Error('The on-device board assignments are unreadable.');
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.slots)) {
    throw new Error('The on-device board assignments have an unsupported format.');
  }
  if (row.slots.length < BASE_BOARD_SLOTS || row.slots.length > MAX_SOUNDBITES || row.slots.some((id) => id !== null && !isUuid(id))) {
    throw new Error(`The on-device board assignments must contain ${BASE_BOARD_SLOTS} to ${MAX_SOUNDBITES} valid clip IDs or empty slots.`);
  }
  return { version: 1, slots: [...row.slots] as (string | null)[] };
}

function validateSlotIndex(slotIndex: number): void {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_SOUNDBITES) {
    throw new Error(`Board slot index must be an integer from 0 to ${MAX_SOUNDBITES - 1}.`);
  }
}

function validateClipId(clipId: string): void {
  if (!isUuid(clipId)) throw new Error('Invalid local clip ID.');
}

export function assignClipToSlot(state: BoardAssignments, slotIndex: number, clipId: string): BoardAssignments {
  const validated = parseBoardAssignments(state);
  validateSlotIndex(slotIndex);
  validateClipId(clipId);
  const slots = [...validated.slots];
  while (slots.length <= slotIndex) slots.push(null);
  slots[slotIndex] = clipId;
  return { version: 1, slots };
}

export function clearBoardSlot(state: BoardAssignments, slotIndex: number): BoardAssignments {
  const validated = parseBoardAssignments(state);
  validateSlotIndex(slotIndex);
  if (slotIndex >= validated.slots.length) return validated;
  const slots = [...validated.slots];
  slots[slotIndex] = null;
  return { version: 1, slots };
}

export function removeClipAssignments(state: BoardAssignments, clipId: string): BoardAssignments {
  const validated = parseBoardAssignments(state);
  validateClipId(clipId);
  return {
    version: 1,
    slots: validated.slots.map((id) => id === clipId ? null : id),
  };
}

export function nextAvailableBoardSlot(state: BoardAssignments): number {
  const validated = parseBoardAssignments(state);
  const openSlot = validated.slots.findIndex((clipId, index) => index >= BASE_BOARD_SLOTS && clipId === null);
  if (openSlot >= 0) return openSlot;
  if (validated.slots.length >= MAX_SOUNDBITES) {
    throw new Error(`The board is full. It can hold up to ${MAX_SOUNDBITES} soundbites.`);
  }
  return validated.slots.length;
}

export function applyBoardAssignments<T extends { id: string; name: string; color: string; uri?: string; module?: number }>(
  basePads: T[],
  state: BoardAssignments,
  clips: Array<{ id: string; title: string; uri: string; missing: boolean }>,
): Array<BoardPad<T>> {
  const validated = parseBoardAssignments(state);
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const pads: Array<BoardPad<T>> = basePads.map((basePad, index) => {
    const clipId = validated.slots[index];
    if (!clipId) return { ...basePad, slotIndex: index };
    const clip = clipsById.get(clipId);
    if (!clip || clip.missing || typeof clip.uri !== 'string' || clip.uri.length === 0) {
      return { ...basePad, slotIndex: index };
    }
    return {
      ...basePad,
      id: `local-pad-${index}`,
      name: clip.title,
      uri: clip.uri,
      localClipId: clip.id,
      module: undefined,
      slotIndex: index,
    } as BoardPad<T>;
  });

  for (let slotIndex = basePads.length; slotIndex < validated.slots.length; slotIndex += 1) {
    const clipId = validated.slots[slotIndex];
    if (!clipId) continue;
    const clip = clipsById.get(clipId);
    if (!clip || clip.missing || typeof clip.uri !== 'string' || clip.uri.length === 0) continue;
    pads.push({
      id: `local-pad-${slotIndex}`,
      name: clip.title,
      color: APPENDED_PAD_COLORS[slotIndex % APPENDED_PAD_COLORS.length]!,
      uri: clip.uri,
      localClipId: clip.id,
      slotIndex,
    } as BoardPad<T>);
  }
  return pads;
}
