export type BoardScrollRailGeometry = {
  thumbHeight: number;
  thumbTravel: number;
  maxScrollOffset: number;
  thumbTop: number;
};

export const BOARD_NAV_BAR_HEIGHT = 78;

export function boardStopDockGeometry(navBarHeight = BOARD_NAV_BAR_HEIGHT, dockHeight = 48, navGap = 14): {
  clearance: number;
  bottom: number;
  modalInset: number;
} {
  return {
    clearance: dockHeight + navGap,
    bottom: navBarHeight + navGap,
    modalInset: navBarHeight + dockHeight + navGap,
  };
}

export function boardNeedsScrollRail(input: {
  navigation: 'pages' | 'scroll';
  filteredSoundCount: number;
  loadedSoundCount: number;
  contentHeight: number;
  viewportHeight: number;
  latchedVisible: boolean;
}): boolean {
  const unloadedScrollSounds = input.navigation === 'scroll' && input.filteredSoundCount > input.loadedSoundCount;
  const measuredOverflow = input.contentHeight > input.viewportHeight + 1;
  return unloadedScrollSounds || measuredOverflow || input.latchedVisible;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function boardScrollRailGeometry(
  contentHeight: number,
  viewportHeight: number,
  trackHeight: number,
  minimumThumbHeight = 42,
  scrollOffset = 0,
): BoardScrollRailGeometry {
  const content = Math.max(0, contentHeight);
  const viewport = Math.max(0, viewportHeight);
  const track = Math.max(0, trackHeight);
  const maxScrollOffset = Math.max(0, content - viewport);
  if (content === 0 || viewport === 0 || track === 0 || maxScrollOffset === 0) {
    return { thumbHeight: track, thumbTravel: 0, maxScrollOffset, thumbTop: 0 };
  }
  const thumbHeight = clamp(track * Math.min(1, viewport / content), Math.min(minimumThumbHeight, track), track);
  const thumbTravel = Math.max(0, track - thumbHeight);
  const thumbTop = maxScrollOffset > 0 ? (clamp(scrollOffset, 0, maxScrollOffset) / maxScrollOffset) * thumbTravel : 0;
  return { thumbHeight, thumbTravel, maxScrollOffset, thumbTop };
}

/** A downward finger drag moves the thumb and the board toward later sounds. */
export function boardScrollRailOffset(
  startOffset: number,
  deltaY: number,
  contentHeight: number,
  viewportHeight: number,
  thumbTravel: number,
): number {
  const maxScrollOffset = Math.max(0, contentHeight - viewportHeight);
  if (maxScrollOffset === 0 || thumbTravel <= 0) return 0;
  return clamp(startOffset + deltaY * (maxScrollOffset / thumbTravel), 0, maxScrollOffset);
}

export function boardScrollRailShouldLoadMore(
  offset: number,
  contentHeight: number,
  viewportHeight: number,
  nearEndDistance: number,
  loadedSoundCount: number,
  totalSoundCount: number,
): boolean {
  if (loadedSoundCount >= totalSoundCount) return false;
  const distanceFromEnd = Math.max(0, contentHeight - viewportHeight - offset);
  return distanceFromEnd <= Math.max(0, nearEndDistance);
}
