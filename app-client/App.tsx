import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Keyboard, PanResponder, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type ViewToken } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { MANIFEST_URL, PADS, loadManifestPads, resolveUri, type Pad } from './src/pads';
import { getPlaybackSnapshot, isWarm, play, stop, subscribePlayback, warm } from './src/audio/engine';
import { formatPlaybackTime, type PlaybackSnapshot } from './src/audio/playbackState';
import { beginTap, pendingCount, startMetrics } from './src/metrics';
import { EditorScreen } from './src/editor/EditorScreen';
import { LibraryScreen } from './src/editor/LibraryScreen';
import { deleteLocalClip, loadLocalClips, renameLocalClip, type LocalClip } from './src/editor/library';
import { applyBoardAssignments, emptyBoardAssignments, type BoardAssignments, type BoardPad } from './src/board/assignments';
import { loadBoardAssignments, addLocalClipToBoard, assignLocalClipToBoard, moveBoardPad, removeLocalClipFromBoard } from './src/board/storage';
import { filterSoundbites } from './src/board/search';
import { clampScrollOffset, dragHandleIndexAtPoint, edgeScrollStep, gridIndexAtPoint } from './src/board/reorderGeometry';
import { BASE_BOARD_SLOTS, MAX_SOUNDBITES } from './src/limits';

type RemoteState = 'loading' | 'warming' | 'ready' | 'failed' | 'unconfigured';
type Page = 'board' | 'editor' | 'library';
type SoundboardPad = BoardPad<Pad>;

const REMOTE_STATUS: Record<RemoteState, string> = {
  loading: 'Loading clip manifest…',
  warming: 'Preparing remote audio…',
  ready: 'Remote clips preloaded · Worker → private R2',
  failed: 'Remote audio unavailable · reload to retry',
  unconfigured: 'Bundled pads only · configure the manifest URL',
};

