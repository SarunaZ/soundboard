export type BoardColumns = 3 | 4;

export function boardSoundsPerPage(columns: BoardColumns): number {
  return columns * 4 - 1; // Quick Add occupies the remaining grid cell.
}

export function boardPageCount(soundCount: number, columns: BoardColumns): number {
  return Math.max(1, Math.ceil(Math.max(0, soundCount) / boardSoundsPerPage(columns)));
}

export function boardPageSlice<T>(items: readonly T[], columns: BoardColumns, page: number): T[] {
  const size = boardSoundsPerPage(columns);
  const safePage = Math.max(0, Math.floor(page));
  return items.slice(safePage * size, (safePage + 1) * size);
}

export function nextBoardBatchCount(currentCount: number, totalCount: number, columns: BoardColumns): number {
  return Math.min(Math.max(0, totalCount), Math.max(0, currentCount) + columns * 4);
}

export function boardDistanceFromEnd(contentHeight: number, viewportHeight: number, offset: number): number {
  return contentHeight - viewportHeight - offset;
}

export function shouldAutoLoadBoardSounds(input: {
  userScrolled: boolean;
  distanceFromEnd: number;
  nearEndDistance: number;
  loadedSoundCount: number;
  totalSoundCount: number;
  lastRequestedSoundCount: number;
}): boolean {
  return input.userScrolled && input.distanceFromEnd <= input.nearEndDistance &&
    input.loadedSoundCount < input.totalSoundCount &&
    input.loadedSoundCount !== input.lastRequestedSoundCount;
}
