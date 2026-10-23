import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getClipPlaybackPreference } from './src/data/clipPlayback';
import { getPlaybackSnapshot, play, setMasterVolume, stop, subscribePlayback, type PlaybackSnapshot } from './src/media/playbackEngine';
import { addClipToBoard, loadBoards, type BoardCollection } from './src/data/boards';
import { emptyBoardCollection } from './src/data/boardModel';
import { deleteLocalClip, loadLocalClips, renameLocalClip, setLocalClipPresentation, type LocalClip } from './src/data/library';
import { loadPlayPreferences, savePlayPreferences } from './src/data/preferences';
import { commitDraftArtwork, disposeDraftArtwork, type DraftArtwork } from './src/media/artwork';
import { isDeviceAudioCaptureSupported } from './src/media/deviceAudioCapture';
import { importSoundbites } from './src/media/soundbiteTransfer';
import { CreateFlow, type AssignmentTarget, type InitialAction } from './src/ui/CreateFlow';
import { ActionButton } from './src/ui/controls';
import { BoardIcon, EditorIcon, Icon, LibraryIcon } from './src/ui/Icons';
import { BoardScreen } from './src/ui/BoardScreen';
import { EditorScreen } from './src/ui/EditorScreen';
import { LibraryScreen } from './src/ui/LibraryScreen';
import { BrandHeader } from './src/ui/BrandHeader';
import { useTheme, type ThemeName } from './src/ui/theme';
import { SettingsModal } from './src/ui/SettingsModal';
import { ClipPlaybackOptionsModal } from './src/ui/ClipPlaybackOptionsModal';

type Page = 'board' | 'editor' | 'library';