/**
 * M0 playback shell — STEPS.md step 7.
 *
 * Original sounds keep stable slot identities; local clips append to the
 * scrollable board and pads can be reordered without changing their assets.
 */
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const uris = useRef<Map<string, string>>(new Map());
  const [basePads, setBasePads] = useState<Pad[]>(() => PADS.map((pad) => ({ ...pad })));
  const basePadsRef = useRef(basePads);
  const [pads, setPads] = useState<SoundboardPad[]>(() => PADS.map((pad, slotIndex) => ({ ...pad, slotIndex })));
  const [boardQuery, setBoardQuery] = useState('');
  const boardList = useRef<FlatList<SoundboardPad>>(null);
  const warmQueue = useRef<{ active: boolean; pending: Array<{ id: string; uri: string }> }>({ active: false, pending: [] });
  const [localClips, setLocalClips] = useState<LocalClip[]>([]);
  const localClipsRef = useRef<LocalClip[]>([]);
  const [assignments, setAssignments] = useState<BoardAssignments>(() => emptyBoardAssignments());
  const assignmentsRef = useRef(assignments);
  const [boardError, setBoardError] = useState('');
  const [editingBoard, setEditingBoard] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ sourceSlotIndex: number; targetSlotIndex: number } | null>(null);
  const [selectedMoveSlotIndex, setSelectedMoveSlotIndex] = useState<number | null>(null);
  const listViewport = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const boardViewport = useRef<View>(null);
  const listScroll = useRef({ offset: 0, contentHeight: 0 });
  const activeDragRef = useRef<{ sourceSlotIndex: number; targetSlotIndex: number } | null>(null);
  const armedDragSlot = useRef<number | null>(null);
  const dragMoved = useRef(false);
  const dragPointer = useRef<{ x: number; y: number } | null>(null);
  const [padWidth, setPadWidth] = useState(0);
  const padGeneration = useRef(0);
  const tapGeneration = useRef(0);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(() => getPlaybackSnapshot());
  const [last, setLast] = useState<string>('');
  const [page, setPage] = useState<Page>('board');
  const [remoteState, setRemoteState] = useState<RemoteState>(
    MANIFEST_URL ? 'loading' : 'unconfigured',
  );

  const stopPlayback = useCallback(() => {
    tapGeneration.current += 1;
    stop();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePlayback(() => setPlayback(getPlaybackSnapshot()));
    return () => {
      unsubscribe();
      stopPlayback();
    };
  }, [stopPlayback]);

  // Progress comes from AudioContext.currentTime. Poll only while there is an
  // active voice; inactive boards do not wake every 100 ms.
  useEffect(() => {
    if (playback.status !== 'playing') return;
    const timer = setInterval(() => setPlayback(getPlaybackSnapshot()), 100);
    return () => clearInterval(timer);
  }, [playback.status, playback.status === 'playing' ? playback.padId : null]);

  const scheduleLocalWarm = useCallback((visiblePads: SoundboardPad[]) => {
    const queue = warmQueue.current;
    queue.pending = visiblePads
      .filter((pad) => Boolean(pad.localClipId && pad.uri))
      .slice(0, 8)
      .map((pad) => ({ id: pad.id, uri: pad.uri! }));
    if (queue.active) return;

    const drain = async () => {
      queue.active = true;
      try {
        while (queue.pending.length) {
          const next = queue.pending.shift();
          if (!next) continue;
          try {
            await warm(next.uri);
          } catch (err) {
            console.warn(`[audio] could not prewarm ${next.id}`, err);
          }
        }
      } finally {
        queue.active = false;
        if (queue.pending.length) void drain();
      }
    };
    void drain();
  }, []);

  const onBoardViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    scheduleLocalWarm(viewableItems.map((token) => token.item as SoundboardPad));
  }).current;
  const boardViewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const filteredPads = useMemo(() => filterSoundbites(pads, boardQuery), [pads, boardQuery]);

  const refreshBoard = useCallback(() => {
    warmQueue.current.pending = [];
    let nextClips: LocalClip[] = [];
    let nextAssignments = emptyBoardAssignments();
    const errors: string[] = [];

    try {
      nextClips = loadLocalClips();
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : 'Could not read the on-device library.');
    }
    try {
      nextAssignments = loadBoardAssignments();
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : 'Could not read board assignments.');
    }

    localClipsRef.current = nextClips;
    assignmentsRef.current = nextAssignments;
    setLocalClips(nextClips);
    setAssignments(nextAssignments);
    setBoardError(errors.join(' '));
    setPads(applyBoardAssignments(basePadsRef.current, nextAssignments, nextClips));
  }, []);

  const cancelDrag = useCallback(() => {
    dragPointer.current = null;
    activeDragRef.current = null;
    armedDragSlot.current = null;
    setActiveDrag(null);
  }, []);

  const commitBoardMove = useCallback((sourceSlotIndex: number, targetSlotIndex: number) => {
    if (sourceSlotIndex === targetSlotIndex) return;
    try {
      moveBoardPad(sourceSlotIndex, targetSlotIndex);
      cancelDrag();
      setSelectedMoveSlotIndex(null);
      refreshBoard();
      setLast(`Pad ${sourceSlotIndex + 1} moved to position ${pads.findIndex((pad) => pad.slotIndex === targetSlotIndex) + 1}`);
    } catch (cause) {
      cancelDrag();
      Alert.alert('Could not reorder board', cause instanceof Error ? cause.message : 'The board order could not be saved.');
    }
  }, [cancelDrag, pads, refreshBoard]);

  const selectOrMovePad = useCallback((slotIndex: number) => {
    if (selectedMoveSlotIndex === null) {
      setSelectedMoveSlotIndex(slotIndex);
      return;
    }
    if (selectedMoveSlotIndex === slotIndex) {
      setSelectedMoveSlotIndex(null);
      return;
    }
    commitBoardMove(selectedMoveSlotIndex, slotIndex);
  }, [commitBoardMove, selectedMoveSlotIndex]);

  const beginPadDrag = useCallback((slotIndex: number) => {
    dragMoved.current = false;
    dragPointer.current = null;
    activeDragRef.current = { sourceSlotIndex: slotIndex, targetSlotIndex: slotIndex };
    setSelectedMoveSlotIndex(slotIndex);
    setActiveDrag({ sourceSlotIndex: slotIndex, targetSlotIndex: slotIndex });
  }, []);

  const updatePadDrag = useCallback((sourceSlotIndex: number, pageX: number, pageY: number) => {
    const viewport = listViewport.current;
    dragPointer.current = { x: pageX, y: pageY };
    const position = gridIndexAtPoint({ x: pageX - viewport.x, y: pageY - viewport.y }, {
      width: viewport.width,
      scrollOffset: listScroll.current.offset,
      itemCount: pads.length,
      columns: 4,
      gap: GAP,
      padding: GAP,
      itemHeight: 92,
    });
    const targetSlotIndex = pads[position]?.slotIndex ?? sourceSlotIndex;
    const current = activeDragRef.current;
    if (current?.sourceSlotIndex !== sourceSlotIndex) return;
    activeDragRef.current = { sourceSlotIndex, targetSlotIndex };
    setActiveDrag(activeDragRef.current);
  }, [pads]);

  const endPadDrag = useCallback((sourceSlotIndex: number, moved: boolean, cancelled = false) => {
    dragPointer.current = null;
    if (cancelled) {
      cancelDrag();
      return;
    }
    if (!moved) {
      cancelDrag();
      setSelectedMoveSlotIndex(sourceSlotIndex);
      return;
    }
    const latest = activeDragRef.current;
    const targetSlotIndex = latest?.sourceSlotIndex === sourceSlotIndex
      ? latest.targetSlotIndex
      : sourceSlotIndex;
    if (sourceSlotIndex === targetSlotIndex) {
      cancelDrag();
      setSelectedMoveSlotIndex(sourceSlotIndex);
      return;
    }
    commitBoardMove(sourceSlotIndex, targetSlotIndex);
  }, [cancelDrag, commitBoardMove]);

  const onBoardListLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const columns = 4;
    setPadWidth(Math.max(1, (width - GAP * 2 - GAP * (columns - 1)) / columns));
    boardViewport.current?.measureInWindow((x, y) => {
      listViewport.current = { x, y, width, height };
    });
  }, []);

  const updateBoardScroll = useCallback((offset: number, contentHeight = listScroll.current.contentHeight) => {
    const height = listViewport.current.height;
    listScroll.current = { offset: clampScrollOffset(offset, contentHeight, height), contentHeight };
  }, []);

  useEffect(() => {
    if (!activeDrag) return;
    const timer = setInterval(() => {
      const pointer = dragPointer.current;
      const viewport = listViewport.current;
      if (!pointer || viewport.height <= 0) return;
      const pointerY = pointer.y - viewport.y;
      const step = edgeScrollStep(pointerY, viewport.height);
      if (!step) return;
      const nextOffset = clampScrollOffset(
        listScroll.current.offset + step,
        listScroll.current.contentHeight,
        viewport.height,
      );
      if (nextOffset === listScroll.current.offset) return;
      updateBoardScroll(nextOffset);
      boardList.current?.scrollToOffset({ offset: nextOffset, animated: false });
      const latest = activeDragRef.current;
      if (latest) updatePadDrag(latest.sourceSlotIndex, pointer.x, pointer.y);
    }, 50);
    return () => clearInterval(timer);
  }, [Boolean(activeDrag), updateBoardScroll, updatePadDrag]);

  const boardPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) => {
      if (!editingBoard) return false;
      const viewport = listViewport.current;
      const index = dragHandleIndexAtPoint({
        x: event.nativeEvent.pageX - viewport.x,
        y: event.nativeEvent.pageY - viewport.y,
      }, {
        width: viewport.width,
        scrollOffset: listScroll.current.offset,
        itemCount: pads.length,
        columns: 4,
        gap: GAP,
        padding: GAP,
        itemHeight: 92,
      });
      const pad = index === null ? undefined : pads[index];
      if (!pad) return false;
      armedDragSlot.current = pad.slotIndex;
      return true;
    },
    onMoveShouldSetPanResponderCapture: () => editingBoard && armedDragSlot.current !== null,
    onPanResponderGrant: () => {
      if (armedDragSlot.current !== null) beginPadDrag(armedDragSlot.current);
    },
    onPanResponderMove: (_event, gesture) => {
      const source = armedDragSlot.current;
      if (source === null) return;
      if (Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5) dragMoved.current = true;
      if (dragMoved.current) updatePadDrag(source, gesture.moveX, gesture.moveY);
    },
    onPanResponderRelease: () => {
      const source = armedDragSlot.current;
      if (source !== null) endPadDrag(source, dragMoved.current);
      armedDragSlot.current = null;
    },
    onPanResponderTerminate: () => {
      const source = armedDragSlot.current;
      if (source !== null) endPadDrag(source, false, true);
      armedDragSlot.current = null;
    },
    onPanResponderTerminationRequest: () => false,
  }), [beginPadDrag, editingBoard, endPadDrag, pads, updatePadDrag]);

  useEffect(() => {
    cancelDrag();
    setSelectedMoveSlotIndex(null);
  }, [page, editingBoard, boardQuery, pads, cancelDrag]);

  // Collect tap latencies for as long as the app is up (STEPS step 8).
  useEffect(startMetrics, []);

  useEffect(() => {
    if (page !== 'board') {
      stopPlayback();
      setEditingBoard(false);
    }
  }, [page, stopPlayback]);

  useEffect(() => {
    if (page === 'board' || page === 'library') refreshBoard();
  }, [page, refreshBoard]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopPlayback();
        cancelDrag();
      } else {
        refreshBoard();
      }
    });
    return () => subscription.remove();
  }, [cancelDrag, refreshBoard, stopPlayback]);

  // Resolve and prewarm current pad URIs. Local file URIs enter the map
  // immediately, so local taps never wait for a remote manifest or preload.
  useEffect(() => {
    const generation = ++padGeneration.current;
    const currentPads = pads;
    uris.current.clear();

    for (const pad of currentPads) {
      if (pad.uri) {
        uris.current.set(pad.id, pad.uri);
        continue;
      }
      void resolveUri(pad).then((uri) => {
        if (generation === padGeneration.current) uris.current.set(pad.id, uri);
      }).catch((err) => {
        console.warn(`[pads] could not resolve ${pad.id}`, err);
      });
    }

    return () => {
      if (generation === padGeneration.current) padGeneration.current += 1;
    };
  }, [pads]);

  useEffect(() => {
    warmQueue.current.pending = [];
    if (page === 'board') {
      boardList.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [boardQuery, page]);

  // Resolve and warm the remote defaults in the background. This status is
  // independent of local pad availability and local playback.
  useEffect(() => {
    let active = true;
    const prepareRemote = async (): Promise<void> => {
      if (MANIFEST_URL) {
        try {
          const nextPads = await loadManifestPads();
          if (!active) return;
          basePadsRef.current = nextPads;
          setBasePads(nextPads);
          setPads(applyBoardAssignments(nextPads, assignmentsRef.current, localClipsRef.current));
          const remotePads = nextPads.filter((pad) => pad.uri !== undefined);
          setRemoteState(remotePads.length ? 'warming' : 'failed');
          await Promise.all(remotePads.map((pad) => warm(pad.uri!)));
          if (!active) return;
          setRemoteState(remotePads.length > 0 && remotePads.every((pad) => isWarm(pad.uri!)) ? 'ready' : 'failed');
        } catch (err) {
          console.warn('[pads] manifest load failed', err);
          if (active) setRemoteState('failed');
        }
      }
    };

    prepareRemote().catch((err) => {
      console.warn('[pads] remote preparation failed', err);
      if (active) setRemoteState('failed');
    });

    return () => {
      active = false;
    };
  }, []);

  // onPressIn, NOT onPress. onPress fires on release - 100 ms+ of dead air, and
  // the most common reason a soundboard feels sluggish (DESIGN §8).
  const trigger = useCallback((pad: Pad) => {
    const uri = pad.uri ?? uris.current.get(pad.id);
    if (!uri) return;

    // Opened before anything else, so the clock starts as close to the press
    // as it can get (STEPS step 8).
    const request = ++tapGeneration.current;
    const tap = beginTap(pad.id, isWarm(uri));
    play(uri, pad.id)
      .then(({ started }) => {
        if (!started) {
          tap.failed();
          return;
        }
        // The header shows the sample that was actually recorded, so what you
        // read on the device is exactly what is in the dataset.
        const s = tap.scheduled();
        if (tapGeneration.current === request) {
          setLast(
            `${pad.name}  ${s.pressToScheduledMs.toFixed(0)} ms  ${s.cacheHit ? 'warm' : 'cold'}  ·  ${pendingCount()} buffered`,
          );
        }
      })
      .catch((err) => {
        tap.failed();
        console.warn(`[audio] ${pad.id} failed`, err);
        if (tapGeneration.current === request) setLast(`${pad.name}  failed`);
      });
  }, []);

  const kill = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const persistAssignment = useCallback((clipId: string, slotIndex: number) => {
    const availableClip = loadLocalClips().find((clip) => clip.id === clipId);
    if (!availableClip || availableClip.missing || !availableClip.uri) {
      throw new Error('This clip is no longer available in the on-device library.');
    }
    assignLocalClipToBoard(slotIndex, clipId);
    refreshBoard();
    setLast(`${availableClip.title} added to pad ${slotIndex + 1}`);
    setPage('board');
  }, [refreshBoard]);

  const appendLocalClipToBoard = useCallback((clipId: string) => {
    const availableClip = loadLocalClips().find((clip) => clip.id === clipId);
    if (!availableClip || availableClip.missing || !availableClip.uri) {
      throw new Error('This clip is no longer available in the on-device library.');
    }
    const previous = assignmentsRef.current;
    const next = addLocalClipToBoard(clipId);
    const slotIndex = next.slots.findIndex((assignedId, index) =>
      assignedId === clipId && previous.slots[index] !== clipId,
    );
    refreshBoard();
    setLast(`${availableClip.title} added as a new sound${slotIndex >= 0 ? ` on pad ${slotIndex + 1}` : ''}`);
    setBoardQuery('');
    setPage('board');
  }, [refreshBoard]);

  const renameClip = useCallback((clipId: string, title: string) => {
    renameLocalClip(clipId, title);
    refreshBoard();
    setLast(`Renamed soundbite to ${title}`);
  }, [refreshBoard]);

  const deleteClip = useCallback((clipId: string) => {
    deleteLocalClip(clipId);
    refreshBoard();
  }, [refreshBoard]);

  const removeAssignment = useCallback((pad: Pad & { localClipId?: string }, slotIndex: number) => {
    if (!pad.localClipId) return;
    Alert.alert(
      'Remove from board?',
      slotIndex < BASE_BOARD_SLOTS
        ? `“${pad.name}” will return to its original pad sound. The library file will stay on this device.`
        : `“${pad.name}” will be removed from the board. The library file will stay on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => {
          try {
            removeLocalClipFromBoard(slotIndex);
            refreshBoard();
            setLast(slotIndex < BASE_BOARD_SLOTS ? `Pad ${slotIndex + 1} restored to its original sound` : `Pad ${slotIndex + 1} removed from the board`);
          } catch (cause) {
            Alert.alert('Could not update board', cause instanceof Error ? cause.message : 'The board assignment could not be removed.');
          }
        } },
      ],
    );
  }, [refreshBoard]);

  const startupStatus = remoteState === 'ready'
    ? `${basePads.filter((pad) => pad.uri !== undefined).length} remote clips preloaded · Worker → private R2${pads.filter((pad) => pad.localClipId).length ? ` · ${pads.filter((pad) => pad.localClipId).length} local pads assigned` : ''}`
    : `${REMOTE_STATUS[remoteState]}${pads.filter((pad) => pad.localClipId).length ? ` · ${pads.filter((pad) => pad.localClipId).length} local pads assigned` : ''}`;
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {page === 'editor' ? <EditorScreen onOpenLibrary={() => setPage('library')} /> : null}
      {page === 'library' ? (
        <LibraryScreen
          onBack={() => setPage('editor')}
          onOpenEditor={() => setPage('editor')}
          basePads={basePads}
          clips={localClips}
          assignments={assignments}
          assignmentError={boardError}
          onAssign={persistAssignment}
          onAppend={appendLocalClipToBoard}
          onRename={renameClip}
          onDelete={deleteClip}
        />
      ) : null}

      {page === 'board' ? <>
      <View style={styles.header}>
        <Text style={styles.title}>StimyzApp</Text>
        <Text style={[styles.meta, boardError && styles.metaError]}>{boardError || last || startupStatus}</Text>
        <View style={styles.headerActions}>
          {editingBoard && selectedMoveSlotIndex !== null ? (() => {
            const position = pads.findIndex((pad) => pad.slotIndex === selectedMoveSlotIndex);
            return <View style={styles.moveButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel="Move selected pad earlier" disabled={position <= 0} onPress={() => commitBoardMove(selectedMoveSlotIndex, pads[position - 1]?.slotIndex ?? selectedMoveSlotIndex)} style={[styles.moveButton, position <= 0 && styles.moveButtonDisabled]}><Text style={styles.moveButtonText}>↑ EARLIER</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Move selected pad later" disabled={position < 0 || position >= pads.length - 1} onPress={() => commitBoardMove(selectedMoveSlotIndex, pads[position + 1]?.slotIndex ?? selectedMoveSlotIndex)} style={[styles.moveButton, (position < 0 || position >= pads.length - 1) && styles.moveButtonDisabled]}><Text style={styles.moveButtonText}>↓ LATER</Text></Pressable>
            </View>;
          })() : null}
          <Pressable accessibilityRole="button" accessibilityState={{ selected: editingBoard }} onPress={() => {
            stopPlayback();
            cancelDrag();
            if (!editingBoard) {
              Keyboard.dismiss();
              setBoardQuery('');
            }
            setSelectedMoveSlotIndex(null);
            setEditingBoard((editing) => !editing);
          }} style={styles.editButton}>
          <Text style={styles.editButtonText}>{editingBoard ? 'DONE' : 'EDIT BOARD'}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.searchBlock}>
        {editingBoard ? <Text style={styles.editHint}>Drag a handle, or tap a pad then its destination.</Text> : <>
        <View style={styles.searchRow}>
          <TextInput
            value={boardQuery}
            onChangeText={setBoardQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search soundbites"
            placeholderTextColor="#737d86"
            accessibilityLabel="Search soundbites by name"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {boardQuery ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setBoardQuery('')} style={styles.clearSearch}><Text style={styles.clearSearchText}>×</Text></Pressable> : null}
        </View>
        </>}
        <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{boardQuery ? `${filteredPads.length} of ${pads.length} · ${MAX_SOUNDBITES} max` : `${pads.length} / ${MAX_SOUNDBITES} soundbites`}</Text>
      </View>
      <View ref={boardViewport} style={styles.boardListContainer} onLayout={onBoardListLayout} {...boardPanResponder.panHandlers}>
      <FlatList
        ref={boardList}
        style={styles.boardList}
        contentContainerStyle={styles.grid}
        data={filteredPads}
        numColumns={4}
        keyExtractor={(pad) => pad.id}
        columnWrapperStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={7}
        removeClippedSubviews={!activeDrag}
        onScroll={(event) => updateBoardScroll(event.nativeEvent.contentOffset.y)}
        onContentSizeChange={(_width, height) => updateBoardScroll(listScroll.current.offset, height)}
        scrollEventThrottle={16}
        viewabilityConfig={boardViewabilityConfig}
        onViewableItemsChanged={onBoardViewableItemsChanged}
        ListEmptyComponent={<View style={styles.noResults}><Text style={styles.noResultsTitle}>No matching sounds</Text><Text style={styles.noResultsCopy}>Try another name or clear the search.</Text></View>}
        renderItem={({ item: pad }) => (
          <PadTile
            pad={pad}
            editingBoard={editingBoard}
            disabled={!editingBoard && !pad.localClipId && (
              remoteState === 'loading' ||
              (pad.uri !== undefined && remoteState === 'warming')
            )}
            progress={playback.status === 'playing' && playback.padId === pad.id ? playback.progress : null}
            elapsedLabel={playback.status === 'playing' && playback.padId === pad.id
              ? `${formatPlaybackTime(playback.elapsed)} / ${formatPlaybackTime(playback.duration)}`
              : null}
            onPlay={trigger}
            onRemove={removeAssignment}
            activeDrag={activeDrag}
            selectedMoveSlotIndex={selectedMoveSlotIndex}
            padWidth={padWidth}
            onSelectMovePad={selectOrMovePad}
          />
        )}
      />
      </View>

      {playback.status === 'playing' ? (
        <View style={styles.playbackDock}>
          <View style={styles.playbackInfo}>
            <Text numberOfLines={1} style={styles.playbackTitle}>
              NOW PLAYING · {pads.find((pad) => pad.id === playback.padId)?.name ?? playback.padId}
            </Text>
            <View style={styles.playbackMetaRow}>
              <Text style={styles.playbackTime}>
                {formatPlaybackTime(playback.elapsed)} / {formatPlaybackTime(playback.duration)}
              </Text>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="Audio playback progress"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(playback.progress * 100) }}
                style={styles.dockTrack}
              >
                <View style={[styles.dockProgress, { width: `${Math.round(playback.progress * 100)}%` }]} />
              </View>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop audio playback" style={styles.kill} onPress={kill}>
            <Text style={styles.killText}>STOP</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.killPlaceholder} />
      )}
      </> : null}

      <View style={styles.nav}>
        <NavButton label="BOARD" active={page === 'board'} onPress={() => setPage('board')} />
        <NavButton label="EDITOR" active={page === 'editor'} onPress={() => setPage('editor')} />
        <NavButton label="LIBRARY" active={page === 'library'} onPress={() => setPage('library')} />
      </View>
    </SafeAreaView>
  );
}

function NavButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={styles.navItem}>
      <View style={[styles.navDot, active && styles.navDotActive]} />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Pressable>
  );
}

const PadTile = memo(function PadTile({
  pad,
  editingBoard,
  disabled,
  progress,
  elapsedLabel,
  onPlay,
  onRemove,
  activeDrag,
  selectedMoveSlotIndex,
  padWidth,
  onSelectMovePad,
}: {
  pad: SoundboardPad;
  editingBoard: boolean;
  disabled: boolean;
  progress: number | null;
  elapsedLabel: string | null;
  onPlay: (pad: Pad) => void;
  onRemove: (pad: Pad & { localClipId?: string }, slotIndex: number) => void;
  activeDrag: { sourceSlotIndex: number; targetSlotIndex: number } | null;
  selectedMoveSlotIndex: number | null;
  padWidth: number;
  onSelectMovePad: (slotIndex: number) => void;
}) {
  const isTarget = activeDrag?.targetSlotIndex === pad.slotIndex;
  const isDragging = activeDrag?.sourceSlotIndex === pad.slotIndex;
  return (
    <View style={[
        styles.pad,
        { width: padWidth > 0 ? padWidth : '23%' as const },
        { backgroundColor: pad.color },
        disabled && styles.padDisabled,
        editingBoard && isTarget && styles.padDropTarget,
        editingBoard && selectedMoveSlotIndex === pad.slotIndex && !activeDrag && styles.padSelected,
        isDragging && styles.padDragging,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pad ${pad.slotIndex + 1}, ${pad.name}, ${pad.localClipId ? 'local clip' : 'original sound'}`}
        accessibilityState={{ disabled }}
        disabled={disabled && !editingBoard}
        onPressIn={() => { if (!editingBoard) onPlay(pad); }}
        onPress={() => { if (editingBoard) onSelectMovePad(pad.slotIndex); }}
        style={({ pressed }) => [styles.padContent, pressed && styles.padPressed]}
      >
        <Text numberOfLines={2} style={styles.padName}>{pad.name}</Text>
        {pad.localClipId ? <Text style={styles.localIndicator}>LOCAL</Text> : null}
        {elapsedLabel ? <Text style={styles.padProgressTime}>{elapsedLabel}</Text> : null}
        {progress !== null ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.padProgressTrack}
          >
            <View style={[styles.padProgress, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
      </Pressable>
      {editingBoard && pad.localClipId ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${pad.name} assignment`} onPress={() => onRemove(pad, pad.slotIndex)} style={styles.removePad}>
          <Text style={styles.removePadText}>×</Text>
        </Pressable>
      ) : null}
      {editingBoard ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select or drag to reorder pad ${pad.slotIndex + 1}, ${pad.name}`}
        onPress={() => onSelectMovePad(pad.slotIndex)}
        style={styles.dragHandle}
      ><Text style={styles.dragHandleText}>⠿</Text></Pressable> : null}
    </View>
  );
});

const GAP = 8;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#14161a' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: '#f5f6f8', fontSize: 24, fontWeight: '700' },
  meta: { color: '#8b93a1', fontSize: 13, marginTop: 2 },
  metaError: { color: '#ff9ba7' },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  editButton: { paddingHorizontal: 12, paddingVertical: 7, marginTop: 4, borderRadius: 9, backgroundColor: '#252c30' },
  editButtonText: { color: '#a5e8cf', fontSize: 9, letterSpacing: 1.2, fontWeight: '700' },
  moveButtons: { flexDirection: 'row', gap: 6 },
  moveButton: { paddingHorizontal: 8, paddingVertical: 7, marginTop: 4, borderRadius: 8, backgroundColor: '#20342f' },
  moveButtonDisabled: { opacity: 0.4 },
  moveButtonText: { color: '#d7ffed', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  searchBlock: { paddingHorizontal: GAP + 8, paddingBottom: 6, gap: 5 },
  editHint: { color: '#a5e8cf', fontSize: 11, paddingVertical: 7 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#343c43', backgroundColor: '#111418' },
  searchInput: { flex: 1, minHeight: 42, paddingHorizontal: 12, color: '#f1f4f5', fontSize: 14 },
  clearSearch: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: '#aeb8bd', fontSize: 23 },
  resultCount: { color: '#7f8a90', fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] },
  boardListContainer: { flex: 1 },
  boardList: { flex: 1 },
  grid: { paddingHorizontal: GAP, paddingBottom: GAP },
  row: { flexDirection: 'row', gap: GAP, marginBottom: GAP },
  noResults: { alignItems: 'center', paddingVertical: 54, paddingHorizontal: 20 },
  noResultsTitle: { color: '#eef1f2', fontSize: 16, fontWeight: '600' },
  noResultsCopy: { color: '#818c93', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  pad: {
    height: 92,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  padContent: { flex: 1, width: '100%', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  padPressed: { opacity: 0.6 },
  padDisabled: { opacity: 0.45 },
  padDropTarget: { borderWidth: 3, borderColor: '#f7fffb' },
  padSelected: { borderWidth: 2, borderColor: '#7ae3bf' },
  padDragging: { opacity: 0.82, transform: [{ scale: 1.03 }], zIndex: 2, elevation: 3 },
  removePad: { position: 'absolute', left: 4, top: 4, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,18,20,0.72)', zIndex: 3 },
  removePadText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '700' },
  dragHandle: { position: 'absolute', right: 3, bottom: 2, minWidth: 44, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: 'rgba(15,18,20,0.45)', zIndex: 3 },
  dragHandleText: { color: '#fff', fontSize: 19, fontWeight: '700', lineHeight: 22 },
  padName: { color: '#ffffff', fontSize: 14, lineHeight: 18, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 },
  localIndicator: { color: '#d7ffed', fontSize: 8, fontWeight: '800', letterSpacing: 1.2, marginTop: 5 },
  padProgressTrack: { position: 'absolute', left: 10, right: 10, bottom: 8, height: 3, borderRadius: 2, backgroundColor: 'rgba(10, 14, 15, 0.35)', overflow: 'hidden' },
  padProgress: { height: '100%', borderRadius: 2, backgroundColor: '#d7ffed' },
  padProgressTime: { position: 'absolute', bottom: 14, color: '#f7fffb', fontSize: 9, fontVariant: ['tabular-nums'], fontWeight: '700' },
  playbackDock: { margin: GAP, marginTop: 0, padding: 10, borderRadius: 12, backgroundColor: '#20272a', flexDirection: 'row', alignItems: 'center', gap: 10 },
  playbackInfo: { flex: 1, gap: 6 },
  playbackTitle: { color: '#d7ffed', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  playbackMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playbackTime: { minWidth: 65, color: '#aeb8bd', fontSize: 11, fontVariant: ['tabular-nums'] },
  dockTrack: { flex: 1, height: 4, borderRadius: 3, backgroundColor: '#414b50', overflow: 'hidden' },
  dockProgress: { height: '100%', borderRadius: 3, backgroundColor: '#7ae3bf' },
  kill: {
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#c4304a',
    alignItems: 'center',
  },
  killText: { color: '#fff', fontWeight: '700', letterSpacing: 2 },
  killPlaceholder: { height: 0 },
  nav: { height: 62, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: '#272c31', backgroundColor: '#171a1e', paddingHorizontal: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, height: '100%' },
  navDot: { width: 4, height: 4, borderRadius: 3, backgroundColor: '#59636c' },
  navDotActive: { width: 15, backgroundColor: '#7ae3bf' },
  navText: { color: '#78838b', fontSize: 9, letterSpacing: 1.3, fontWeight: '700' },
  navTextActive: { color: '#e9f1ef' },
});
