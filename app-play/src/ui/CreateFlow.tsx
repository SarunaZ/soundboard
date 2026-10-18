import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { play, stop } from '../../../app-client/src/audio/engine';
import { useKeyboardInputReveal } from '../../../app-client/src/keyboard/useKeyboardInputReveal';
import { disposeLocalAudioSource, pickLocalAudioSource, renderLocalAudioRange, saveLocalAudioRender, type LocalAudioRender, type LocalAudioSource } from '../media/localAudio';
import { createLocalAudioRecorder } from '../media/recording';
import { disposeDraftArtwork, type DraftArtwork } from '../media/artwork';
import type { LocalClip } from '../data/library';
import { ActionButton, Heading, Panel, TextField } from './controls';
import type { Theme } from './theme';
import { contrastForeground, iconChoices, padColors } from './theme';
import { formatTime, Waveform } from './Waveform';
import { ArtworkPicker } from './ArtworkPicker';

export type AssignmentTarget = { boardId: string; padId?: string; expectedClipId?: string | null } | null;
export type InitialAction = 'file' | 'record';
type Step = 'source' | 'trim' | 'customize';

function waitForForeground(signal: AbortSignal): Promise<boolean> {
  if (AppState.currentState === 'active') return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish(true);
    });
    const onAbort = () => finish(false);
    const finish = (active: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscription.remove();
      signal.removeEventListener('abort', onAbort);
      resolve(active);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => finish(AppState.currentState === 'active'), 2000);
    if (signal.aborted) finish(false);
  });
}

