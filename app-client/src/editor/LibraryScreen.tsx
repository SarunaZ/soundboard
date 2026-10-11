import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Pad } from '../pads';
import type { BoardAssignments } from '../board/assignments';
import type { LocalClip } from './library';
import { PadPicker } from '../board/PadPicker';
import { filterSoundbites } from '../board/search';
import { MAX_SOUNDBITES } from '../limits';
import { normalizeClipTitle } from './catalog';
import { formatTime } from './WaveformRange';

interface LibraryScreenProps {
  onBack: () => void;
  onOpenEditor: () => void;
  basePads: Pad[];
  clips: LocalClip[];
  assignments: BoardAssignments;
  assignmentError: string;
  onAssign: (clipId: string, slotIndex: number) => void;
  onAppend: (clipId: string) => void;
  onRename: (clipId: string, title: string) => void;
  onDelete: (clipId: string) => void;
}

export function LibraryScreen({
  onBack,
  onOpenEditor,
  basePads,
  clips,
  assignments,
  assignmentError,
  onAssign,
  onAppend,
  onRename,
  onDelete,
}: LibraryScreenProps) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pickerClip, setPickerClip] = useState<LocalClip | null>(null);
  const [query, setQuery] = useState('');
  const [renameClip, setRenameClip] = useState<LocalClip | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState('');
  const listRef = useRef<FlatList<LocalClip>>(null);
  const filteredClips = filterSoundbites(clips, query);
  const originalIndexes = new Map(clips.map((clip, index) => [clip.id, index]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        try { player.pause(); } catch { /* The player may be releasing during navigation. */ }
        setPlayingId(null);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [player]);

  useEffect(() => {
    if (status.error) setError(`Audio playback failed: ${status.error}`);
  }, [status.error]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query]);

  const playClip = (clip: LocalClip) => {
    try {
      if (playingId === clip.id && status.playing) {
        player.pause();
        setPlayingId(null);
        return;
      }
      player.pause();
      player.replace({ uri: clip.uri, name: clip.title });
      player.play();
      setPlayingId(clip.id);
    } catch {
      setError(`Could not play “${clip.title}”. The audio file may be damaged.`);
    }
  };

  const confirmDelete = (clip: LocalClip) => {
    Alert.alert('Delete local clip?', `“${clip.title}” will be removed from this device.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            if (playingId === clip.id) {
              player.pause();
              setPlayingId(null);
            }
            onDelete(clip.id);
            if (playingId === clip.id) setPlayingId(null);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not delete this clip.');
          }
        },
      },
    ]);
  };

  const openRename = (clip: LocalClip) => {
    setRenameClip(clip);
    setRenameTitle(clip.title);
    setRenameError('');
  };

  const saveRename = () => {
    if (!renameClip) return;
    try {
      const normalized = normalizeClipTitle(renameTitle);
      onRename(renameClip.id, normalized);
      setRenameClip(null);
      setRenameError('');
    } catch (cause) {
      setRenameError(cause instanceof Error ? cause.message : 'Could not rename this soundbite.');
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  EDITOR</Text></Pressable>
        <Text style={styles.eyebrow}>ON THIS DEVICE</Text>
        <Text style={styles.heading}>Your library</Text>
        <Text style={styles.subheading}>Saved sounds stay on this device. Add a clip to any pad for offline playback.</Text>
      </View>
      <FlatList
        ref={listRef}
        style={styles.flatList}
        contentContainerStyle={styles.list}
        data={filteredClips}
        keyExtractor={(clip) => clip.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        extraData={{ playingId, playing: status.playing, assignmentError }}
        ListHeaderComponent={(
          <View style={styles.listHeader}>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {assignmentError ? <Text accessibilityRole="alert" style={styles.error}>Board assignments could not be read. The damaged state was preserved, so assignment controls are paused. {assignmentError}</Text> : null}
            <View style={styles.editPanel}>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit an audio file from this device" onPress={onOpenEditor} style={styles.editFileButton}>
                <Text style={styles.editFileButtonText}>EDIT A DEVICE FILE</Text>
              </Pressable>
              <Text style={styles.editHelp}>Choose a file in the editor, trim a selection, then save it to this library.</Text>
            </View>
            <View style={styles.searchBlock}>
              <View style={styles.searchRow}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Search soundbites"
                  placeholderTextColor="#737d86"
                  accessibilityLabel="Search soundbites by name"
                  returnKeyType="search"
                  style={styles.searchInput}
                />
                {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clearSearch}><Text style={styles.clearSearchText}>×</Text></Pressable> : null}
              </View>
              <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{query ? `${filteredClips.length} of ${clips.length} · ${MAX_SOUNDBITES} max` : `${clips.length} / ${MAX_SOUNDBITES} soundbites`}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Text style={styles.emptyWave}>∿</Text></View>
            <Text style={styles.emptyTitle}>{clips.length && query ? 'No matching soundbites' : 'No saved clips yet'}</Text>
            <Text style={styles.emptyBody}>{clips.length && query ? 'Try another name or clear the search to see your library.' : 'Trim a device audio file or a YouTube moment in the editor, then save it here for offline playback.'}</Text>
          </View>
        )}
        renderItem={({ item: clip }) => {
          const index = originalIndexes.get(clip.id) ?? 0;
          const active = playingId === clip.id && status.playing;
          return (
            <View style={styles.clipRow}>
              <View style={styles.row}>
                <View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(3, '0')}</Text></View>
                <View style={styles.copy}>
                  <Text style={styles.clipTitle} numberOfLines={1}>{clip.title}</Text>
                  <Text style={[styles.meta, clip.missing && styles.missing]}>{clip.missing ? 'AUDIO FILE MISSING · DELETE ENTRY' : `${formatTime(clip.durationMs)} · SAVED OFFLINE`}</Text>
                </View>
                <Pressable accessibilityRole="button" disabled={clip.missing} accessibilityLabel={`${active ? 'Stop' : 'Play'} ${clip.title}`} onPress={() => playClip(clip)} style={[styles.play, clip.missing && styles.disabled]}>
                  <Text style={styles.playText}>{active ? 'Ⅱ' : '▶'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${clip.title} to board`}
                  accessibilityState={{ disabled: clip.missing || Boolean(assignmentError) }}
                  disabled={clip.missing || Boolean(assignmentError)}
                  onPress={() => setPickerClip(clip)}
                  style={[styles.assign, (clip.missing || Boolean(assignmentError)) && styles.disabled]}
                >
                  <Text style={styles.assignText}>＋ ADD TO BOARD</Text>
                </Pressable>
              </View>
              <View style={styles.rowActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Rename ${clip.title}`} onPress={() => openRename(clip)} style={styles.rowAction}><Text style={styles.rowActionText}>RENAME</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${clip.title}`} onPress={() => confirmDelete(clip)} style={[styles.rowAction, styles.deleteAction]}><Text style={styles.deleteText}>DELETE</Text></Pressable>
              </View>
            </View>
          );
        }}
        ListFooterComponent={(
          <View style={styles.listFooter}>
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.createButton}><Text style={styles.createText}>＋  MAKE ANOTHER SOUND</Text></Pressable>
            <Text style={styles.storage}>Stored in private app storage. These files are not exported to Downloads and are removed if the app is uninstalled.</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      {pickerClip ? (
        <PadPicker
          clip={pickerClip}
          basePads={basePads}
          clips={clips}
          assignments={assignments}
          onCancel={() => setPickerClip(null)}
          onAppend={() => {
            try {
              onAppend(pickerClip.id);
              setPickerClip(null);
              setError('');
            } catch (cause) {
              setPickerClip(null);
              setError(cause instanceof Error ? cause.message : 'Could not add this sound to the board.');
            }
          }}
          onSelect={(slotIndex) => {
            try {
              onAssign(pickerClip.id, slotIndex);
              setPickerClip(null);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not assign this clip to the board.');
            }
          }}
        />
      ) : null}
      <Modal visible={Boolean(renameClip)} transparent animationType="fade" onRequestClose={() => setRenameClip(null)} accessibilityViewIsModal>
        <KeyboardAvoidingView style={styles.modalScrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.renamePanel}>
            <Text accessibilityRole="header" style={styles.renameHeading}>Rename soundbite</Text>
            <Text style={styles.renameLabel}>SOUNDBITE NAME</Text>
            <TextInput
              value={renameTitle}
              onChangeText={(value) => { setRenameTitle(value); setRenameError(''); }}
              maxLength={100}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={saveRename}
              accessibilityLabel="Soundbite name"
              style={styles.renameInput}
            />
            <Text style={styles.characterCount}>{renameTitle.length}/100</Text>
            {!renameTitle.trim() ? <Text style={styles.renameError}>A name is required.</Text> : null}
            {renameError ? <Text accessibilityRole="alert" style={styles.renameError}>{renameError}</Text> : null}
            <View style={styles.renameButtons}>
              <Pressable accessibilityRole="button" onPress={() => setRenameClip(null)} style={styles.renameCancel}><Text style={styles.renameCancelText}>CANCEL</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={!renameTitle.trim()} onPress={saveRename} style={[styles.renameSave, !renameTitle.trim() && styles.disabled]}><Text style={styles.renameSaveText}>SAVE NAME</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#14161a' },
  header: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 20, borderBottomWidth: 1, borderColor: '#252b30' },
  back: { alignSelf: 'flex-start', paddingVertical: 7, paddingRight: 10, marginBottom: 12 },
  backText: { color: '#87e6c3', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  eyebrow: { color: '#7ddcb8', letterSpacing: 2.1, fontSize: 10, fontWeight: '700' },
  heading: { color: '#f4f5f6', fontSize: 28, fontWeight: '700', marginTop: 2 },
  subheading: { color: '#8f999f', fontSize: 12, lineHeight: 18, marginTop: 5 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  flatList: { flex: 1 },
  listHeader: { gap: 10 },
  listFooter: { gap: 10 },
  separator: { height: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 58, paddingHorizontal: 26 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#1b2d29', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyWave: { color: '#72e0b9', fontSize: 36, fontWeight: '700' },
  emptyTitle: { color: '#eef1f2', fontSize: 17, fontWeight: '600' },
  emptyBody: { color: '#818c93', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  editPanel: { borderRadius: 15, backgroundColor: '#1b2724', borderWidth: 1, borderColor: '#34463f', padding: 13, gap: 8 },
  editFileButton: { borderRadius: 11, paddingVertical: 15, alignItems: 'center', backgroundColor: '#315747' },
  editFileButtonText: { color: '#d6ffed', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  editHelp: { color: '#91a49b', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  clipRow: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#1a1e23', borderWidth: 1, borderColor: '#272e33' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingTop: 12, paddingBottom: 8, gap: 10, minHeight: 62 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingBottom: 9 },
  rowAction: { minHeight: 30, minWidth: 70, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#252c30', alignItems: 'center', justifyContent: 'center' },
  rowActionText: { color: '#a4e8ce', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  deleteAction: { backgroundColor: '#302428' },
  index: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#23352f', alignItems: 'center', justifyContent: 'center' },
  indexText: { color: '#8fe6c6', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  copy: { flex: 1, gap: 5 },
  clipTitle: { color: '#eef1f2', fontSize: 14, fontWeight: '600' },
  meta: { color: '#839097', fontSize: 9, letterSpacing: 0.8, fontVariant: ['tabular-nums'] },
  missing: { color: '#f49aa2' },
  disabled: { opacity: 0.35 },
  play: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#29332f', alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#9ef0d2', fontSize: 14, fontWeight: '700' },
  assign: { width: 65, height: 38, borderRadius: 11, backgroundColor: '#29332f', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  assignText: { color: '#a4e8ce', fontSize: 7, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  deleteText: { color: '#d38d96', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  searchBlock: { gap: 6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#343c43', backgroundColor: '#111418' },
  searchInput: { flex: 1, minHeight: 46, paddingHorizontal: 13, color: '#f1f4f5', fontSize: 14 },
  clearSearch: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: '#aeb8bd', fontSize: 23 },
  resultCount: { color: '#7f8a90', fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] },
  createButton: { marginTop: 5, borderRadius: 12, paddingVertical: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#45534f', alignItems: 'center' },
  createText: { color: '#a4e8ce', fontSize: 10, letterSpacing: 1.1, fontWeight: '700' },
  error: { color: '#ff9ba7', fontSize: 13, lineHeight: 20, backgroundColor: '#361f25', borderRadius: 10, padding: 12 },
  storage: { color: '#667178', fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: 18, paddingTop: 10 },
  modalScrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.72)' },
  renamePanel: { borderRadius: 18, padding: 18, backgroundColor: '#1a1e23', borderWidth: 1, borderColor: '#343b40', gap: 10 },
  renameHeading: { color: '#f4f5f6', fontSize: 19, fontWeight: '700', marginBottom: 4 },
  renameLabel: { color: '#89939a', fontSize: 9, letterSpacing: 1.3, fontWeight: '700' },
  renameInput: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#3a454b', backgroundColor: '#111418', color: '#f1f4f5', fontSize: 15 },
  characterCount: { color: '#78848a', fontSize: 10, textAlign: 'right', marginTop: -5 },
  renameError: { color: '#ff9ba7', fontSize: 12, lineHeight: 17 },
  renameButtons: { flexDirection: 'row', gap: 9, marginTop: 4 },
  renameCancel: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#3c464b' },
  renameCancelText: { color: '#b3bdc1', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  renameSave: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#71e1ba' },
  renameSaveText: { color: '#10251d', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
