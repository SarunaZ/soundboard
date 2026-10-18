import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, Keyboard, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { stop } from '../../../app-client/src/audio/engine';
import { clearPad, createBoard as persistBoard, loadBoards, renamePad, reorderPad, selectBoard, type Board, type BoardCollection, type BoardPad } from '../data/boards';
import type { LocalClip } from '../data/library';
import { loadPlayPreferences, savePlayPreferences, type QuickAction } from '../data/preferences';
import { ActionButton, Heading, Panel } from './controls';
import { calculateBoardGrid, calculateBoardTileHeight } from './boardLayout';
import { clampScrollOffset, edgeScrollStep, gridIndexAtPoint } from '../../../app-client/src/board/reorderGeometry';
import { gridIndexToPadIndex, gridItemCountWithQuickAdd } from './quickAddGrid';
import type { Theme } from './theme';
import { contrastForeground, iconChoices } from './theme';

type Props = {
  theme: Theme;
  collection: BoardCollection;
  clips: LocalClip[];
  onChange: (collection: BoardCollection) => void;
  onPlay: (clip: LocalClip, padId: string) => void;
  onCreate: (boardId: string, padId?: string) => void;
  onAddClip: () => void;
  onOpenLibrary: (target?: { boardId: string; padId?: string }) => void;
  onAppearance?: () => void;
};