export function CreateFlow({ theme, target, initialAction, onCancel, onSaved }: {
  theme: Theme; target: AssignmentTarget; initialAction?: InitialAction; onCancel: () => void; onSaved: (clip: LocalClip, target: AssignmentTarget, artwork?: DraftArtwork) => Promise<boolean>;
}) {
  const [step, setStep] = useState<Step>('source');
  const [source, setSource] = useState<LocalAudioSource | null>(null);
  const [render, setRender] = useState<LocalAudioRender | null>(null);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [fineTune, setFineTune] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(iconChoices[0]!.id);
  const [color, setColor] = useState(padColors[6]!);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [message, setMessage] = useState('');
  const [artwork, setArtwork] = useState<DraftArtwork | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imagePreparing, setImagePreparing] = useState(false);
  const [artworkImageFailed, setArtworkImageFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const sourceRef = useRef<LocalAudioSource | null>(null);
  const artworkRef = useRef<DraftArtwork | null>(null);
  const pendingCaptureRef = useRef<LocalAudioSource | null>(null);
  const saveLocked = useRef(false);
  const recorderRef = useRef<ReturnType<typeof createLocalAudioRecorder> | null>(null);
  const recordingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const permissionPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const initialActionStartedRef = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const nameInputRef = useRef<TextInput | null>(null);
  const keyboardReveal = useKeyboardInputReveal(scrollRef, true);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (Keyboard.isVisible()) { Keyboard.dismiss(); return true; }
      if (pickerOpen) { setPickerOpen(false); setImagePreparing(false); return true; }
      if (recorderRef.current) { confirmDiscardRecording(); return true; }
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [step, busy, source, pickerOpen]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controller.current?.abort();
      stop();
      recordingRef.current = false;
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder) void recorder.cancel().finally(() => recorder.dispose());
      const current = sourceRef.current;
      if (current) void disposeLocalAudioSource(current);
      const pending = pendingCaptureRef.current;
      pendingCaptureRef.current = null;
      if (pending) void disposeLocalAudioSource(pending);
      const draftArtwork = artworkRef.current;
      artworkRef.current = null;
      if (draftArtwork) disposeDraftArtwork(draftArtwork);
    };
  }, []);

  useEffect(() => {
    if (!initialAction || initialActionStartedRef.current) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled || !mountedRef.current || initialActionStartedRef.current) return;
      initialActionStartedRef.current = true;
      const op = new AbortController();
      controller.current = op;
      void waitForForeground(op.signal).then((foreground) => {
        if (!foreground || op.signal.aborted || !mountedRef.current) return;
        if (initialAction === 'file') void chooseSource();
        else void startRecording();
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [initialAction]);

  useEffect(() => {
    const timer = setInterval(() => {
      const recorder = recorderRef.current;
      if (recorder && recordingRef.current) {
        const status = recorder.getStatus();
        setRecordingElapsedMs(status.elapsedMs);
        if (status.error) {
          recordingRef.current = false; setRecording(false); setRecordingStopped(false); setMessage(status.error);
          void discardActiveRecording();
        } else if (!status.isRecording) {
          recordingRef.current = false; setRecording(false); setRecordingStopped(true);
          setMessage('Recording reached its 5-minute limit. Stop and use it, or discard it.');
        }
      }
    }, 250);
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active' && recorderRef.current) {
        void interruptRecording();
      }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  async function discardActiveRecording() {
    recordingRef.current = false;
    setRecording(false);
    setRecordingStopped(false);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      await recorder.cancel().catch(() => {});
      await recorder.dispose().catch(() => {});
    }
    setRecordingElapsedMs(0);
  }

  function confirmDiscardRecording() {
    Alert.alert('Discard recording?', 'The recording will be stopped and deleted. Your existing draft will be kept.', [
      { text: 'Keep recording', style: 'cancel' },
      { text: 'Discard recording', style: 'destructive', onPress: () => { void discardActiveRecording().then(() => setMessage('Recording discarded. Nothing was saved.')); } },
    ]);
  }

  async function interruptRecording() {
    controller.current?.abort();
    await discardActiveRecording();
    if (mountedRef.current) setMessage('Recording stopped when the app was interrupted. Nothing was saved.');
  }

  async function startRecording() {
    if (busy || recorderRef.current || permissionPendingRef.current) return;
    const op = new AbortController(); controller.current = op;
    permissionPendingRef.current = true;
    setBusy(true); setMessage('Allow microphone access to record a sound.');
    let recorder: ReturnType<typeof createLocalAudioRecorder> | null = null;
    try {
      const currentPermission = await getRecordingPermissionsAsync();
      const permission = currentPermission.granted ? currentPermission : await requestRecordingPermissionsAsync();
      permissionPendingRef.current = false;
      if (!mountedRef.current || op.signal.aborted) return;
      if (!permission.granted) {
        setMessage('Microphone access is off. Allow microphone access in your device settings, then try again.');
        return;
      }
      if (!(await waitForForeground(op.signal)) || op.signal.aborted || !mountedRef.current) {
        setMessage('Return to the app to start recording. Nothing was recorded.');
        return;
      }
      appStateRef.current = 'active';
      recorder = createLocalAudioRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      if (recorderRef.current !== recorder || op.signal.aborted || !mountedRef.current || AppState.currentState !== 'active') {
        await recorder.cancel().catch(() => {}); await recorder.dispose().catch(() => {}); recorderRef.current = null;
        if (mountedRef.current) setMessage('Recording could not start because the app left the foreground. Nothing was saved.');
        return;
      }
      recordingRef.current = true;
      setRecording(true); setRecordingStopped(false); setRecordingElapsedMs(0); setMessage('');
    } catch (error) {
      if (recorder) {
        if (recorderRef.current === recorder) recorderRef.current = null;
        await recorder.cancel().catch(() => {});
        await recorder.dispose().catch(() => {});
      }
      const detail = error instanceof Error ? error.message : 'Microphone access was not available.';
      if (mountedRef.current) setMessage(detail);
    } finally { permissionPendingRef.current = false; if (mountedRef.current) setBusy(false); }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || (!recordingRef.current && !recordingStopped) || busy) return;
    recordingRef.current = false; setRecording(false); setRecordingStopped(false); setBusy(true); setMessage('Preparing your recording…');
    const op = new AbortController(); controller.current = op;
    try {
      const captured = await recorder.stop(op.signal);
      await recorder.dispose().catch(() => {});
      pendingCaptureRef.current = captured;
      if (op.signal.aborted) { pendingCaptureRef.current = null; void disposeLocalAudioSource(captured); return; }
      recorderRef.current = null;
      const current = sourceRef.current;
      if (current) {
        Alert.alert('Use this recording?', 'This will replace the current draft. You can keep the existing draft instead.', [
          { text: 'Keep existing draft', style: 'cancel', onPress: () => {
            if (pendingCaptureRef.current === captured) pendingCaptureRef.current = null;
            void disposeLocalAudioSource(captured);
            setBusy(false); setMessage('Recording discarded. Your existing draft is ready.');
          } },
          { text: 'Use recording', onPress: () => { void adoptRecording(captured); } },
        ]);
      } else {
        await adoptRecording(captured);
      }
    } catch (error) {
      await recorder.cancel().catch(() => {});
      await recorder.dispose().catch(() => {});
      recorderRef.current = null;
      if (!op.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not finish this recording. Try again.');
      setBusy(false);
    }
  }

  async function adoptRecording(captured: LocalAudioSource) {
    if (pendingCaptureRef.current === captured) pendingCaptureRef.current = null;
    if (!mountedRef.current) { await disposeLocalAudioSource(captured); return; }
    const current = sourceRef.current;
    if (current) await disposeLocalAudioSource(current);
    if (!mountedRef.current) { await disposeLocalAudioSource(captured); return; }
    clearArtwork();
    sourceRef.current = captured; setSource(captured); setName('My recording'); setStartMs(0); setEndMs(Math.min(60_000, captured.durationMs)); setRender(null); setFineTune(false); setStep('trim'); setMessage(''); setBusy(false); setRecordingElapsedMs(0);
  }

  function requestCancel() {
    if (permissionPendingRef.current) {
      controller.current?.abort(); permissionPendingRef.current = false; setBusy(false);
      if (sourceRef.current) setMessage('Microphone request cancelled. Your existing draft is ready.');
      else onCancel();
      return;
    }
    if (recorderRef.current) { confirmDiscardRecording(); return; }
    if (saveLocked.current) { setMessage('Saving is in progress. Please wait before leaving.'); return; }
    if (busy && !sourceRef.current) {
      controller.current?.abort();
      onCancel();
      return;
    }
    if (busy) { setMessage('Please wait for the current operation to finish.'); return; }
    if (!sourceRef.current) { onCancel(); return; }
    Alert.alert('Discard this sound?', 'Your current trim and name will be removed.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { controller.current?.abort(); onCancel(); } },
    ]);
  }

  function goBack() {
    if (permissionPendingRef.current) { requestCancel(); return; }
    if (recorderRef.current) { confirmDiscardRecording(); return; }
    if (busy && sourceRef.current) { setMessage(saveLocked.current ? 'Saving is in progress. Please wait before leaving.' : 'Please wait for the current operation to finish.'); return; }
    if (step === 'customize') setStep('trim');
    else if (step === 'trim') setStep('source');
    else requestCancel();
  }

  async function chooseSource() {
    controller.current?.abort();
    const previous = sourceRef.current;
    const previousStep = step;
    setBusy(true); setMessage('Choose one audio file to begin.'); setStep('source');
    const op = new AbortController(); controller.current = op;
    try {
      const picked = await pickLocalAudioSource(op.signal);
      if (!picked) { if (!op.signal.aborted) { setBusy(false); setStep(previousStep); setMessage(''); } return; }
      if (op.signal.aborted) { void disposeLocalAudioSource(picked); return; }
      if (previous) await disposeLocalAudioSource(previous);
      if (op.signal.aborted) { void disposeLocalAudioSource(picked); return; }
      clearArtwork();
      sourceRef.current = picked; setSource(picked); setName(picked.title.slice(0, 100)); setStartMs(0); setEndMs(Math.min(60_000, picked.durationMs)); setRender(null); setFineTune(false); setStep('trim'); setMessage('');
    } catch (error) { if (!op.signal.aborted) { setStep(previousStep); setMessage(error instanceof Error ? error.message : 'Could not open that audio file.'); } }
    finally { if (!op.signal.aborted) setBusy(false); }
  }

  function setRange(start: number, end: number) {
    stop();
    setStartMs(start); setEndMs(end); setRender(null);
  }

  function nudge(which: 'start' | 'end', amount: number) {
    if (!source) return;
    const minimum = Math.min(100, source.durationMs);
    const maximum = Math.min(60_000, source.durationMs);
    if (which === 'start') setRange(Math.max(Math.max(0, endMs - maximum), Math.min(endMs - minimum, startMs + amount)), endMs);
    else setRange(startMs, Math.min(source.durationMs, Math.max(startMs + minimum, Math.min(startMs + maximum, endMs + amount))));
  }

  async function preview() {
    if (!source) return;
    const op = new AbortController(); controller.current = op;
    setBusy(true); setMessage('Preparing preview…');
    try {
      const previewRange = await renderLocalAudioRange(source, startMs, endMs, op.signal);
      if (op.signal.aborted) return;
      setRender(previewRange);
      await play(previewRange.uri, `preview-${source.id}`);
      setMessage('Preview playing.');
    }
    catch (error) { if (!op.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not preview this file.'); }
    finally { if (!op.signal.aborted) setBusy(false); }
  }

  async function renderRange() {
    if (!source) return;
    const op = new AbortController(); controller.current = op; setBusy(true); setMessage('Rendering your selection…');
    try {
      const rendered = await renderLocalAudioRange(source, startMs, endMs, op.signal);
      if (op.signal.aborted) return;
      setRender(rendered); setStep('customize'); setMessage('');
    } catch (error) {
      if (!op.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not render this range.');
    } finally { if (!op.signal.aborted) setBusy(false); }
  }

  async function save() {
    if (!source || !render || saveLocked.current || imagePreparing) return;
    const cleanName = name.trim();
    if (!cleanName) { setMessage('Give this sound a name before saving.'); return; }
    saveLocked.current = true;
    const op = new AbortController(); controller.current = op; setBusy(true); setMessage('Saving to Library…');
    try {
      const clip = await saveLocalAudioRender(source, render, cleanName, op.signal);
      if (op.signal.aborted) return;
      try {
        const assigned = await onSaved({ ...clip, icon, color }, target, artworkRef.current ?? undefined);
        // The app callback owns the local artwork after it copies it into library storage.
        artworkRef.current = null;
        setArtwork(null);
        setMessage(assigned ? 'Saved to your Library and board.' : 'Saved to Library. Board assignment failed; retry is available.');
      } catch {
        setMessage('Saved to Library. Board assignment failed; retry is available.');
      }
      onCancel();
    } catch (error) {
      if (!op.signal.aborted) {
        setMessage(error instanceof Error ? error.message : 'Could not save this sound. You can retry.');
        saveLocked.current = false;
      }
    } finally { if (!op.signal.aborted) setBusy(false); }
  }

  function clearArtwork() {
    const previous = artworkRef.current;
    artworkRef.current = null;
    setArtwork(null);
    if (previous) disposeDraftArtwork(previous);
  }

  function adoptArtwork(next: DraftArtwork) {
    const previous = artworkRef.current;
    artworkRef.current = next;
    setArtwork(next);
    setArtworkImageFailed(false);
    if (previous) disposeDraftArtwork(previous);
    setMessage('');
  }

  const steps: Array<{ id: Step; label: string }> = [{ id: 'source', label: 'Source' }, { id: 'trim', label: 'Trim' }, { id: 'customize', label: 'Customize' }];
  const activeIndex = steps.findIndex((item) => item.id === step);
  const activeIcon = iconChoices.find((choice) => choice.id === icon)?.glyph ?? '♫';

  return <View style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={goBack} disabled={busy && Boolean(source) && !recordingRef.current} accessibilityRole="button" accessibilityLabel={recording ? 'Discard recording' : step === 'source' ? 'Cancel sound creation' : 'Back'} style={[styles.back, { borderColor: theme.border }]}><Text style={{ color: theme.text, fontSize: 22 }}>{step === 'source' ? '×' : '‹'}</Text></Pressable>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Create a sound</Text>
      {step !== 'source' ? <Pressable onPress={requestCancel} disabled={busy && Boolean(source)} accessibilityRole="button" accessibilityLabel="Discard sound creation" style={[styles.back, { borderColor: theme.border }]}><Text style={{ color: theme.text, fontSize: 22 }}>×</Text></Pressable> : null}
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={`${steps[activeIndex]!.label}, step ${activeIndex + 1} of 3`} style={styles.progress}>
      <View pointerEvents="none" style={styles.connectorLayer}>
        <View style={[styles.connector, { backgroundColor: activeIndex > 0 ? theme.primary : theme.border }]} />
        <View style={[styles.connector, { backgroundColor: activeIndex > 1 ? theme.primary : theme.border }]} />
      </View>
      {steps.map((item, index) => <View key={item.id} style={styles.progressItem}>
        <View style={[styles.progressDot, { backgroundColor: index <= activeIndex ? theme.primary : theme.raised, borderColor: index <= activeIndex ? theme.primary : theme.border }]}><Text style={{ color: index <= activeIndex ? '#fff' : theme.muted, fontSize: 12, fontWeight: '800' }}>{index + 1}</Text></View>
        <Text numberOfLines={2} style={{ color: index === activeIndex ? theme.text : theme.muted, fontWeight: index === activeIndex ? '800' : '500', textAlign: 'center', flexShrink: 1 }}>{item.label}</Text>
      </View>)}
    </View>
    <ScrollView ref={scrollRef} style={styles.scroll} onLayout={keyboardReveal.onViewportLayout} onScroll={keyboardReveal.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {step === 'source' ? <View style={styles.sourceScreen}>
        {!recording && !recordingStopped ? <>
          <Heading title="Where’s your sound from?" subtitle="Make a clip in just a few steps." theme={theme} />
          <Pressable onPress={() => void chooseSource()} disabled={busy} accessibilityRole="button" accessibilityLabel="Choose file, import audio from this device" style={[styles.sourceCard, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <View style={[styles.sourceIcon, { backgroundColor: theme.raised }]}><Text style={{ fontSize: 26 }}>📁</Text></View><View style={styles.sourceCardCopy}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Choose file</Text><Text style={{ color: theme.muted }}>Import audio from this device</Text></View><Text style={{ color: theme.text, fontSize: 22 }}>›</Text>
          </Pressable>
          <Pressable onPress={() => void startRecording()} disabled={busy} accessibilityRole="button" accessibilityLabel="Record a sound using the phone microphone" style={[styles.sourceCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}>
            <View style={[styles.sourceIcon, { backgroundColor: theme.raised }]}><Text style={{ fontSize: 26 }}>🎙</Text></View><View style={styles.sourceCardCopy}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Record a sound</Text><Text style={{ color: theme.muted }}>Use your phone microphone</Text></View><Text style={{ color: theme.text, fontSize: 22 }}>›</Text>
          </Pressable>
          {source ? <Panel theme={theme} style={styles.currentDraft}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>Current draft</Text><Text style={{ color: theme.muted }} numberOfLines={1}>{source.title} · {formatTime(source.durationMs)}</Text>
            <ActionButton label="Continue editing this draft" onPress={() => { setStep('trim'); setMessage(''); }} theme={theme} variant="primary" disabled={busy} />
          </Panel> : null}
        </> : null}
        {recording || recordingStopped ? <Panel theme={theme} style={styles.recordingPanel}>
          <View style={styles.recordingHeadline}><View style={styles.recordingDot} /><Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{recordingStopped ? 'Recording stopped' : 'Recording'}</Text></View>
          <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '800' }}>{formatTime(recordingElapsedMs)}</Text>
          <Text style={{ color: theme.muted }}>{recordingStopped ? 'The recording reached the 5-minute limit.' : 'Keep this screen open. Recording stops if you leave the app.'}</Text>
          <ActionButton label={recordingStopped ? 'Use recording' : 'Stop & use recording'} onPress={() => void stopRecording()} theme={theme} variant="primary" disabled={busy} />
          <ActionButton label="Cancel recording" onPress={confirmDiscardRecording} theme={theme} variant="secondary" />
        </Panel> : null}
      </View> : null}

      {step === 'trim' && source ? <>
        <View style={[styles.compactSource, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.compactSourceIcon, { backgroundColor: theme.raised }]}><Text style={{ color: theme.focus, fontSize: 22 }}>{source.title === 'Microphone recording' ? '🎙' : '♫'}</Text></View>
          <View style={styles.compactSourceText}><Text style={{ color: theme.text, fontWeight: '800' }} numberOfLines={1}>{source.title}</Text><Text style={{ color: theme.muted }}>{formatTime(source.durationMs)} total · Trim up to 60 seconds</Text></View>
        </View>
        <View style={[styles.waveCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Waveform peaks={source.peaks} durationMs={source.durationMs} startMs={startMs} endMs={endMs} onChange={setRange} theme={theme} />
          <ActionButton label="Preview selection" icon="▶" onPress={() => void preview()} theme={theme} disabled={busy} />
        </View>
        <Panel theme={theme} style={styles.finePanel}>
          <Pressable onPress={() => setFineTune(!fineTune)} disabled={busy} accessibilityRole="button" accessibilityState={{ expanded: fineTune }} accessibilityLabel={fineTune ? 'Hide fine tune controls' : 'Show fine tune controls'} style={styles.fineDisclosure}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{fineTune ? '⌄' : '›'}  Fine tune <Text style={{ color: theme.muted, fontWeight: '500' }}>(optional)</Text></Text>
            <Text style={{ color: theme.focus, fontWeight: '700' }}>{formatTime(endMs - startMs)}</Text>
          </Pressable>
          {fineTune ? <View style={styles.fineControls}>
            {(['start', 'end'] as const).map((which) => <View key={which} style={styles.tuneSection}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{which === 'start' ? 'Start' : 'End'} · {formatTime(which === 'start' ? startMs : endMs)}</Text>
              <View style={styles.tuneButtons}>
                {([[-1000, '−1 s'], [-100, '−100 ms'], [100, '+100 ms'], [1000, '+1 s']] as const).map(([amount, label]) => <Pressable key={label} onPress={() => nudge(which, amount)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${label} ${which}`} style={({ pressed }) => [styles.tuneButton, { backgroundColor: theme.raised, borderColor: theme.border, opacity: busy ? 0.45 : pressed ? 0.72 : 1 }]}><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text, fontWeight: '700', textAlign: 'center' }}>{label}</Text></Pressable>)}
              </View>
            </View>)}
          </View> : null}
        </Panel>
      </> : null}

      {step === 'customize' && source && render ? <>
        <Panel theme={theme} style={styles.card}>
          <Heading title="Make it yours" subtitle={`${formatTime(render.durationMs)} clip`} theme={theme} />
          <View style={styles.previewWrap} accessibilityLabel={`Live pad preview: ${name.trim() || 'Sound name'}${artwork ? `, image ${artwork.title}` : ''}`}>
            <View style={[styles.padPreview, { backgroundColor: color }]}>
              {artwork && !artworkImageFailed ? <Image source={{ uri: artwork.uri }} style={styles.padArtwork} resizeMode="cover" onError={() => setArtworkImageFailed(true)} /> : <Text style={{ color: contrastForeground(color), fontSize: 42, fontWeight: '700' }}>{activeIcon}</Text>}
              <View style={[styles.padNameOverlay, artwork && !artworkImageFailed ? styles.padNameOverlayOnImage : null]}><Text style={{ color: artwork && !artworkImageFailed ? '#fff' : contrastForeground(color), fontSize: 14, lineHeight: 17, fontWeight: '800', textAlign: 'center' }} numberOfLines={2}>{name.trim() || 'Sound name'}</Text></View>
            </View>
          </View>
          <View style={styles.artworkActions}>
            <ActionButton label={artwork ? 'Change image' : 'Choose image'} onPress={() => setPickerOpen(true)} theme={theme} variant="secondary" disabled={busy || imagePreparing} />
            {artwork ? <>
              <Text numberOfLines={1} style={{ color: theme.muted, textAlign: 'center' }}>Image: {artwork.title}</Text>
              <Pressable onPress={() => void Linking.openURL(artwork.sourceUrl).catch(() => {})} accessibilityRole="link" accessibilityLabel="Open original image source" style={styles.sourceLink}><Text numberOfLines={1} style={{ color: theme.focus, textDecorationLine: 'underline' }}>View image source</Text></Pressable>
              <ActionButton label="Remove image" onPress={clearArtwork} theme={theme} variant="secondary" disabled={busy || imagePreparing} />
            </> : null}
          </View>
          <Text style={{ color: theme.text, fontWeight: '700' }}>Sound name <Text style={{ color: theme.danger }}>*</Text></Text>
          <TextField inputRef={nameInputRef} onFocus={() => { if (nameInputRef.current) keyboardReveal.onFocus(nameInputRef.current); }} onBlur={() => { if (nameInputRef.current) keyboardReveal.onBlur(nameInputRef.current); }} value={name} onChangeText={(value) => setName(value.slice(0, 100))} placeholder="Name this sound" theme={theme} maxLength={100} />
          <Text style={{ color: theme.muted, textAlign: 'right' }}>{name.length}/100</Text>
          <Text style={{ color: theme.text, fontWeight: '700' }}>Choose an icon</Text>
          <View style={styles.choiceRow}>{iconChoices.map((choice) => <Pressable key={choice.id} onPress={() => setIcon(choice.id)} accessibilityRole="button" accessibilityLabel={`Use ${choice.label} icon`} accessibilityState={{ selected: icon === choice.id }} style={[styles.iconChoice, { borderColor: icon === choice.id ? theme.focus : theme.border, backgroundColor: theme.raised }]}><Text style={{ color: theme.text, fontSize: 28 }}>{choice.glyph}</Text></Pressable>)}</View>
          <Text style={{ color: theme.text, fontWeight: '700' }}>Choose a color</Text>
          <View style={styles.choiceRow}>{padColors.map((choice) => <Pressable key={choice} onPress={() => setColor(choice)} accessibilityRole="button" accessibilityLabel={`Use ${choice} color`} accessibilityState={{ selected: color === choice }} style={[styles.colorChoice, { backgroundColor: choice, borderColor: color === choice ? theme.focus : theme.border }]}>{color === choice ? <Text style={{ color: contrastForeground(choice), fontWeight: '900' }}>✓</Text> : null}</Pressable>)}</View>
          <Text style={{ color: theme.muted, lineHeight: 20 }}>Choose an image or use a built-in icon and color for your sound.</Text>
          <ActionButton label="Back to trim" onPress={() => setStep('trim')} theme={theme} disabled={busy} />
        </Panel>
      </> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: /could not|failed|microphone access is off|denied|recording is empty|too short|stopped when the app/i.test(message.toLowerCase()) ? theme.danger : theme.muted }}>{message}</Text> : null}
    </ScrollView>
    {step === 'source' && !recording && !recordingStopped ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}><ActionButton label="Cancel" onPress={requestCancel} theme={theme} variant="secondary" disabled={busy && Boolean(source)} /></View> : null}
    {step === 'trim' ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}><ActionButton label={busy ? 'Working…' : 'Continue to customize'} onPress={() => void renderRange()} theme={theme} variant="primary" disabled={busy} /></View> : null}
    {step === 'customize' ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}><ActionButton label={busy ? 'Saving…' : imagePreparing ? 'Preparing image…' : 'Save sound'} onPress={() => void save()} theme={theme} variant="primary" disabled={busy || imagePreparing || !name.trim()} /></View> : null}
    <ArtworkPicker visible={pickerOpen} theme={theme} onClose={() => setPickerOpen(false)} onSelect={adoptArtwork} onPreparingChange={setImagePreparing} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 }, back: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'flex-start', position: 'relative', paddingBottom: 14 }, progressItem: { flex: 1, alignItems: 'center', gap: 5 }, progressDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, connectorLayer: { position: 'absolute', top: 13, left: '16.666%', right: '16.666%', height: 2, flexDirection: 'row' }, connector: { height: 2, flex: 1 },
  scroll: { flex: 1 }, content: { gap: 14, paddingBottom: 20 }, card: { gap: 14 }, sourceScreen: { gap: 14 }, sourceCard: { minHeight: 90, borderWidth: 1.5, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, sourceIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, sourceCardCopy: { flex: 1, gap: 4 }, currentDraft: { gap: 10 }, recordingPanel: { gap: 14, borderColor: '#ff526b' }, recordingHeadline: { flexDirection: 'row', alignItems: 'center', gap: 10 }, recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ff304f' }, compactSource: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1 }, compactSourceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, compactSourceText: { flex: 1, gap: 2 }, waveCard: { borderRadius: 20, borderWidth: 1, padding: 12, gap: 10 }, finePanel: { paddingHorizontal: 12, paddingVertical: 2, gap: 0 }, fineDisclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, fineControls: { gap: 12, paddingBottom: 12 }, tuneSection: { gap: 6 }, tuneButtons: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }, tuneButton: { minHeight: 48, minWidth: 0, flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }, previewWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }, padPreview: { width: 150, height: 150, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 12, gap: 6 }, padArtwork: { ...StyleSheet.absoluteFill, width: undefined, height: undefined }, padNameOverlay: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8 }, padNameOverlayOnImage: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: '#0009' }, artworkActions: { gap: 8 }, sourceLink: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, iconChoice: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 2 }, colorChoice: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 3 }, footer: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