export default function App() {
  const [appearance, setAppearance] = useState<ThemeName>(() => {
    try { return loadPlayPreferences(isDeviceAudioCaptureSupported()).appearance; } catch { return 'Vanilla'; }
  });
  const { theme, isDark } = useTheme(appearance);
  const [page, setPage] = useState<Page>('board');
  const [boards, setBoards] = useState<BoardCollection>(() => emptyBoardCollection());
  const [clips, setClips] = useState<LocalClip[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(() => getPlaybackSnapshot());
  const [flow, setFlow] = useState<{ target: AssignmentTarget; key: number; initialAction?: InitialAction } | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<AssignmentTarget>(null);
  const [retry, setRetry] = useState<{ clip: LocalClip; target: AssignmentTarget } | null>(null);
  const [error, setError] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [playbackSoundId, setPlaybackSoundId] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [appOptionsMenu, setAppOptionsMenu] = useState(false);
  const [appOptionsPosition, setAppOptionsPosition] = useState({ left: 0, top: 0 });
  const [newBoardRequest, setNewBoardRequest] = useState(0);
  const [pendingNewBoard, setPendingNewBoard] = useState(false);
  const appOptionsButton = useRef<View>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const closePlaybackOptions = useCallback(() => setPlaybackSoundId(null), []);

  const refresh = useCallback(() => {
    try { setBoards(loadBoards()); setClips(loadLocalClips()); setDataReady(true); }
    catch (cause) { setDataReady(false); setError(cause instanceof Error ? cause.message : 'Could not read your Play library.'); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!dataReady || page !== 'board' || !pendingNewBoard) return;
    setNewBoardRequest((request) => request + 1);
    setPendingNewBoard(false);
  }, [dataReady, page, pendingNewBoard]);
  useEffect(() => { try { setMasterVolume(loadPlayPreferences(isDeviceAudioCaptureSupported()).masterVolume); } catch { setMasterVolume(1); } }, []);
  useEffect(() => subscribePlayback(setPlayback), []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') stop(); });
    return () => subscription.remove();
  }, []);
  useEffect(() => () => stop(), []);

  const updateBoards = useCallback((next: BoardCollection) => {
    setBoards(next);
    setError('');
  }, []);

  const toggleAppOptions = useCallback(() => {
    if (appOptionsMenu) { setAppOptionsMenu(false); return; }
    appOptionsButton.current?.measureInWindow((x, y, width, height) => {
      const menuWidth = Math.min(190, windowWidth - 24);
      const menuHeight = 98;
      const left = Math.max(12, Math.min(x + width - menuWidth, windowWidth - menuWidth - 12));
      let top = y + height + 4;
      if (top + menuHeight > windowHeight - 12) top = Math.max(12, y - menuHeight - 4);
      setAppOptionsPosition({ left, top });
      setAppOptionsMenu(true);
    });
  }, [appOptionsMenu, windowHeight, windowWidth]);

  const startCreation = useCallback((target: AssignmentTarget, initialAction?: InitialAction) => {
    if (!dataReady) { setError('Load your Play data before creating a sound.'); return; }
    stop();
    setFlow({ target, key: Date.now(), initialAction });
  }, [dataReady]);
  const cancelCreation = useCallback(() => { setFlow(null); refresh(); }, [refresh]);

  const playClip = useCallback((clip: LocalClip, padId?: string, boardId?: string) => {
    if (clip.missing) { setError('This sound file is unavailable. Remove it from Library and import it again.'); return; }
    try {
      const preference = getClipPlaybackPreference(clip.id);
      const board = boardId ? boards.boards.find((item) => item.id === boardId) : undefined;
      void play(clip.uri, padId ?? clip.id, { soundId: clip.id, gain: preference.gain, repeat: preference.repeat, allowOverlap: board?.allowOverlap }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not play this sound.'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read playback options for this sound.'); }
  }, [boards]);

  const applyRestoredSettings = useCallback(() => {
    refresh();
    try { const preferences = loadPlayPreferences(isDeviceAudioCaptureSupported()); setAppearance(preferences.appearance); setMasterVolume(preferences.masterVolume); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload restored settings.'); }
    setDataRevision((revision) => revision + 1);
  }, [refresh]);

  const completeSave = useCallback(async (clip: LocalClip, target: AssignmentTarget, artwork?: DraftArtwork): Promise<boolean> => {
    let presentationSaved = true;
    let artworkSaved = true;
    try { setLocalClipPresentation(clip.id, { icon: clip.icon, color: clip.color }); }
    catch { presentationSaved = false; }
    if (artwork) {
      try { commitDraftArtwork(clip.id, artwork); }
      catch { artworkSaved = false; }
      finally { disposeDraftArtwork(artwork); }
    }
    try {
      if (target) {
        const current = target.padId === undefined ? undefined : loadBoards().boards.find((board) => board.id === target.boardId)?.pads.find((pad) => pad.id === target.padId)?.clipId;
        if (target.padId !== undefined && target.expectedClipId !== undefined && current !== target.expectedClipId) throw new Error('The selected pad changed while you were editing. The sound is saved in Library; review the pad before retrying.');
        setBoards(addClipToBoard(clip.id, target.boardId, target.padId));
      }
      setClips(loadLocalClips()); setRetry(null); setError(!presentationSaved ? 'Sound saved, but its icon or color could not be stored.' : !artworkSaved ? 'Sound saved, but its Imgflip artwork could not be stored.' : ''); return true;
    } catch (cause) {
      setClips(loadLocalClips());
      if (target) setRetry({ clip, target });
      setError(target ? 'Saved in Library; board assignment failed.' : (cause instanceof Error ? cause.message : 'Could not finish saving.'));
      return false;
    }
  }, []);

  const retryAssignment = useCallback(() => {
    if (!retry) return;
    const assign = () => {
      try {
        setBoards(addClipToBoard(retry.clip.id, retry.target?.boardId, retry.target?.padId));
        setRetry(null); setError('');
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Board assignment still needs a retry.'); }
    };
    if (retry.target) {
      const current = retry.target.padId === undefined ? undefined : loadBoards().boards.find((board) => board.id === retry.target?.boardId)?.pads.find((pad) => pad.id === retry.target?.padId)?.clipId;
      if (retry.target.padId !== undefined && retry.target.expectedClipId !== undefined && current !== retry.target.expectedClipId) {
        Alert.alert('Pad contents changed', 'Assigning this sound will replace what is now on the selected pad.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Replace pad contents', style: 'destructive', onPress: assign },
        ]);
        return;
      }
    }
    assign();
  }, [retry]);

  if (flow) return <SafeAreaProvider><SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <KeyboardAvoidingView style={styles.flow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <CreateFlow key={flow.key} theme={theme} target={flow.target} initialAction={flow.initialAction} onCancel={cancelCreation} onSaved={completeSave} />
    </KeyboardAvoidingView>
  </SafeAreaView></SafeAreaProvider>;

  return <SafeAreaProvider><SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <View style={styles.shell}>
      <BrandHeader theme={theme} title={page === 'board' ? 'Soundboard' : undefined} optionsButtonRef={appOptionsButton} onOptions={toggleAppOptions} hidden={settingsVisible} />

      <View style={{ flex: 1 }}>
      <View style={[{ flex: 1 }, settingsVisible && { display: 'none' }]} collapsable={false} pointerEvents={settingsVisible ? 'none' : 'auto'} accessibilityElementsHidden={settingsVisible} importantForAccessibility={settingsVisible ? 'no-hide-descendants' : 'auto'}>
      {error ? <View style={[styles.notice, { borderColor: retry ? theme.danger : theme.border, backgroundColor: theme.surface }]}>
        <Text accessibilityLiveRegion="polite" style={{ color: theme.text, flex: 1 }}>{error}</Text>
        {retry ? <Pressable accessibilityRole="button" onPress={retryAssignment} style={[styles.retryButton, { backgroundColor: theme.danger }]}><Text style={{ color: '#fff', fontWeight: '800' }}>Retry</Text></Pressable> : null}
        <Pressable onPress={() => setError('')} accessibilityRole="button" accessibilityLabel="Dismiss message"><Text style={{ color: theme.muted, paddingHorizontal: 4 }}>×</Text></Pressable>
      </View> : null}

      {!dataReady ? <View style={styles.loadError}><Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Your local library could not be opened.</Text>
        <Text style={{ color: theme.muted }}>{error || 'Try loading your Play data again.'}</Text><ActionButton label="Retry loading" onPress={refresh} theme={theme} variant="primary" /></View>
        : page === 'board' ? <BoardScreen key={dataRevision} theme={theme} collection={boards} clips={clips} onChange={updateBoards} newBoardRequest={newBoardRequest}
        onPlay={playClip} onCreate={(boardId, padId, initialAction) => {
          const expectedClipId = padId === undefined ? undefined : boards.boards.find((board) => board.id === boardId)?.pads.find((pad) => pad.id === padId)?.clipId;
          startCreation({ boardId, padId, expectedClipId }, initialAction);
        }} onAddClip={() => startCreation(null)} onAppearance={() => setSettingsVisible(true)} onPlaybackOptions={(soundId) => setPlaybackSoundId(soundId)}
          onOpenLibrary={(target) => {
            const expectedClipId = target?.padId === undefined ? undefined : boards.boards.find((board) => board.id === target.boardId)?.pads.find((pad) => pad.id === target.padId)?.clipId;
            setAssignmentTarget(target ? { ...target, expectedClipId } : null); setPage('library');
          }} /> :
        page === 'editor' ? <EditorScreen theme={theme} onCreate={(initialAction) => startCreation(null, initialAction)} /> :
        <LibraryScreen theme={theme} clips={clips} boards={boards} assignmentTarget={assignmentTarget} onPlay={(clip) => playClip(clip)} onCreate={(initialAction) => startCreation(assignmentTarget, initialAction)} onPlaybackOptions={(clip) => setPlaybackSoundId(clip.id)}
          onImportSoundbites={async (signal) => { const result = await importSoundbites(signal); if (result) refresh(); return result; }}
          onChangeArtwork={(clip, artwork) => { try { commitDraftArtwork(clip.id, artwork, true); refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this artwork.'); } finally { disposeDraftArtwork(artwork); } }}
          onRename={(clip, title) => { try { renameLocalClip(clip.id, title.trim()); refresh(); } catch (cause) { Alert.alert('Could not rename sound', cause instanceof Error ? cause.message : 'Try again.'); } }}
          onDelete={(clip) => { try { deleteLocalClip(clip.id); refresh(); } catch (cause) { Alert.alert('Could not delete sound', cause instanceof Error ? cause.message : 'Try again.'); } }}
          onAddToBoard={(clip, boardId, padId) => { try { setBoards(addClipToBoard(clip.id, boardId, padId)); setPage('board'); setAssignmentTarget(null); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add this sound to the board.'); } }}
          onAssignToTarget={(clip, target) => { try {
            const current = target.padId === undefined ? undefined : loadBoards().boards.find((board) => board.id === target.boardId)?.pads.find((pad) => pad.id === target.padId)?.clipId;
            if (target.padId !== undefined && target.expectedClipId !== undefined && current !== target.expectedClipId) throw new Error('The selected pad changed while you were browsing. Review the pad before trying again.');
            setBoards(addClipToBoard(clip.id, target.boardId, target.padId)); setPage('board'); setAssignmentTarget(null); setError('');
          } catch (cause) { setError(cause instanceof Error ? cause.message : target.padId ? 'Could not add this sound to the selected pad.' : 'Could not add this sound to the board.'); } }} />}
      </View>
      </View>

      <SettingsModal visible={settingsVisible} theme={theme} appearance={appearance} bottomInset={78 + (playback.active ? 48 + 14 : 0)} onBusyChange={setSettingsBusy} onClose={() => setSettingsVisible(false)} onDataChanged={applyRestoredSettings}
        onAppearanceChange={(option) => { setAppearance(option); try { savePlayPreferences({ appearance: option }, isDeviceAudioCaptureSupported()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save appearance preference.'); } }} />

      {playback.active ? <Pressable accessibilityRole="button" accessibilityLabel="Stop all sounds" onPress={stop} style={[styles.stopAll, { backgroundColor: theme.surface, borderColor: theme.danger }]}><Icon name="stop" size={17} color={theme.danger} /><Text style={{ color: theme.danger, fontWeight: '800', fontSize: 12 }}>Stop all</Text></Pressable> : null}
      {dataReady ? <View style={[styles.bottomBar, { backgroundColor: theme.navSurface, borderColor: theme.border }]}>
        <NavButton label="Board" active={page === 'board'} theme={theme} disabled={settingsVisible && settingsBusy} onPress={() => { if (settingsBusy) return; setSettingsVisible(false); setAssignmentTarget(null); setPage('board'); }}><BoardIcon size={29} color={page === 'board' ? theme.accent : theme.muted} /></NavButton>
        <NavButton label="Editor" active={page === 'editor'} theme={theme} disabled={settingsVisible && settingsBusy} onPress={() => { if (settingsBusy) return; setSettingsVisible(false); setAssignmentTarget(null); setPage('editor'); }}><EditorIcon size={29} color={page === 'editor' ? theme.accent : theme.muted} /></NavButton>
        <NavButton label="Library" active={page === 'library'} theme={theme} disabled={settingsVisible && settingsBusy} onPress={() => { if (settingsBusy) return; setSettingsVisible(false); setAssignmentTarget(null); setPage('library'); }}><LibraryIcon size={29} color={page === 'library' ? theme.accent : theme.muted} /></NavButton>
      </View> : null}
    </View>
    <Modal visible={appOptionsMenu} transparent animationType="none" statusBarTranslucent onRequestClose={() => setAppOptionsMenu(false)}>
      <View style={styles.appOptionsRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAppOptionsMenu(false)} accessibilityRole="button" accessibilityLabel="Close app options" />
        <View style={[styles.optionsMenu, { left: appOptionsPosition.left, top: appOptionsPosition.top, backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable accessibilityRole="button" onPress={() => { setAppOptionsMenu(false); setSettingsVisible(true); }} style={styles.optionsRow}>
            <Icon name="spark" size={17} color={theme.accent} /><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Settings</Text>
          </Pressable>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
          <Pressable accessibilityRole="button" onPress={() => { setAppOptionsMenu(false); setAssignmentTarget(null); setPendingNewBoard(true); setPage('board'); }} style={styles.optionsRow}>
            <Icon name="plus" size={17} color={theme.accent} /><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>New board</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    <ClipPlaybackOptionsModal visible={playbackSoundId !== null} soundId={playbackSoundId} soundName={clips.find((clip) => clip.id === playbackSoundId)?.title} theme={theme} onClose={closePlaybackOptions} />
  </SafeAreaView></SafeAreaProvider>;
}

function NavButton({ label, active, theme, disabled = false, onPress, children }: { label: string; active: boolean; theme: ReturnType<typeof useTheme>['theme']; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} accessibilityLabel={label}
    style={[styles.navItem, disabled && { opacity: 0.55 }]}>
    {children}
    <Text style={{ color: active ? theme.accent : theme.muted, fontSize: 12, fontWeight: '700' }}>{label.toUpperCase()}</Text>
    <View style={[styles.navIndicator, { backgroundColor: active ? theme.accent : 'transparent' }]} />
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, shell: { flex: 1, paddingHorizontal: 23, paddingTop: 2, gap: 14 }, flow: { flex: 1, paddingHorizontal: 23, paddingTop: 8 },
  appOptionsRoot: { flex: 1 }, optionsMenu: { position: 'absolute', width: 190, borderWidth: 1, borderRadius: 14, paddingVertical: 4, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 14 }, optionsRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }, loadError: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 24 },
  notice: { minHeight: 50, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', flexDirection: 'row', gap: 10 }, retryButton: { minHeight: 40, minWidth: 68, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { height: 78, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8, marginHorizontal: -23 }, navItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2, paddingBottom: 8, position: 'relative' }, navIndicator: { position: 'absolute', bottom: 5, height: 4, width: 70, borderRadius: 2 },
  stopAll: { minHeight: 48, alignSelf: 'flex-end', borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
});