export function BoardScreen({ theme, collection, clips, onChange, onPlay, onCreate, onAddClip, onOpenLibrary, onAppearance }: Props) {
  const [selector, setSelector] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [selectedPad, setSelectedPad] = useState<{ boardId: string; pad: BoardPad } | null>(null);
  const [rename, setRename] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [availableWidth, setAvailableWidth] = useState(0);
  const [drag, setDrag] = useState<{ sourcePadId: string; targetPadId: string } | null>(null);
  const [selectedMovePadId, setSelectedMovePadId] = useState<string | null>(null);
  const [failedArtworkUris, setFailedArtworkUris] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const viewport = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scroll = useRef({ offset: 0, contentHeight: 0 });
  const activeDrag = useRef<{ sourcePadId: string; targetPadId: string } | null>(null);
  const armedPadId = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [quickAction, setQuickAction] = useState<QuickAction>(() => {
    try { return loadPlayPreferences().quickAction; } catch { return 'file'; }
  });
  const { fontScale } = useWindowDimensions();
  const layout = calculateBoardGrid(availableWidth, fontScale, 10);
  const tileHeight = calculateBoardTileHeight(layout.tileWidth, fontScale);
  const active = collection.boards.find((board) => board.id === collection.activeBoardId) ?? collection.boards[0] ?? { id: '', name: '', pads: [] };
  const clipById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);
  const visiblePads = useMemo(() => active?.pads.filter((pad, index) => {
    const clip = pad.clipId ? clipById.get(pad.clipId) : undefined;
    const label = pad.label || clip?.title || `Pad ${index + 1}`;
    const query = search.trim().toLocaleLowerCase();
    return label.toLocaleLowerCase().includes(query);
  }) ?? [], [active?.pads, clipById, search]);
  const cancelDrag = useCallback(() => {
    pointer.current = null;
    activeDrag.current = null;
    armedPadId.current = null;
    setDrag(null);
  }, []);

  const cancelDragAndSelection = useCallback(() => {
    cancelDrag();
    setSelectedMovePadId(null);
  }, [cancelDrag]);

  const completeMove = (sourcePadId: string, targetPadId: string) => {
    if (sourcePadId === targetPadId) return;
    try {
      onChange(reorderPad(active.id, sourcePadId, targetPadId));
      setSelectedMovePadId(null);
    } catch (error) {
      Alert.alert('Could not reorder board', error instanceof Error ? error.message : 'The board order could not be saved.');
    }
  };

  const selectOrMove = (padId: string) => {
    if (!selectedMovePadId) {
      setSelectedMovePadId(padId);
      return;
    }
    if (selectedMovePadId === padId) {
      setSelectedMovePadId(null);
      return;
    }
    completeMove(selectedMovePadId, padId);
  };

  const updateDrag = (sourcePadId: string, pageX: number, pageY: number) => {
    const box = viewport.current;
    pointer.current = { x: pageX, y: pageY };
    const index = gridIndexAtPoint({ x: pageX - box.x, y: pageY - box.y }, {
      width: box.width, scrollOffset: scroll.current.offset, itemCount: gridItemCountWithQuickAdd(visiblePads.length),
      columns: layout.columns, gap: layout.gap, padding: 0, itemHeight: tileHeight,
    });
    const padIndex = gridIndexToPadIndex(index);
    const targetPadId = padIndex === null ? sourcePadId : visiblePads[padIndex]?.id ?? sourcePadId;
    const current = activeDrag.current;
    if (current?.sourcePadId !== sourcePadId) return;
    activeDrag.current = { sourcePadId, targetPadId };
    setDrag(activeDrag.current);
  };

  const gripIndexAtPoint = (x: number, y: number): number | null => {
    const box = viewport.current;
    const localX = x - box.x;
    const localY = y - box.y + scroll.current.offset;
    const rowPitch = tileHeight + layout.gap;
    const columnPitch = layout.tileWidth + layout.gap;
    if (localX < 0 || localY < 0 || rowPitch <= 0 || columnPitch <= 0) return null;
    const column = Math.floor(localX / columnPitch);
    const row = Math.floor(localY / rowPitch);
    const insideX = localX - column * columnPitch;
    const insideY = localY - row * rowPitch;
    if (column >= layout.columns || insideX > layout.tileWidth || insideY > tileHeight) return null;
    // Keep hit testing equal to the visible 48 × 48 dp edit grip.
    if (insideX < layout.tileWidth - 48 || insideY < tileHeight - 48) return null;
    const index = row * layout.columns + column;
    const padIndex = gridIndexToPadIndex(index);
    return padIndex !== null && padIndex < visiblePads.length ? padIndex : null;
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) => {
      if (!editing) return false;
      const index = gripIndexAtPoint(event.nativeEvent.pageX, event.nativeEvent.pageY);
      const pad = index === null ? undefined : visiblePads[index];
      if (!pad) return false;
      armedPadId.current = pad.id;
      return true;
    },
    onMoveShouldSetPanResponderCapture: () => editing && armedPadId.current !== null,
    onPanResponderGrant: () => {
      const sourcePadId = armedPadId.current;
      if (!sourcePadId) return;
      moved.current = false;
      activeDrag.current = { sourcePadId, targetPadId: sourcePadId };
      setSelectedMovePadId(sourcePadId);
      setDrag(activeDrag.current);
    },
    onPanResponderMove: (_event, gesture) => {
      const sourcePadId = armedPadId.current;
      if (!sourcePadId) return;
      if (Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5) moved.current = true;
      if (moved.current) updateDrag(sourcePadId, gesture.moveX, gesture.moveY);
    },
    onPanResponderRelease: () => {
      const sourcePadId = armedPadId.current;
      if (sourcePadId) {
        const targetPadId = activeDrag.current?.targetPadId ?? sourcePadId;
        cancelDrag();
        if (moved.current && targetPadId !== sourcePadId) completeMove(sourcePadId, targetPadId);
        else setSelectedMovePadId(sourcePadId);
      }
      armedPadId.current = null;
    },
    onPanResponderTerminate: () => {
      cancelDrag();
      setSelectedMovePadId(null);
    },
    onPanResponderTerminationRequest: () => false,
  }), [editing, visiblePads, layout.columns, layout.gap, layout.tileWidth, tileHeight]);

  const measureViewport = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setAvailableWidth((current) => Math.abs(current - width) > 0.5 ? width : current);
    viewportRef.current?.measureInWindow((x, y) => { viewport.current = { x, y, width, height }; });
  };

  useEffect(() => {
    if (!drag) return;
    const timer = setInterval(() => {
      const currentPointer = pointer.current;
      const box = viewport.current;
      if (!currentPointer || box.height <= 0) return;
      const step = edgeScrollStep(currentPointer.y - box.y, box.height);
      if (!step) return;
      const next = clampScrollOffset(scroll.current.offset + step, scroll.current.contentHeight, box.height);
      if (next === scroll.current.offset) return;
      scroll.current.offset = next;
      scrollRef.current?.scrollTo({ y: next, animated: false });
      const latest = activeDrag.current;
      if (latest) updateDrag(latest.sourcePadId, currentPointer.x, currentPointer.y);
    }, 50);
    return () => clearInterval(timer);
  }, [Boolean(drag), layout.columns, layout.gap, tileHeight, visiblePads]);

  useEffect(() => () => {
    pointer.current = null;
    activeDrag.current = null;
    armedPadId.current = null;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancelDragAndSelection();
    });
    return () => subscription.remove();
  }, [cancelDrag, cancelDragAndSelection]);

  if (!active.id) return null;

  function switchBoard(board: Board) {
    cancelDrag();
    setSelectedMovePadId(null);
    setEditing(false);
    onChange(selectBoard(board.id));
    setSelector(false);
  }

  function chooseQuickAction(action: QuickAction) {
    try {
      const current = loadPlayPreferences();
      setQuickAction(savePlayPreferences({ appearance: current.appearance, quickAction: action }).quickAction);
    } catch (error) {
      Alert.alert('Could not save Quick add preference', error instanceof Error ? error.message : 'Try again.');
    }
    setQuickAddOpen(false);
  }

  function runQuickAction() {
    if (quickAction === 'file') onCreate(active.id);
    else onOpenLibrary({ boardId: active.id });
  }

  function createBoard() {
    const name = boardName.trim().slice(0, 40);
    if (!name) return;
    try {
      persistBoard(name);
      onChange(loadBoards());
    } catch (error) {
      Alert.alert('Could not create board', error instanceof Error ? error.message : 'Try another board name.');
    }
    setBoardName(''); setNewBoard(false); setSelector(false);
  }

  const finishPadRename = () => {
    if (!selectedPad) return;
    const label = rename.trim().slice(0, 100);
    try { onChange(renamePad(selectedPad.boardId, selectedPad.pad.id, label || undefined)); }
    catch (error) { Alert.alert('Could not rename pad', error instanceof Error ? error.message : 'Try again.'); }
    setSelectedPad(null);
  };

  function openPad(pad: BoardPad) {
    const clip = pad.clipId ? clipById.get(pad.clipId) : undefined;
    if (clip && !clip.missing) onPlay(clip, pad.id);
    else onCreate(active.id, pad.id);
  }

  return <View style={styles.root}>
    <View style={styles.boardControls}>
      <Pressable onPress={() => setSelector(true)} accessibilityRole="button" accessibilityLabel={`Choose board, current board ${active.name}`} style={[styles.boardButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text numberOfLines={1} style={[styles.boardName, { color: theme.text }]}>{active.name}</Text><Text style={{ color: theme.focus, fontSize: 18 }}>▾</Text>
      </Pressable>
      <Pressable onPress={() => { if (editing) { cancelDrag(); setSelectedMovePadId(null); } else { Keyboard.dismiss(); } setEditing((value) => !value); }} accessibilityRole="button" accessibilityState={{ selected: editing }} accessibilityLabel={editing ? 'Done editing board' : 'Edit board'} style={[styles.editButton, { backgroundColor: editing ? theme.primary : theme.surface, borderColor: theme.border }]}>
        <Text accessible={false} style={[styles.editButtonLabel, { color: theme.text, opacity: editing ? 0 : 1 }]}>✎ Edit board</Text>
        {editing ? <View pointerEvents="none" style={styles.editButtonOverlay}><Text style={[styles.editButtonOverlayLabel, { color: '#fff' }]}>Done</Text></View> : null}
      </Pressable>
    </View>
    <TextInput value={search} onChangeText={setSearch} editable={!editing} placeholder="Search sounds" placeholderTextColor={theme.muted} accessibilityLabel="Search pads" returnKeyType="search" selectionColor={theme.focus}
      style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} />
    <View ref={viewportRef} collapsable={false} onLayout={measureViewport} {...pan.panHandlers} style={{ flex: 1 }}>
    <ScrollView ref={scrollRef} style={{ flex: 1 }} scrollEnabled={!drag} onScroll={(event) => { scroll.current.offset = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
      onContentSizeChange={(_width, height) => { scroll.current.contentHeight = height; }}
      contentContainerStyle={[styles.grid, { gap: layout.gap }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.tileWrap, { width: layout.tileWidth, height: tileHeight }]}>
        <Pressable onPress={runQuickAction} accessibilityRole="button"
          accessibilityLabel={`Quick add to ${active.name}, using ${quickAction === 'file' ? 'audio file' : 'Library'}`}
          style={({ pressed }) => [styles.tile, styles.emptyTile, { backgroundColor: theme.surface, borderColor: theme.focus, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={[styles.tileIcon, { color: theme.focus }]}>＋</Text>
          <Text numberOfLines={2} style={[styles.tileLabel, { color: theme.text }]}>Quick add</Text>
          <Text numberOfLines={1} style={[styles.padIdentity, { color: theme.muted }]}>Add a sound</Text>
        </Pressable>
        {editing ? <Pressable onPress={() => setQuickAddOpen(true)} accessibilityRole="button" accessibilityLabel="Choose Quick add action" style={styles.menuButton}>
          <View style={[styles.menuGlyph, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={{ color: theme.text, fontWeight: '800' }}>⌄</Text></View>
        </Pressable> : null}
      </View>
      {visiblePads.map((pad) => {
        const index = active.pads.findIndex((item) => item.id === pad.id);
        const clip = pad.clipId ? clipById.get(pad.clipId) : undefined;
        const padLabel = pad.label || clip?.title || `Pad ${index + 1}`;
        const color = pad.color || clip?.color || theme.primary;
        const icon = iconChoices.find((item) => item.id === clip?.icon)?.glyph ?? (clip ? '♫' : '＋');
        const artworkUri = clip?.artworkUri && !failedArtworkUris.has(clip.artworkUri) ? clip.artworkUri : undefined;
        const foreground = contrastForeground(color);
        const usableClip = Boolean(clip && !clip.missing);
        const isSelected = selectedMovePadId === pad.id;
        const isSource = drag?.sourcePadId === pad.id;
        const isTarget = drag?.targetPadId === pad.id;
        return <View key={pad.id} style={[styles.tileWrap, { width: layout.tileWidth, height: tileHeight }]}>
          <Pressable onPressIn={!editing && usableClip ? () => openPad(pad) : undefined}
            onPress={editing ? () => selectOrMove(pad.id) : usableClip ? undefined : () => openPad(pad)}
            accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={editing ? `${padLabel}${isSelected ? ', selected to move' : ''}. Tap to choose a move destination.` : clip ? `Play ${padLabel}` : `Add sound to ${padLabel}`}
            style={({ pressed }) => [styles.tile, { backgroundColor: color, opacity: pressed ? 0.8 : 1 }, !clip && [styles.emptyTile, { borderColor: theme.border }], isSource && { opacity: 0.62 }]}>
            {artworkUri ? <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image source={{ uri: artworkUri }} onError={() => setFailedArtworkUris((current) => new Set(current).add(artworkUri))} resizeMode="cover" style={StyleSheet.absoluteFill} /></View> : null}
            {!artworkUri ? <Text style={[styles.tileIcon, { color: foreground }, !clip && { color: theme.muted }]}>{icon}</Text> : null}
            <Text numberOfLines={2} style={[styles.tileLabel, { color: artworkUri ? '#ffffff' : foreground }, !clip && { color: theme.muted }, artworkUri && styles.artworkLabel]}>{padLabel}</Text>
            {editing && (isSelected || isTarget) ? <View pointerEvents="none" style={[styles.tileHighlight, { borderColor: theme.focus }]} /> : null}
          </Pressable>
          {editing ? <Pressable onPress={() => {
            setSelectedPad({ boardId: active.id, pad }); setRename(pad.label ?? clip?.title ?? ''); setRenameOpen(false);
          }} accessibilityRole="button" accessibilityLabel={`Options for ${padLabel}`} style={styles.menuButton}>
            <View style={[styles.menuGlyph, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={{ color: theme.text, fontWeight: '800' }}>···</Text></View>
          </Pressable> : null}
          {editing ? <View accessibilityRole="button" accessibilityLabel={`Drag grip for ${padLabel}. Tap the pad and a destination to move without dragging.`}
            accessibilityState={{ selected: isSelected }} onAccessibilityTap={() => setSelectedMovePadId(pad.id)} style={styles.dragGrip}>
            <Text allowFontScaling={false} style={[styles.dragGripGlyph, { color: clip ? foreground : theme.muted }]}>⠿</Text>
          </View> : null}
        </View>;
      })}
    </ScrollView>
    </View>

    <Modal visible={quickAddOpen} transparent animationType="none" onRequestClose={() => setQuickAddOpen(false)}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.sheet}>
        <Heading title="Quick add" subtitle="Choose what Quick add opens next time." theme={theme}
          trailing={<Pressable onPress={() => setQuickAddOpen(false)} accessibilityRole="button" accessibilityLabel="Close quick add"><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable>} />
        <ActionButton label={`Use audio file${quickAction === 'file' ? ' · Default' : ''}`} icon="♫" onPress={() => chooseQuickAction('file')} theme={theme} variant={quickAction === 'file' ? 'primary' : 'secondary'} />
        <ActionButton label={`Use Library${quickAction === 'library' ? ' · Default' : ''}`} icon="▤" onPress={() => chooseQuickAction('library')} theme={theme} variant={quickAction === 'library' ? 'primary' : 'secondary'} />
      </Panel></View>
    </Modal>

    <Modal visible={selector} transparent animationType="fade" onRequestClose={() => setSelector(false)}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.sheet}>
        <Heading title="Boards" theme={theme} trailing={<Pressable onPress={() => setSelector(false)} accessibilityRole="button" accessibilityLabel="Close boards"><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable>} />
        <ScrollView style={{ maxHeight: 360 }}>
          {collection.boards.map((board) => <Pressable key={board.id} onPress={() => switchBoard(board)} style={[styles.listItem, { borderBottomColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: board.id === active.id ? '800' : '600' }}>{board.name}</Text><Text style={{ color: theme.muted }}>{board.id === active.id ? '✓' : `${board.pads.filter((pad) => pad.clipId).length} sounds`}</Text>
          </Pressable>)}
        </ScrollView>
        <ActionButton label="Stop playback" icon="■" onPress={() => { stop(); setSelector(false); }} theme={theme} />
        {onAppearance ? <ActionButton label="Appearance" icon="Aa" onPress={() => { setSelector(false); onAppearance(); }} theme={theme} /> : null}
        {newBoard ? <><TextInput value={boardName} onChangeText={setBoardName} placeholder="Board name" placeholderTextColor={theme.muted} maxLength={40} autoFocus selectionColor={theme.focus} style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.raised }]} />
          <View style={styles.actions}><ActionButton label="Create board" onPress={createBoard} theme={theme} variant="primary" disabled={!boardName.trim()} /><ActionButton label="Cancel" onPress={() => { setNewBoard(false); setBoardName(''); }} theme={theme} /></View></>
          : <ActionButton label="New board" icon="＋" onPress={() => setNewBoard(true)} theme={theme} variant="primary" />}
      </Panel></View>
    </Modal>

    <Modal visible={Boolean(selectedPad)} transparent animationType="fade" onRequestClose={() => setSelectedPad(null)}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.sheet}>
        <Heading title="Pad options" subtitle={selectedPad ? `Board ${selectedPad.boardId === active.id ? '· ' + active.name : ''}` : undefined} theme={theme}
          trailing={<Pressable onPress={() => setSelectedPad(null)} accessibilityRole="button" accessibilityLabel="Close pad options"><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable>} />
        {selectedPad ? <View style={styles.optionStack}>
          <ActionButton label={selectedPad.pad.clipId ? 'Replace sound' : 'Choose sound'} icon="♫" onPress={() => { const target = selectedPad; setSelectedPad(null); onCreate(target.boardId, target.pad.id); }} theme={theme} variant="primary" />
          <ActionButton label="Choose from Library" icon="▤" onPress={() => { const target = selectedPad; setSelectedPad(null); onOpenLibrary({ boardId: target.boardId, padId: target.pad.id }); }} theme={theme} />
          <ActionButton label="Rename pad" onPress={() => setRenameOpen(true)} theme={theme} />
          {selectedPad.pad.clipId ? <ActionButton label="Clear pad" variant="danger" onPress={() => {
            const boardId = selectedPad.boardId, padId = selectedPad.pad.id;
            Alert.alert('Clear this pad?', 'The sound will stay in your Library.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear pad', style: 'destructive', onPress: () => {
                try { onChange(clearPad(boardId, padId)); } catch (error) { Alert.alert('Could not clear pad', error instanceof Error ? error.message : 'Try again.'); }
                setSelectedPad(null);
              } },
            ]);
          }} theme={theme} /> : null}
          {renameOpen ? <>
            <TextInput value={rename} onChangeText={setRename} placeholder="Pad label" placeholderTextColor={theme.muted} maxLength={100} selectionColor={theme.focus} style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.raised }]} />
            <ActionButton label="Save label" onPress={() => { finishPadRename(); setRenameOpen(false); }} theme={theme} variant="primary" />
          </> : null}
          {selectedPad.pad.label ? <ActionButton label="Use clip name" onPress={() => { try { onChange(renamePad(selectedPad.boardId, selectedPad.pad.id, undefined)); } catch (error) { Alert.alert('Could not update pad', error instanceof Error ? error.message : 'Try again.'); } setSelectedPad(null); }} theme={theme} variant="quiet" /> : null}
        </View> : null}
      </Panel></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 12 }, boardControls: { flexDirection: 'row', alignItems: 'center', gap: 10 }, actions: { flexDirection: 'row', gap: 10 },
  boardButton: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  boardName: { flex: 1, fontSize: 16, fontWeight: '800' }, editButton: { minHeight: 48, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  editButtonLabel: { fontSize: 14, fontWeight: '800' }, editButtonOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }, editButtonOverlayLabel: { textAlign: 'center', fontSize: 14, fontWeight: '800' },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', paddingBottom: 24 },
  tileWrap: { position: 'relative' }, tile: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 7, alignItems: 'center', justifyContent: 'center', gap: 3, overflow: 'hidden' }, emptyTile: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  tileIcon: { fontSize: 23, color: '#ffffff', fontWeight: '800' }, tileLabel: { color: '#ffffff', fontSize: 12, fontWeight: '800', lineHeight: 16, textAlign: 'center' }, artworkLabel: { overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2 }, padIdentity: { fontSize: 11, textAlign: 'center' },
  menuButton: { position: 'absolute', top: 0, right: 0, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dragGrip: { position: 'absolute', right: 0, bottom: 0, width: 48, height: 48 }, dragGripGlyph: { position: 'absolute', right: 2, bottom: 2, width: 20, height: 20, textAlign: 'center', textAlignVertical: 'center', fontWeight: '900', fontSize: 18, lineHeight: 20 },
  tileHighlight: { ...StyleSheet.absoluteFill, borderWidth: 3, borderRadius: 16 },
  menuGlyph: { width: 24, height: 24, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }, sheet: { width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center', gap: 16 }, listItem: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, nameInput: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 }, optionStack: { gap: 10 },
});
