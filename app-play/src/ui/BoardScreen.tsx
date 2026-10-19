import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, Keyboard, Modal, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stop } from '../../../app-client/src/audio/engine';
import { clearPad, createBoard as persistBoard, loadBoards, movePad, renamePad, reorderPad, selectBoard, type Board, type BoardCollection, type BoardPad } from '../data/boards';
import type { LocalClip } from '../data/library';
import { loadPlayPreferences, savePlayPreferences, type QuickAction } from '../data/preferences';
import { ActionButton, Heading, Panel } from './controls';
import { Icon } from './Icons';
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
  onCreate: (boardId: string, padId?: string, initialAction?: 'file' | 'record') => void;
  onAddClip: () => void;
  onOpenLibrary: (target?: { boardId: string; padId?: string }) => void;
  onAppearance?: () => void;
  newBoardRequest?: number;
};

type PopupKind = 'boards' | 'quick' | 'pad' | 'replace' | 'move';
type PopupRect = { x: number; y: number; width: number; height: number };
type PopupState = { kind: PopupKind; rect: PopupRect; pad?: { boardId: string; pad: BoardPad } };

function blendTowardWhite(hex: string, amount: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '8B5CF6';
  const channels = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  return `#${channels.map((channel) => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export function BoardScreen({ theme, collection, clips, onChange, onPlay, onCreate, onAddClip, onOpenLibrary, onAppearance, newBoardRequest }: Props) {
  const [editing, setEditing] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [selectedPad, setSelectedPad] = useState<{ boardId: string; pad: BoardPad } | null>(null);
  const [rename, setRename] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [search, setSearch] = useState('');
  const [availableWidth, setAvailableWidth] = useState(0);
  const [drag, setDrag] = useState<{ sourcePadId: string; targetPadId: string } | null>(null);
  const [selectedMovePadId, setSelectedMovePadId] = useState<string | null>(null);
  const [failedArtworkUris, setFailedArtworkUris] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const selectorAnchor = useRef<View>(null);
  const quickAnchor = useRef<View>(null);
  const padAnchors = useRef(new Map<string, View>());
  const viewport = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scroll = useRef({ offset: 0, contentHeight: 0 });
  const activeDrag = useRef<{ sourcePadId: string; targetPadId: string } | null>(null);
  const armedPadId = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const lastNewBoardRequest = useRef(newBoardRequest ?? 0);
  const [quickAction, setQuickAction] = useState<QuickAction>(() => {
    try { return loadPlayPreferences().quickAction; } catch { return 'file'; }
  });
  const { fontScale, width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = calculateBoardGrid(availableWidth, fontScale, 8, PixelRatio.get());
  const tileHeight = calculateBoardTileHeight(layout.tileWidth, fontScale);
  const basePopupWidth = popup?.kind === 'boards' ? Math.max(210, Math.min(238, popup.rect.width)) : popup?.kind === 'quick' ? 204 : 176;
  const popupScale = fontScale > 1.2 && (popup?.kind === 'quick' || popup?.kind === 'pad') ? Math.min(fontScale, 1.5) : 1;
  const popupWidth = Math.min(basePopupWidth * popupScale, Math.max(0, windowWidth - insets.left - insets.right - 20));
  const popupMaxHeight = Math.max(180, Math.min(420, windowHeight - insets.top - insets.bottom - 24));
  const popupEstimatedHeight = popup?.kind === 'boards' ? Math.min(44 * (collection.boards.length + 3), popupMaxHeight)
    : popup?.kind === 'pad' ? 44 * 4 : popup?.kind === 'move' ? Math.min(44 * Math.max(1, collection.boards.length - 1), popupMaxHeight)
      : popup?.kind === 'replace' ? 44 * 2 : 44 * 3;
  const popupLeft = popup ? Math.min(Math.max(insets.left + 10, popup.rect.x), windowWidth - insets.right - popupWidth - 10) : 0;
  const popupBelow = popup ? popup.rect.y + popup.rect.height + 6 : 0;
  const popupTop = popup ? (popupBelow + popupEstimatedHeight <= windowHeight - insets.bottom - 10 ? popupBelow : Math.max(insets.top + 10, popup.rect.y - popupEstimatedHeight - 6)) : 0;
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

  function openPopupFromRef(kind: PopupKind, anchor: View | null, pad?: { boardId: string; pad: BoardPad }) {
    if (!anchor) return;
    anchor.measureInWindow((x, y, width, height) => {
      if (pad) setSelectedPad(pad);
      const rect = kind === 'quick' || kind === 'pad' ? { x, y: y + 24, width, height: 0 } : { x, y, width, height };
      setPopup({ kind, rect, ...(pad ? { pad } : {}) });
    });
  }

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
      // Use the snapped width rendered by each tile so drag destinations share
      // the same column pitch as the visible grid.
      width: layout.tileWidth * layout.columns + layout.gap * (layout.columns - 1),
      scrollOffset: scroll.current.offset, itemCount: gridItemCountWithQuickAdd(visiblePads.length),
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

  useEffect(() => {
    if (newBoardRequest === undefined || newBoardRequest === lastNewBoardRequest.current) return;
    lastNewBoardRequest.current = newBoardRequest;
    setPopup(null);
    setBoardName('');
    setNewBoard(true);
  }, [newBoardRequest]);

  if (!active.id) return null;

  function switchBoard(board: Board) {
    cancelDrag();
    setSelectedMovePadId(null);
    setEditing(false);
    onChange(selectBoard(board.id));
    setPopup(null);
  }

  function chooseQuickAction(action: QuickAction) {
    try {
      const current = loadPlayPreferences();
      setQuickAction(savePlayPreferences({ appearance: current.appearance, quickAction: action }).quickAction);
    } catch (error) {
      Alert.alert('Could not save Quick add preference', error instanceof Error ? error.message : 'Try again.');
    }
    setPopup(null);
  }

  function runQuickAction() {
    if (quickAction === 'file' || quickAction === 'record') onCreate(active.id, undefined, quickAction);
    else onOpenLibrary({ boardId: active.id });
  }

  function moveSelectedPad(board: Board) {
    if (!selectedPad) return;
    try {
      onChange(movePad(selectedPad.boardId, selectedPad.pad.id, board.id));
      onChange(selectBoard(board.id));
    } catch (error) {
      Alert.alert('Could not move sound', error instanceof Error ? error.message : 'Try another board.');
      return;
    }
    setPopup(null);
    setSelectedPad(null);
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
    setBoardName(''); setNewBoard(false); setPopup(null);
  }

  const finishPadRename = () => {
    if (!selectedPad) return;
    const label = rename.trim().slice(0, 100);
    try { onChange(renamePad(selectedPad.boardId, selectedPad.pad.id, label || undefined)); }
    catch (error) { Alert.alert('Could not rename pad', error instanceof Error ? error.message : 'Try again.'); }
    setSelectedPad(null);
    setRenameOpen(false);
  };

  function openPad(pad: BoardPad) {
    const clip = pad.clipId ? clipById.get(pad.clipId) : undefined;
    if (clip && !clip.missing) onPlay(clip, pad.id);
    else onCreate(active.id, pad.id);
  }

  function popupRow(label: string, icon: 'controller' | 'check' | 'file' | 'mic' | 'library' | 'plus' | 'spark' | 'stop' | 'more' | 'pencil' | 'music' | 'close', onPress: () => void, disabled = false, selected = false) {
    return <Pressable key={label} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [styles.popupRow, { backgroundColor: selected ? theme.raised : pressed ? theme.surface : 'transparent', opacity: disabled ? 0.45 : 1 }]}>
      <Icon name={icon} size={17} color={selected ? theme.accent : theme.text} cutColor={theme.surfaceAlt} />
      <Text numberOfLines={1} style={[styles.popupLabel, { color: selected ? theme.accent : theme.text }]}>{label}</Text>
      {selected ? <Icon name="check" size={16} color={theme.accent} /> : null}
    </Pressable>;
  }

  return <View style={styles.root}>
    <View style={styles.boardControls}>
      <Pressable ref={selectorAnchor} onPress={() => openPopupFromRef('boards', selectorAnchor.current)} accessibilityRole="button" accessibilityLabel={`Choose board, current board ${active.name}`} style={[styles.boardButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
        <Icon name="controller" size={25} color={theme.accent} cutColor={theme.background} />
        <Text numberOfLines={1} style={[styles.boardName, { color: theme.text }]}>{active.name}</Text><Icon name="chevron" size={18} color={theme.accent} />
      </Pressable>
      <Pressable onPress={() => { if (editing) { cancelDrag(); setSelectedMovePadId(null); } else { Keyboard.dismiss(); setSearch(''); setPopup(null); } setEditing((value) => !value); }} accessibilityRole="button" accessibilityState={{ selected: editing }} accessibilityLabel={editing ? 'Done editing board' : 'Edit board'} style={[styles.editButton, { backgroundColor: 'transparent', borderColor: theme.accent }]}>
        <Icon name="pencil" size={17} color={theme.accent} />
        <Text accessible={false} style={[styles.editButtonLabel, { color: theme.accent }]}>{editing ? 'Done editing' : 'Edit board'}</Text>
      </Pressable>
    </View>
    <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Icon name="search" size={21} color={theme.muted} />
      <TextInput value={search} onChangeText={setSearch} editable={!editing} placeholder="Search soundbites…" placeholderTextColor={theme.muted} accessibilityLabel="Search pads" returnKeyType="search" selectionColor={theme.focus}
        style={[styles.searchInput, { color: theme.text }]} />
    </View>
    <View ref={viewportRef} collapsable={false} onLayout={measureViewport} {...pan.panHandlers} style={{ flex: 1 }}>
    <ScrollView ref={scrollRef} style={{ flex: 1 }} scrollEnabled={!drag} onScroll={(event) => { scroll.current.offset = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
      onContentSizeChange={(_width, height) => { scroll.current.contentHeight = height; }}
      contentContainerStyle={[styles.grid, { gap: layout.gap }]} keyboardShouldPersistTaps="handled">
      <View ref={quickAnchor} style={[styles.tileWrap, { width: layout.tileWidth, height: tileHeight }]}>
        <Pressable onPress={runQuickAction} accessibilityRole="button"
          accessibilityLabel={`Quick add to ${active.name}, using ${quickAction === 'record' ? 'recording' : quickAction === 'file' ? 'audio file' : 'Library'}`}
          style={({ pressed }) => [styles.tile, styles.quickTile, { backgroundColor: theme.surface, borderColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
          <Icon name="plus" size={34} color={theme.accent} />
          <Text numberOfLines={2} style={[styles.tileLabel, { color: theme.text }]}>Quick add</Text>
          <Text numberOfLines={2} style={[styles.padIdentity, { color: theme.muted }]}>{quickAction === 'record' ? 'Record sound' : quickAction === 'file' ? 'Choose file' : 'Open library'}</Text>
        </Pressable>
        {editing ? <Pressable onPress={() => openPopupFromRef('quick', quickAnchor.current)} accessibilityRole="button" accessibilityLabel="Choose Quick add action" style={[styles.quickMenuButton, { backgroundColor: theme.accent }]}>
          <Icon name="chevron" size={16} color="#fff" />
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
        return <View key={pad.id} ref={(node) => { if (node) padAnchors.current.set(pad.id, node); else padAnchors.current.delete(pad.id); }} style={[styles.tileWrap, { width: layout.tileWidth, height: tileHeight }]}>
          <Pressable onPressIn={!editing && usableClip ? () => openPad(pad) : undefined}
            onPress={editing ? () => selectOrMove(pad.id) : usableClip ? undefined : () => openPad(pad)}
            accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={editing ? `${padLabel}${isSelected ? ', selected to move' : ''}. Tap to choose a move destination.` : clip ? `Play ${padLabel}` : `Add sound to ${padLabel}`}
            style={({ pressed }) => [styles.tile, {
              backgroundColor: pad.clipId !== null ? color : theme.surface,
              borderColor: pad.clipId !== null ? 'transparent' : theme.border,
              borderWidth: pad.clipId !== null ? 0 : 1.5,
              experimental_backgroundImage: pad.clipId ? `linear-gradient(155deg, ${blendTowardWhite(color, 0.2)}, ${color})` : undefined,
              opacity: pressed ? 0.8 : 1,
            }, pad.clipId === null && styles.emptyTile, isSource && { opacity: 0.62 }]}>
            {artworkUri ? <Image source={{ uri: artworkUri }} onError={() => setFailedArtworkUris((current) => new Set(current).add(artworkUri))} resizeMode="contain" style={styles.padArtwork} />
              : <View style={styles.padIconArea}><Text allowFontScaling={false} style={[styles.tileIcon, { color: foreground }, !clip && { color: theme.muted }]}>{icon}</Text></View>}
            <View style={styles.padFooter}><Text numberOfLines={2} style={[styles.tileLabel, { color: foreground }, !clip && { color: theme.muted }]}>{padLabel}</Text></View>
            {editing && (isSelected || isTarget) ? <View pointerEvents="none" style={[styles.tileHighlight, { borderColor: theme.focus }]} /> : null}
          </Pressable>
          {pad.clipId ? <Pressable onPress={() => {
            setRename(pad.label ?? clip?.title ?? ''); setRenameOpen(false);
            openPopupFromRef('pad', padAnchors.current.get(pad.id) ?? null, { boardId: active.id, pad });
          }} accessibilityRole="button" accessibilityLabel={`Options for ${padLabel}`} style={styles.menuButton}>
            <View pointerEvents="none" style={styles.moreGlyphPosition}><Icon name="more" size={19} color={foreground} /></View>
          </Pressable> : null}
          {editing ? <View accessibilityRole="button" accessibilityLabel={`Drag grip for ${padLabel}. Tap the pad and a destination to move without dragging.`}
            accessibilityState={{ selected: isSelected }} onAccessibilityTap={() => setSelectedMovePadId(pad.id)} style={styles.dragGrip}>
            <Text allowFontScaling={false} style={[styles.dragGripGlyph, { color: clip ? foreground : theme.muted }]}>⠿</Text>
          </View> : null}
        </View>;
      })}
    </ScrollView>
    </View>

    <Modal visible={Boolean(popup)} transparent animationType="none" statusBarTranslucent onRequestClose={() => { setPopup(null); setSelectedPad(null); }}>
      <View style={styles.popupRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { setPopup(null); setSelectedPad(null); }} accessibilityRole="button" accessibilityLabel="Close menu" />
        {popup ? <View style={[styles.popup, { left: popupLeft, top: popupTop, width: popupWidth, maxHeight: popupMaxHeight, backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ScrollView style={{ maxHeight: popupMaxHeight - 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {popup.kind === 'boards' ? <>
              {collection.boards.map((board) => popupRow(board.name, 'controller', () => switchBoard(board), false, board.id === active.id))}
              <View style={[styles.popupDivider, { backgroundColor: theme.border }]} />
              {popupRow('Create new board', 'plus', () => { setPopup(null); setNewBoard(true); setBoardName(''); })}
              {onAppearance ? popupRow('Appearance', 'spark', () => { setPopup(null); onAppearance(); }) : null}
              {popupRow('Stop playback', 'stop', () => { stop(); setPopup(null); })}
            </> : null}
            {popup.kind === 'quick' ? <>
              {popupRow('Record new sound', 'mic', () => chooseQuickAction('record'), false, quickAction === 'record')}
              {popupRow('Choose local file', 'file', () => chooseQuickAction('file'), false, quickAction === 'file')}
              {popupRow('Open library', 'library', () => chooseQuickAction('library'), false, quickAction === 'library')}
            </> : null}
            {popup.kind === 'pad' ? <>
              {popupRow('Replace sound', 'music', () => setPopup({ ...popup, kind: 'replace' }), !popup.pad?.pad.clipId)}
              {popupRow('Rename', 'pencil', () => {
                if (!popup.pad) return;
                const clip = popup.pad.pad.clipId ? clipById.get(popup.pad.pad.clipId) : undefined;
                setSelectedPad(popup.pad); setRename(popup.pad.pad.label ?? clip?.title ?? ''); setRenameOpen(true); setPopup(null);
              })}
              {popupRow('Move to board', 'controller', () => setPopup({ ...popup, kind: 'move' }), !popup.pad?.pad.clipId || collection.boards.length < 2)}
              {popupRow('Clear pad', 'close', () => {
                const target = popup.pad;
                if (!target?.pad.clipId) return;
                setPopup(null);
                Alert.alert('Clear this pad?', 'The sound will stay in your Library.', [
                  { text: 'Cancel', style: 'cancel', onPress: () => setSelectedPad(null) },
                  { text: 'Clear pad', style: 'destructive', onPress: () => {
                    try { onChange(clearPad(target.boardId, target.pad.id)); } catch (error) { Alert.alert('Could not clear pad', error instanceof Error ? error.message : 'Try again.'); }
                    setSelectedPad(null);
                  } },
                ]);
              }, !popup.pad?.pad.clipId)}
            </> : null}
            {popup.kind === 'replace' && popup.pad ? <>
              {popupRow('Choose local file', 'file', () => { const target = popup.pad!; setPopup(null); setSelectedPad(null); onCreate(target.boardId, target.pad.id, 'file'); })}
              {popupRow('Open library', 'library', () => { const target = popup.pad!; setPopup(null); setSelectedPad(null); onOpenLibrary({ boardId: target.boardId, padId: target.pad.id }); })}
            </> : null}
            {popup.kind === 'move' && popup.pad ? collection.boards.filter((board) => board.id !== popup.pad?.boardId).map((board) => popupRow(board.name, 'controller', () => moveSelectedPad(board))): null}
          </ScrollView>
        </View> : null}
      </View>
    </Modal>

    <Modal visible={newBoard || renameOpen} transparent animationType="fade" onRequestClose={() => { setNewBoard(false); setRenameOpen(false); setSelectedPad(null); }}>
      <View style={styles.dialogScrim}><Panel theme={theme} style={styles.dialog}>
        <Heading title={newBoard ? 'Create board' : 'Rename pad'} theme={theme} />
        <TextInput value={newBoard ? boardName : rename} onChangeText={newBoard ? setBoardName : setRename} placeholder={newBoard ? 'Board name' : 'Pad name'} placeholderTextColor={theme.muted} maxLength={newBoard ? 40 : 100} autoFocus selectionColor={theme.focus} style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.raised }]} />
        {!newBoard && selectedPad?.pad.label ? <ActionButton label="Use sound name" onPress={() => {
          try { onChange(renamePad(selectedPad.boardId, selectedPad.pad.id, undefined)); }
          catch (error) { Alert.alert('Could not update pad', error instanceof Error ? error.message : 'Try again.'); }
          setRenameOpen(false); setSelectedPad(null);
        }} theme={theme} variant="quiet" /> : null}
        <View style={styles.actions}>
          <ActionButton label="Cancel" onPress={() => { setNewBoard(false); setRenameOpen(false); setSelectedPad(null); }} theme={theme} />
          <ActionButton label={newBoard ? 'Create board' : 'Save name'} onPress={() => { if (newBoard) createBoard(); else { finishPadRename(); } }} theme={theme} variant="primary" disabled={!(newBoard ? boardName : rename).trim()} />
        </View>
      </Panel></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 12 }, boardControls: { flexDirection: 'row', alignItems: 'center', gap: 10 }, actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  boardButton: { flex: 1, minWidth: 0, height: 49, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, alignItems: 'center' },
  boardName: { flex: 1, fontSize: 14, fontWeight: '700' }, editButton: { width: 138, height: 49, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  editButtonLabel: { fontSize: 13, fontWeight: '700' },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchInput: { flex: 1, minWidth: 0, padding: 0, fontSize: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', paddingBottom: 24 },
  tileWrap: { position: 'relative' }, tile: { flex: 1, position: 'relative', borderRadius: 14, borderWidth: 0, padding: 4, alignItems: 'center', overflow: 'hidden' }, quickTile: { justifyContent: 'center', gap: 2, borderWidth: 1.5, borderStyle: 'dashed' }, emptyTile: { borderStyle: 'dashed' },
  padArtwork: { flex: 1, width: '100%', marginTop: 2 }, padIconArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }, padFooter: { width: '100%', minHeight: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tileIcon: { fontSize: 28, color: '#ffffff', fontWeight: '800' }, tileLabel: { color: '#ffffff', fontSize: 11.5, fontWeight: '800', lineHeight: 14, textAlign: 'center' }, padIdentity: { fontSize: 10.5, lineHeight: 13, textAlign: 'center' },
  menuButton: { position: 'absolute', top: 0, right: 0, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }, moreGlyphPosition: { position: 'absolute', top: 3, right: 5 },
  quickMenuButton: { position: 'absolute', right: 4, bottom: 4, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dragGrip: { position: 'absolute', right: 0, bottom: 0, width: 48, height: 48 }, dragGripGlyph: { position: 'absolute', right: 2, bottom: 2, width: 20, height: 20, textAlign: 'center', textAlignVertical: 'center', fontWeight: '900', fontSize: 18, lineHeight: 20 },
  tileHighlight: { ...StyleSheet.absoluteFill, borderWidth: 3, borderRadius: 14 },
  popupRoot: { flex: 1 }, popup: { position: 'absolute', borderWidth: 1, borderRadius: 14, paddingVertical: 4, overflow: 'hidden', elevation: 14, shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  popupRow: { minHeight: 44, height: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, popupLabel: { flex: 1, fontSize: 12, fontWeight: '600' }, popupDivider: { height: StyleSheet.hairlineWidth, marginVertical: 3, marginHorizontal: 10 },
  dialogScrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.58)' }, dialog: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: 16 },
  nameInput: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
});
