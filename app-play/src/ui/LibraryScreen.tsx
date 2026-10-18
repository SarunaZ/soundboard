import { useMemo, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { BoardCollection } from '../data/boards';
import type { LocalClip } from '../data/library';
import { ActionButton, Heading, Panel } from './controls';
import { iconChoices, type Theme } from './theme';
import { contrastForeground } from './contrast';
import { formatTime } from './Waveform';

type SortMode = 'az' | 'newest' | 'duration';
const sortLabels: Record<SortMode, string> = { az: 'A–Z', newest: 'Newest', duration: 'Duration' };

export function LibraryScreen({ theme, clips, boards, assignmentTarget = null, onAppearance, onPlay, onCreate, onRename, onDelete, onAddToBoard, onAssignToTarget }: {
  theme: Theme; clips: LocalClip[]; boards: BoardCollection; onPlay: (clip: LocalClip) => void;
  onCreate: () => void; onAppearance: () => void; onRename: (clip: LocalClip, title: string) => void; onDelete: (clip: LocalClip) => void;
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
  const [failedArtworkUris, setFailedArtworkUris] = useState<Set<string>>(() => new Set());
  const filtered = useMemo(() => clips
    .filter((clip) => clip.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title) : sort === 'duration' ? a.durationMs - b.durationMs || a.title.localeCompare(b.title) : a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })), [clips, query, sort]);

  function showActions(clip: LocalClip) { setSelected(clip); setTitle(clip.title); }

  return <View style={styles.root}>
    <Heading title="Library" subtitle={assignmentTarget ? assignmentTarget.padId ? 'Choose a sound for the selected pad.' : 'Choose a sound to add to this board.' : `${clips.length} saved ${clips.length === 1 ? 'sound' : 'sounds'}`} theme={theme} />
    <View style={styles.fullWidthButton}><ActionButton label="Make another sound" icon="＋" onPress={onCreate} theme={theme} variant="primary" /></View>
    <View style={styles.searchRow}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search your sounds" placeholderTextColor={theme.muted}
        accessibilityLabel="Search library" returnKeyType="search" selectionColor={theme.focus}
        style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} />
      <Pressable onPress={() => setSortMenu(true)} accessibilityRole="button" accessibilityLabel={`Sort library sounds, currently ${sortLabels[sort]}`} accessibilityHint="Choose A to Z, Newest, or Duration"
        style={[styles.sortButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>↕</Text>
      </Pressable>
    </View>
    {filtered.length ? <ScrollView style={styles.results} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {filtered.map((clip) => <Panel key={clip.id} theme={theme} style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={clip.missing ? `${clip.title}, file unavailable` : `Preview ${clip.title}`} onPress={() => !clip.missing && onPlay(clip)} style={[styles.preview, { backgroundColor: clip.color || theme.primary }]}>
          {clip.artworkUri && !failedArtworkUris.has(clip.artworkUri) ? <Image source={{ uri: clip.artworkUri }} onError={() => setFailedArtworkUris((current) => new Set(current).add(clip.artworkUri!))} resizeMode="cover" style={StyleSheet.absoluteFill} /> : <Text style={{ color: contrastForeground(clip.color || theme.primary), fontSize: 20, fontWeight: '800' }}>{clip.missing ? '!' : iconChoices.find((item) => item.id === clip.icon)?.glyph ?? '▶'}</Text>}
        </Pressable>
        <View style={styles.details}><Text numberOfLines={2} style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{clip.title}</Text>
          <Text style={{ color: theme.muted, marginTop: 5 }}>{formatTime(clip.durationMs)}{clip.missing ? ' · File unavailable' : ''}</Text></View>
        <Pressable onPress={() => showActions(clip)} accessibilityRole="button" accessibilityLabel={`Options for ${clip.title}`} style={[styles.menu, { borderColor: theme.border }]}><Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>···</Text></Pressable>
      </Panel>)}
    </ScrollView> : <Panel theme={theme} style={styles.empty}><Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{query ? 'No matches' : 'Your Library is empty'}</Text>
      <Text style={{ color: theme.muted, lineHeight: 21 }}>{query ? 'Try a different name.' : 'Import a sound file to trim it and save your first clip.'}</Text>
    </Panel>}

    <View style={styles.appearanceEntry}><ActionButton label="Appearance preferences" onPress={onAppearance} theme={theme} variant="secondary" /></View>

    <Modal visible={sortMenu} transparent animationType="fade" onRequestClose={() => setSortMenu(false)}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.sheet}>
        <Heading title="Sort library" theme={theme}
          trailing={<Pressable onPress={() => setSortMenu(false)} accessibilityRole="button" accessibilityLabel="Close sort options"><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable>} />
        {(['az', 'newest', 'duration'] as const).map((option) => <ActionButton key={option} label={`${sortLabels[option]}${sort === option ? ' · Current' : ''}`} onPress={() => { setSort(option); setSortMenu(false); }} theme={theme} variant={sort === option ? 'primary' : 'secondary'} />)}
      </Panel></View>
    </Modal>

    <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => { setSelected(null); setEditing(false); }}>
      <View style={styles.scrim}><Panel theme={theme} style={styles.sheet}>
        <Heading title={editing ? 'Rename sound' : selected?.title ?? 'Sound options'} theme={theme}
          trailing={<Pressable onPress={() => { setSelected(null); setEditing(false); }} accessibilityRole="button" accessibilityLabel="Close sound options"><Text style={{ color: theme.text, fontSize: 24 }}>×</Text></Pressable>} />
        {editing ? <>
          <TextInput value={title} onChangeText={setTitle} placeholder="Sound name" placeholderTextColor={theme.muted} maxLength={100} autoFocus selectionColor={theme.focus}
            style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.raised }]} />
          <ActionButton label="Save name" onPress={() => { if (selected && title.trim()) onRename(selected, title); setSelected(null); setEditing(false); }} theme={theme} variant="primary" disabled={!title.trim()} />
        </> : <View style={styles.optionStack}>
          <ActionButton label={selected?.missing ? 'Play unavailable' : 'Play'} icon="▶" onPress={() => { if (selected && !selected.missing) { onPlay(selected); setSelected(null); } }} theme={theme} disabled={Boolean(selected?.missing)} />
          {assignmentTarget && onAssignToTarget ? <ActionButton label={assignmentTarget.padId ? 'Use for selected pad' : 'Add to this board'} icon={assignmentTarget.padId ? '▦' : '＋'} onPress={() => {
            if (selected) onAssignToTarget(selected, assignmentTarget);
            setSelected(null);
          }} theme={theme} variant="primary" /> : null}
          <ActionButton label="Add to board" icon="＋" onPress={() => setChoosingBoard(true)} theme={theme} variant="primary" />
          <ActionButton label="Rename" onPress={() => setEditing(true)} theme={theme} />
          {selected?.artwork ? <Text accessibilityRole="link" onPress={() => {
            const url = selected.artwork?.sourceUrl;
            if (url) void Linking.openURL(url).catch(() => Alert.alert('Could not open Imgflip', 'Check your connection and try again.'));
          }} style={{ color: theme.secondary, fontWeight: '700', textDecorationLine: 'underline', minHeight: 48, textAlignVertical: 'center' }}>Artwork from Imgflip</Text> : null}
          <ActionButton label="Delete from Library" variant="danger" onPress={() => {
            if (!selected) return;
            const refs = boards.boards.reduce((sum, board) => sum + board.pads.filter((pad) => pad.clipId === selected.id).length, 0);
            Alert.alert('Delete this sound?', refs ? `This removes it from the Library and clears ${refs} board ${refs === 1 ? 'pad' : 'pads'}.` : 'This removes it from your Library.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { onDelete(selected); setSelected(null); } },
            ]);
          }} theme={theme} />
        </View>}
        {choosingBoard ? <View style={styles.optionStack}>
          <Text style={{ color: theme.muted }}>Choose a board. The sound will use its next empty pad.</Text>
          {boards.boards.map((board) => <ActionButton key={board.id} label={board.name} onPress={() => {
            if (selected) onAddToBoard(selected, board.id);
            setChoosingBoard(false); setSelected(null);
          }} theme={theme} />)}
        </View> : null}
      </Panel></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 10 }, fullWidthButton: { alignSelf: 'stretch' }, searchRow: { flexDirection: 'row', gap: 8 }, sortButton: { minHeight: 48, minWidth: 48, width: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, search: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 }, results: { flex: 1 }, list: { gap: 8, paddingBottom: 16 }, row: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 10 }, preview: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, details: { flex: 1 }, menu: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  appearanceEntry: { alignSelf: 'stretch' }, empty: { flex: 1, alignItems: 'flex-start', gap: 12 }, scrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }, sheet: { width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center', gap: 16 }, nameInput: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 }, optionStack: { gap: 10 },
});
