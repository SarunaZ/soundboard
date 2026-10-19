import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { BoardCollection } from '../data/boards';
import type { LocalClip } from '../data/library';
import { ActionButton, Panel } from './controls';
import { Icon, LibraryIcon } from './Icons';
import { iconChoices, type Theme } from './theme';
import { contrastForeground } from './contrast';
import { formatTime } from './Waveform';
import { ArtworkPicker, pickGalleryArtwork } from './ArtworkPicker';
import type { DraftArtwork } from '../media/artwork';

type SortMode = 'az' | 'newest' | 'duration';
const sortLabels: Record<SortMode, string> = { az: 'A–Z', newest: 'Newest', duration: 'Duration' };

function mixHex(foreground: string, background: string, foregroundWeight: number): string {
  const foregroundRgb = foreground.match(/^#([0-9a-f]{6})$/i)?.[1];
  const backgroundRgb = background.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!foregroundRgb || !backgroundRgb) return background;
  const channels = [0, 2, 4].map((offset) => {
    const front = parseInt(foregroundRgb.slice(offset, offset + 2), 16);
    const back = parseInt(backgroundRgb.slice(offset, offset + 2), 16);
    return Math.round(back + (front - back) * foregroundWeight).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export function LibraryScreen({ theme, clips, boards, assignmentTarget = null, onPlay, onCreate, onRename, onDelete, onChangeArtwork, onAddToBoard, onAssignToTarget }: {
  theme: Theme; clips: LocalClip[]; boards: BoardCollection; onPlay: (clip: LocalClip) => void;
  onCreate: (initialAction?: 'file') => void; onAppearance?: () => void; onRename: (clip: LocalClip, title: string) => void; onDelete: (clip: LocalClip) => void;
  onChangeArtwork?: (clip: LocalClip, artwork: DraftArtwork) => void;
  onAddToBoard: (clip: LocalClip, boardId: string, padId?: string) => void;
  assignmentTarget?: { boardId: string; padId?: string; expectedClipId?: string | null } | null; onAssignToTarget?: (clip: LocalClip, target: { boardId: string; padId?: string; expectedClipId?: string | null }) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LocalClip | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [choosingBoard, setChoosingBoard] = useState(false);
  const [sort, setSort] = useState<SortMode>('newest');
  const [sortMenu, setSortMenu] = useState(false);
  const [artworkTarget, setArtworkTarget] = useState<LocalClip | null>(null);
  const [artworkSourceMenu, setArtworkSourceMenu] = useState(false);
  const [memePickerOpen, setMemePickerOpen] = useState(false);
  const [clipMenu, setClipMenu] = useState<{ clip: LocalClip; left: number; top: number; width: number } | null>(null);
  const menuButtonRefs = useRef(new Map<string, View>());
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const [failedArtworkUris, setFailedArtworkUris] = useState<Set<string>>(() => new Set());
  const filtered = useMemo(() => clips
    .filter((clip) => clip.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title) : sort === 'duration' ? a.durationMs - b.durationMs || a.title.localeCompare(b.title) : a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })), [clips, query, sort]);

  function showActions(clip: LocalClip) {
    const button = menuButtonRefs.current.get(clip.id);
    if (!button) return;
    button.measureInWindow((x, y, width, height) => {
      const menuWidth = Math.max(1, Math.min(176 * Math.min(fontScale, 1.5), windowWidth - 24));
      const menuRows = 4 + Number(Boolean(onChangeArtwork)) + Number(Boolean(assignmentTarget && onAssignToTarget));
      const menuHeight = menuRows * 40 + 8;
      const left = Math.max(12, Math.min(x + width - menuWidth, windowWidth - menuWidth - 12));
      const below = y + height + 4;
      const top = below + menuHeight <= windowHeight - 16 ? below : Math.max(12, y - menuHeight - 4);
      setClipMenu({ clip, left, top, width: menuWidth });
    });
  }
  function dismissClipMenu() { setClipMenu(null); }
  function chooseMenuAction(action: 'play' | 'rename' | 'artwork' | 'board' | 'delete' | 'target') {
    const clip = clipMenu?.clip;
    setClipMenu(null);
    if (!clip) return;
    if (action === 'play') { if (!clip.missing) onPlay(clip); return; }
    if (action === 'rename') { setSelected(clip); setTitle(clip.title); setEditing(true); return; }
    if (action === 'artwork' && onChangeArtwork) { setArtworkTarget(clip); setArtworkSourceMenu(true); return; }
    if (action === 'board') { setSelected(clip); setChoosingBoard(true); return; }
    if (action === 'target' && onAssignToTarget) { onAssignToTarget(clip, assignmentTarget!); return; }
    if (action === 'delete') {
      const refs = boards.boards.reduce((sum, board) => sum + board.pads.filter((pad) => pad.clipId === clip.id).length, 0);
      Alert.alert('Delete this sound?', refs ? `This removes it from the Library and clears ${refs} board ${refs === 1 ? 'pad' : 'pads'}.` : 'This removes it from your Library.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDelete(clip) },
      ]);
    }
  }
  async function chooseGalleryArtwork() {
    if (!artworkTarget) return;
    try {
      const artwork = await pickGalleryArtwork();
      if (artwork) onChangeArtwork?.(artworkTarget, artwork);
    } catch (cause) {
      Alert.alert('Could not choose artwork', cause instanceof Error ? cause.message : 'Choose another image and try again.');
    } finally { setArtworkTarget(null); setArtworkSourceMenu(false); }
  }

  return <View style={styles.root}>
    <View style={styles.libraryHeader}>
      <LibraryIcon size={39} color={theme.accent} />
      <View style={styles.headerCopy}><Text style={[styles.headerTitle, { color: theme.text, lineHeight: 37 * fontScale }]}>Your library <Text style={{ color: '#BC42FA' }}>✦</Text></Text>
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19.5 * fontScale }}>{assignmentTarget ? assignmentTarget.padId ? 'Choose a sound for the selected pad.' : 'Choose a sound to add to this board.' : `Saved sounds stay on this device.\nAdd a clip to any pad for offline playback.`}</Text>
      </View>
    </View>
    <View style={styles.fullWidthButton}><ActionButton label="Edit a device file" icon="＋" onPress={() => onCreate('file')} theme={theme} variant="primary" /></View>
    <View style={styles.searchRow}>
      <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}><Icon name="search" size={22} color={theme.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Search sounds..." placeholderTextColor={theme.muted}
        accessibilityLabel="Search library" returnKeyType="search" selectionColor={theme.focus} style={[styles.search, { color: theme.text }]} /></View>
      <Pressable onPress={() => setSortMenu(true)} accessibilityRole="button" accessibilityLabel={`Sort library sounds, currently ${sortLabels[sort]}`} accessibilityHint="Choose A to Z, Newest, or Duration"
        style={[styles.sortButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
        <Icon name="sort" size={22} color={theme.muted} />
      </Pressable>
    </View>
    <Text style={[styles.count, { color: theme.muted, lineHeight: 16 * fontScale }]}>{filtered.length} / 1000 soundbites</Text>
    <ScrollView style={styles.results} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {filtered.length ? filtered.map((clip) => <Panel key={clip.id} theme={theme} style={styles.row}>
        <View style={[styles.preview, { backgroundColor: clip.color || theme.primary }]}>
          {clip.artworkUri && !failedArtworkUris.has(clip.artworkUri) ? <Image source={{ uri: clip.artworkUri }} onError={() => setFailedArtworkUris((current) => new Set(current).add(clip.artworkUri!))} resizeMode="cover" style={StyleSheet.absoluteFill} /> : <Text style={{ color: contrastForeground(clip.color || theme.primary), fontSize: 20, fontWeight: '800' }}>{clip.missing ? '!' : iconChoices.find((item) => item.id === clip.icon)?.glyph ?? '▶'}</Text>}
        </View>
        <View style={styles.details}><Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{clip.title}</Text>
          <Text style={{ color: theme.muted, marginTop: 4, fontSize: 12 }}>{formatTime(clip.durationMs)} · {clip.missing ? 'File unavailable' : 'Saved offline'}</Text></View>
        <Pressable onPress={() => !clip.missing && onPlay(clip)} accessibilityRole="button" accessibilityLabel={clip.missing ? `${clip.title}, file unavailable` : `Play ${clip.title}`} disabled={clip.missing} style={[styles.playButton, { backgroundColor: mixHex(theme.accent, theme.surfaceAlt, 0.14) }]}><Icon name="play" size={19} color={theme.accent} /></Pressable>
        <Pressable ref={(node) => { if (node) menuButtonRefs.current.set(clip.id, node); else menuButtonRefs.current.delete(clip.id); }} onPress={() => showActions(clip)} accessibilityRole="button" accessibilityLabel={`Options for ${clip.title}`} style={styles.menu}><Icon name="more" size={22} color={theme.accent} /></Pressable>
      </Panel>) : <Panel theme={theme} style={styles.empty}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{query ? 'No matches' : 'Your Library is empty'}</Text>
        <Text style={{ color: theme.muted, lineHeight: 21 }}>{query ? 'Try a different name.' : 'Import a sound file to trim it and save your first clip.'}</Text>
      </Panel>}
      <Pressable onPress={() => onCreate()} accessibilityRole="button" style={[styles.makeAnother, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
        <View style={[styles.plusCircle, { backgroundColor: theme.accent }]}><Icon name="plus" size={24} color="#FFFFFF" /></View><Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>Make another sound</Text><Text style={{ color: theme.muted, fontSize: 12 }}>Import or record a clip</Text>
      </Pressable>
    </ScrollView>

    <Modal visible={sortMenu} transparent animationType="fade" onRequestClose={() => setSortMenu(false)}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.sheet}>
        <View style={styles.modalHeading}><Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Sort library</Text><Pressable onPress={() => setSortMenu(false)} accessibilityRole="button" accessibilityLabel="Close sort options"><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable></View>
        {(['az', 'newest', 'duration'] as const).map((option) => <ActionButton key={option} label={`${sortLabels[option]}${sort === option ? ' · Current' : ''}`} onPress={() => { setSort(option); setSortMenu(false); }} theme={theme} variant={sort === option ? 'primary' : 'secondary'} />)}
      </Panel></View>
    </Modal>

    <Modal visible={Boolean(clipMenu)} transparent animationType="fade" statusBarTranslucent onRequestClose={dismissClipMenu}>
      <View style={styles.menuModal}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissClipMenu} accessibilityRole="button" accessibilityLabel="Close sound options" />
        {clipMenu ? <View style={[styles.clipMenu, { left: clipMenu.left, top: clipMenu.top, width: clipMenu.width, backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MenuItem label="Play" icon="play" theme={theme} disabled={clipMenu.clip.missing} onPress={() => chooseMenuAction('play')} />
          {assignmentTarget && onAssignToTarget ? <MenuItem label={assignmentTarget.padId ? 'Use for selected pad' : 'Add to this board'} icon="board" theme={theme} onPress={() => chooseMenuAction('target')} /> : null}
          <MenuItem label="Rename" icon="pencil" theme={theme} onPress={() => chooseMenuAction('rename')} />
          {onChangeArtwork ? <MenuItem label="Change artwork" icon="image" theme={theme} onPress={() => chooseMenuAction('artwork')} /> : null}
          <MenuItem label="Add to board" icon="plus" theme={theme} onPress={() => chooseMenuAction('board')} />
          <MenuItem label="Delete" icon="close" theme={theme} destructive onPress={() => chooseMenuAction('delete')} />
        </View> : null}
      </View>
    </Modal>

    <Modal visible={Boolean(selected) && editing} transparent animationType="fade" onRequestClose={() => { setSelected(null); setEditing(false); }}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.dialog}>
        <View style={styles.modalHeading}><Text numberOfLines={1} style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Rename sound</Text><Pressable onPress={() => { setSelected(null); setEditing(false); }} accessibilityRole="button" accessibilityLabel="Close rename dialog"><Icon name="close" size={22} color={theme.text} /></Pressable></View>
        <TextInput value={title} onChangeText={setTitle} placeholder="Sound name" placeholderTextColor={theme.muted} maxLength={100} autoFocus selectionColor={theme.focus}
          style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.raised }]} />
        <ActionButton label="Save name" onPress={() => { if (selected && title.trim()) onRename(selected, title); setSelected(null); setEditing(false); }} theme={theme} variant="primary" disabled={!title.trim()} />
      </Panel></View>
    </Modal>

    <Modal visible={choosingBoard && Boolean(selected)} transparent animationType="fade" onRequestClose={() => { setChoosingBoard(false); setSelected(null); }}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.dialog}>
        <View style={styles.modalHeading}><Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Add to board</Text><Pressable onPress={() => { setChoosingBoard(false); setSelected(null); }} accessibilityRole="button" accessibilityLabel="Close board choices"><Icon name="close" size={22} color={theme.text} /></Pressable></View>
        <Text style={{ color: theme.muted }}>Choose a board. The sound will use its next empty pad.</Text>
        {boards.boards.map((board) => <ActionButton key={board.id} label={board.name} onPress={() => {
          if (selected) onAddToBoard(selected, board.id);
          setChoosingBoard(false); setSelected(null);
        }} theme={theme} />)}
      </Panel></View>
    </Modal>
    <Modal visible={artworkSourceMenu} transparent animationType="fade" onRequestClose={() => { setArtworkSourceMenu(false); setArtworkTarget(null); }}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.sheet}>
        <View style={styles.modalHeading}><Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Choose artwork</Text><Pressable onPress={() => { setArtworkSourceMenu(false); setArtworkTarget(null); }} accessibilityRole="button" accessibilityLabel="Close artwork options"><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable></View>
        <ActionButton label="Choose from gallery" onPress={() => void chooseGalleryArtwork()} theme={theme} variant="primary" />
        <ActionButton label="Choose a popular template" onPress={() => { setArtworkSourceMenu(false); setMemePickerOpen(true); }} theme={theme} />
        {artworkTarget?.artwork?.source === 'imgflip' && artworkTarget.artwork.sourceUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(artworkTarget.artwork!.sourceUrl!).catch(() => Alert.alert('Could not open Imgflip', 'Check your connection and try again.'))} style={styles.attribution}><Text style={{ color: theme.focus, textDecorationLine: 'underline', fontSize: 13 }}>Artwork from Imgflip</Text></Pressable> : null}
      </Panel></View>
    </Modal>
    <ArtworkPicker visible={memePickerOpen} theme={theme} onClose={() => { setMemePickerOpen(false); setArtworkTarget(null); }} onPreparingChange={() => {}}
      onSelect={(artwork) => { if (artworkTarget) onChangeArtwork?.(artworkTarget, artwork); setArtworkTarget(null); }} />
  </View>;
}

