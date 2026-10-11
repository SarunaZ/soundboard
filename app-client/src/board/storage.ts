import { Directory, File, Paths } from 'expo-file-system';

import {
  assignClipToSlot,
  clearBoardSlot,
  emptyBoardAssignments,
  nextAvailableBoardSlot,
  parseBoardAssignments,
  removeClipAssignments,
  type BoardAssignments,
} from './assignments';

const LIBRARY_DIRECTORY = new Directory(Paths.document, 'local-clips');
const CACHE_FILE = new File(LIBRARY_DIRECTORY, 'board.json');
const BACKUP_FILE = new File(LIBRARY_DIRECTORY, 'board.backup.json');

function readAssignmentsFile(file: File): BoardAssignments {
  return parseBoardAssignments(JSON.parse(file.textSync()) as unknown);
}

function readAssignments(): BoardAssignments {
  if (CACHE_FILE.exists) {
    try {
      return readAssignmentsFile(CACHE_FILE);
    } catch (error) {
      if (BACKUP_FILE.exists) {
        try {
          return readAssignmentsFile(BACKUP_FILE);
        } catch {
          // Preserve both files and expose the corruption rather than silently
          // replacing the only remaining assignment state.
        }
      }
      throw error;
    }
  }
  if (BACKUP_FILE.exists) return readAssignmentsFile(BACKUP_FILE);
  return emptyBoardAssignments();
}

function writeAssignments(state: BoardAssignments): void {
  const validated = parseBoardAssignments(state);
  LIBRARY_DIRECTORY.create({ intermediates: true, idempotent: true });
  // Expo File.moveSync updates the source File object's URI to its destination.
  // Create a fresh staging handle for every snapshot write.
  const nextFile = new File(LIBRARY_DIRECTORY, 'board.next.json');
  nextFile.create({ overwrite: true });
  nextFile.write(JSON.stringify(validated));

  if (CACHE_FILE.exists) {
    try {
      readAssignmentsFile(CACHE_FILE);
      CACHE_FILE.copySync(BACKUP_FILE, { overwrite: true });
    } catch {
      // Retain the previous backup if the primary is already damaged.
    }
  }
  nextFile.moveSync(CACHE_FILE, { overwrite: true });
}

export function loadBoardAssignments(): BoardAssignments {
  return readAssignments();
}

export function saveBoardAssignments(state: BoardAssignments): BoardAssignments {
  const validated = parseBoardAssignments(state);
  writeAssignments(validated);
  return validated;
}

export function assignLocalClipToBoard(slotIndex: number, clipId: string): BoardAssignments {
  const next = assignClipToSlot(readAssignments(), slotIndex, clipId);
  writeAssignments(next);
  return next;
}

export function addLocalClipToBoard(clipId: string): BoardAssignments {
  const current = readAssignments();
  const slotIndex = nextAvailableBoardSlot(current);
  const next = assignClipToSlot(current, slotIndex, clipId);
  writeAssignments(next);
  return next;
}

export function removeLocalClipFromBoard(slotIndex: number): BoardAssignments {
  const next = clearBoardSlot(readAssignments(), slotIndex);
  writeAssignments(next);
  return next;
}

export function removeLocalClipAssignments(clipId: string): BoardAssignments {
  const next = removeClipAssignments(readAssignments(), clipId);
  writeAssignments(next);
  return next;
}
