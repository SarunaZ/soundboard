import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { play, stop } from '../app-client/src/audio/engine';
import { addClipToBoard, loadBoards, type BoardCollection } from './src/data/boards';
import { emptyBoardCollection } from './src/data/boardModel';
import { deleteLocalClip, loadLocalClips, renameLocalClip, setLocalClipPresentation, type LocalClip } from './src/data/library';
import { loadPlayPreferences, savePlayPreferences } from './src/data/preferences';
import { commitDraftArtwork, disposeDraftArtwork, type DraftArtwork } from './src/media/artwork';
import { CreateFlow, type AssignmentTarget, type InitialAction } from './src/ui/CreateFlow';
import { ActionButton } from './src/ui/controls';
import { BoardScreen } from './src/ui/BoardScreen';
import { EditorScreen } from './src/ui/EditorScreen';
import { LibraryScreen } from './src/ui/LibraryScreen';
import { useTheme, type Appearance } from './src/ui/theme';

type Page = 'board' | 'editor' | 'library';

export default function App() {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try { return loadPlayPreferences().appearance; } catch { return 'system'; }
  });
  const { theme, isDark } = useTheme(appearance);
  const [page, setPage] = useState<Page>('board');
  const [boards, setBoards] = useState<BoardCollection>(() => emptyBoardCollection());
  const [clips, setClips] = useState<LocalClip[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [flow, setFlow] = useState<{ target: AssignmentTarget; key: number; initialAction?: InitialAction } | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<AssignmentTarget>(null);
  const [retry, setRetry] = useState<{ clip: LocalClip; target: AssignmentTarget } | null>(null);
  const [error, setError] = useState('');
  const [appearanceMenu, setAppearanceMenu] = useState(false);

  const refresh = useCallback(() => {
    try { setBoards(loadBoards()); setClips(loadLocalClips()); setDataReady(true); }
    catch (cause) { setDataReady(false); setError(cause instanceof Error ? cause.message : 'Could not read your Play library.'); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateBoards = useCallback((next: BoardCollection) => {
    setBoards(next);
    setError('');
  }, []);

  const startCreation = useCallback((target: AssignmentTarget, initialAction?: InitialAction) => {
    if (!dataReady) { setError('Load your Play data before creating a sound.'); return; }
    setFlow({ target, key: Date.now(), initialAction });
  }, [dataReady]);
  const cancelCreation = useCallback(() => { setFlow(null); refresh(); }, [refresh]);

  const playClip = useCallback((clip: LocalClip, padId?: string) => {
    if (clip.missing) { setError('This sound file is unavailable. Remove it from Library and import it again.'); return; }
    void play(clip.uri, padId ?? clip.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not play this sound.'));
  }, []);

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
      {page === 'board' ? <View style={styles.topBar}>
        <View><Text accessibilityLabel="Stimmyz" style={styles.brand}><Text style={{ color: theme.secondary }}>Stimmyz</Text><Text style={[styles.brandSparkle, { color: theme.primary }]}>{' ✦'}</Text></Text><Text style={{ color: theme.muted }}>Soundboard</Text></View>
      </View> : null}

      {error ? <View style={[styles.notice, { borderColor: retry ? theme.danger : theme.border, backgroundColor: theme.surface }]}>
        <Text accessibilityLiveRegion="polite" style={{ color: theme.text, flex: 1 }}>{error}</Text>
        {retry ? <Pressable accessibilityRole="button" onPress={retryAssignment} style={[styles.retryButton, { backgroundColor: theme.danger }]}><Text style={{ color: '#fff', fontWeight: '800' }}>Retry</Text></Pressable> : null}
        <Pressable onPress={() => setError('')} accessibilityRole="button" accessibilityLabel="Dismiss message"><Text style={{ color: theme.muted, paddingHorizontal: 4 }}>×</Text></Pressable>
      </View> : null}

      {!dataReady ? <View style={styles.loadError}><Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Your local library could not be opened.</Text>
        <Text style={{ color: theme.muted }}>{error || 'Try loading your Play data again.'}</Text><ActionButton label="Retry loading" onPress={refresh} theme={theme} variant="primary" /></View>
        : page === 'board' ? <BoardScreen theme={theme} collection={boards} clips={clips} onChange={updateBoards}
        onPlay={playClip} onCreate={(boardId, padId) => {
          const expectedClipId = padId === undefined ? undefined : boards.boards.find((board) => board.id === boardId)?.pads.find((pad) => pad.id === padId)?.clipId;
          startCreation({ boardId, padId, expectedClipId });
        }} onAddClip={() => startCreation(null)} onAppearance={() => setAppearanceMenu(true)}
          onOpenLibrary={(target) => {
            const expectedClipId = target?.padId === undefined ? undefined : boards.boards.find((board) => board.id === target.boardId)?.pads.find((pad) => pad.id === target.padId)?.clipId;
            setAssignmentTarget(target ? { ...target, expectedClipId } : null); setPage('library');
          }} /> :
        page === 'editor' ? <EditorScreen theme={theme} onCreate={(initialAction) => startCreation(null, initialAction)} /> :
        <LibraryScreen theme={theme} clips={clips} boards={boards} assignmentTarget={assignmentTarget} onAppearance={() => setAppearanceMenu(true)} onPlay={(clip) => playClip(clip)} onCreate={() => startCreation(assignmentTarget)}
          onRename={(clip, title) => { try { renameLocalClip(clip.id, title.trim()); refresh(); } catch (cause) { Alert.alert('Could not rename sound', cause instanceof Error ? cause.message : 'Try again.'); } }}
          onDelete={(clip) => { try { deleteLocalClip(clip.id); refresh(); } catch (cause) { Alert.alert('Could not delete sound', cause instanceof Error ? cause.message : 'Try again.'); } }}
          onAddToBoard={(clip, boardId, padId) => { try { setBoards(addClipToBoard(clip.id, boardId, padId)); setPage('board'); setAssignmentTarget(null); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add this sound to the board.'); } }}
          onAssignToTarget={(clip, target) => { try {
            const current = target.padId === undefined ? undefined : loadBoards().boards.find((board) => board.id === target.boardId)?.pads.find((pad) => pad.id === target.padId)?.clipId;
            if (target.padId !== undefined && target.expectedClipId !== undefined && current !== target.expectedClipId) throw new Error('The selected pad changed while you were browsing. Review the pad before trying again.');
            setBoards(addClipToBoard(clip.id, target.boardId, target.padId)); setPage('board'); setAssignmentTarget(null); setError('');
          } catch (cause) { setError(cause instanceof Error ? cause.message : target.padId ? 'Could not add this sound to the selected pad.' : 'Could not add this sound to the board.'); } }} />}

      {dataReady ? <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <NavButton label="Board" icon="▦" active={page === 'board'} theme={theme} onPress={() => { setAssignmentTarget(null); setPage('board'); }} />
        <NavButton label="Editor" icon="＋" active={page === 'editor'} theme={theme} onPress={() => { setAssignmentTarget(null); setPage('editor'); }} />
        <NavButton label="Library" icon="♫" active={page === 'library'} theme={theme} onPress={() => { setAssignmentTarget(null); setPage('library'); }} />
      </View> : null}
    </View>
    <ModalWrapper visible={appearanceMenu} onClose={() => setAppearanceMenu(false)} theme={theme}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Appearance</Text>
      <Text style={{ color: theme.muted }}>Choose how Stimmyz follows light and dark mode.</Text>
      {(['system', 'dark', 'light'] as Appearance[]).map((option) => <ActionButton key={option} label={`${option === 'system' ? 'System' : option[0]!.toUpperCase() + option.slice(1)}${appearance === option ? ' · Current' : ''}`}
        onPress={() => { setAppearance(option); try { const current = loadPlayPreferences(); savePlayPreferences({ ...current, appearance: option }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save appearance preference.'); } setAppearanceMenu(false); }} theme={theme} variant={appearance === option ? 'primary' : 'secondary'} />)}
    </ModalWrapper>
  </SafeAreaView></SafeAreaProvider>;
}

function NavButton({ label, icon, active, theme, onPress }: { label: string; icon: string; active: boolean; theme: ReturnType<typeof useTheme>['theme']; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}
    style={styles.navItem}>
    <Text style={{ color: active ? theme.secondary : theme.muted, fontSize: 18, fontWeight: '800' }}>{icon}</Text>
    <Text style={{ color: active ? theme.secondary : theme.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    <View style={[styles.navIndicator, { backgroundColor: active ? theme.secondary : 'transparent' }]} />
  </Pressable>;
}

function ModalWrapper({ visible, onClose, theme, children }: { visible: boolean; onClose: () => void; theme: ReturnType<typeof useTheme>['theme']; children: ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.scrim}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.modal, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, shell: { flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 14 }, flow: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  topBar: { minHeight: 46, flexDirection: 'row', alignItems: 'center' }, brand: { fontSize: 32, lineHeight: 39, fontWeight: '900', letterSpacing: -1.4 }, brandSparkle: { fontSize: 20 }, loadError: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 24 },
  notice: { minHeight: 50, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', flexDirection: 'row', gap: 10 }, retryButton: { minHeight: 40, minWidth: 68, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { minHeight: 76, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8, paddingTop: 5, paddingBottom: 8, marginHorizontal: -16 }, navItem: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2 }, navIndicator: { height: 3, width: 28, borderRadius: 2, marginTop: 1 },
  scrim: { ...StyleSheet.absoluteFill, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }, modal: { alignSelf: 'center', width: '100%', maxWidth: 420, borderRadius: 22, borderWidth: 1, padding: 18, gap: 12 },
});