function MenuItem({ label, icon, theme, onPress, disabled = false, destructive = false }: {
  label: string; icon: 'play' | 'board' | 'pencil' | 'image' | 'plus' | 'close'; theme: Theme; onPress: () => void; disabled?: boolean; destructive?: boolean;
}) {
  const color = destructive ? theme.danger : theme.text;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => [styles.menuItem, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>
    <Icon name={icon} size={16} color={color} />
    <Text numberOfLines={1} style={{ color, fontSize: 12, fontWeight: destructive ? '700' : '500', flex: 1 }}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 0 }, libraryHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 15, marginTop: 21, marginBottom: 25 }, headerCopy: { flex: 1, gap: 9, minWidth: 0 }, headerTitle: { fontSize: 28, lineHeight: 37, fontWeight: '800', letterSpacing: -0.8, includeFontPadding: false }, fullWidthButton: { alignSelf: 'stretch', marginBottom: 15 }, searchRow: { flexDirection: 'row', gap: 8, marginBottom: 13 }, searchWrap: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }, search: { flex: 1, minHeight: 44, paddingHorizontal: 0, fontSize: 14 }, sortButton: { minHeight: 48, minWidth: 49, width: 49, height: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, count: { textAlign: 'right', fontSize: 12, lineHeight: 16, marginTop: -4, marginBottom: 16 }, results: { flex: 1 }, list: { gap: 8, paddingBottom: 16 }, row: { minHeight: 79, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 11, borderRadius: 16 }, preview: { width: 61, height: 61, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, details: { flex: 1, minWidth: 0 }, playButton: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, menu: { width: 32, height: 48, alignItems: 'center', justifyContent: 'center' },
  makeAnother: { minHeight: 118, alignSelf: 'stretch', marginTop: 18, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 }, plusCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'flex-start', gap: 12 }, scrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }, sheet: { width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center', gap: 16 }, dialog: { width: '100%', maxWidth: 380, maxHeight: '90%', alignSelf: 'center', gap: 16 }, modalHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, nameInput: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 }, optionStack: { gap: 10 }, menuModal: { flex: 1 }, clipMenu: { position: 'absolute', paddingVertical: 4, borderWidth: 1, borderRadius: 14, elevation: 14, shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }, menuItem: { minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, attribution: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
