import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { play, stop } from '../../../app-client/src/audio/engine';
import { useKeyboardInputReveal } from '../../../app-client/src/keyboard/useKeyboardInputReveal';
import { disposeLocalAudioSource, pickLocalAudioSource, renderLocalAudioRange, saveLocalAudioRender, type LocalAudioRender, type LocalAudioSource } from '../media/localAudio';
import { createLocalAudioRecorder } from '../media/recording';
import { createDeviceAudioCaptureController, isDeviceAudioCaptureSupported, isDeviceAudioSourceAlreadyOwned, type DeviceAudioCaptureController, type DeviceAudioStatus } from '../media/deviceAudioCapture';
import { disposeDraftArtwork, type DraftArtwork } from '../media/artwork';
import type { LocalClip } from '../data/library';
import { ActionButton, GradientFill, Panel, TextField } from './controls';
import type { Theme } from './theme';
import { iconChoices, padColors } from './theme';
import { formatTime, Waveform } from './Waveform';
import { ArtworkPicker, pickGalleryArtwork } from './ArtworkPicker';
import { Icon } from './Icons';

export type AssignmentTarget = { boardId: string; padId?: string; expectedClipId?: string | null } | null;
export type InitialAction = 'file' | 'record' | 'device-audio';
type Step = 'source' | 'trim' | 'customize';

function blendHex(foreground: string, background: string, foregroundRatio: number): string {
  const foregroundRgb = foreground.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16));
  const backgroundRgb = background.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16));
  if (!foregroundRgb || !backgroundRgb || foregroundRgb.length !== 3 || backgroundRgb.length !== 3) return background;
  return `#${foregroundRgb.map((value, index) => Math.round(value * foregroundRatio + backgroundRgb[index]! * (1 - foregroundRatio)).toString(16).padStart(2, '0')).join('')}`;
}

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
  const icon = iconChoices[0]!.id;
  const color = padColors[6]!;
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [deviceStatus, setDeviceStatus] = useState<DeviceAudioStatus | null>(null);
  const [message, setMessage] = useState('');
  const [artwork, setArtwork] = useState<DraftArtwork | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imagePreparing, setImagePreparing] = useState(false);
  const [artworkImageFailed, setArtworkImageFailed] = useState(false);
  const [artMode, setArtMode] = useState<'default' | 'gallery' | 'search'>('default');
  const { fontScale, width: viewportWidth } = useWindowDimensions();
  const stackFineTuneControls = fontScale > 1.2 || viewportWidth < 340;
  const controller = useRef<AbortController | null>(null);
  const sourceRef = useRef<LocalAudioSource | null>(null);
  const artworkRef = useRef<DraftArtwork | null>(null);
  const pendingCaptureRef = useRef<LocalAudioSource | null>(null);
  const saveLocked = useRef(false);
  const recorderRef = useRef<ReturnType<typeof createLocalAudioRecorder> | null>(null);
  const deviceCaptureRef = useRef<DeviceAudioCaptureController | null>(null);
  const deviceRefreshPendingRef = useRef(false);
  const deviceResultHandledRef = useRef(false);
  const deviceSourceOfferedRef = useRef(false);
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
      const deviceCapture = deviceCaptureRef.current;
      deviceCaptureRef.current = null;
      if (deviceCapture) void deviceCapture.cancel().catch(() => {});
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
        else if (initialAction === 'device-audio') void startDeviceCapture();
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
      if (deviceCaptureRef.current && appStateRef.current === 'active' && !deviceRefreshPendingRef.current) void refreshDeviceCapture();
    }, 250);
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active' && recorderRef.current) {
        void interruptRecording();
      }
      if (next === 'active' && deviceCaptureRef.current) void refreshDeviceCapture();
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
    if (busy || recorderRef.current || deviceCaptureRef.current || permissionPendingRef.current) return;
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

  async function startDeviceCapture() {
    if (busy || recorderRef.current || deviceCaptureRef.current || permissionPendingRef.current) return;
    if (!isDeviceAudioCaptureSupported()) { setMessage('Device audio recording requires Android 10 or later.'); return; }
    const capture = createDeviceAudioCaptureController();
    deviceCaptureRef.current = capture;
    deviceResultHandledRef.current = false;
    deviceSourceOfferedRef.current = false;
    setBusy(true); setMessage('Android will ask for audio permission and recording consent. Only compatible apps can be captured.');
    try {
      const status = await capture.start();
      if (!mountedRef.current || deviceCaptureRef.current !== capture) { await capture.cancel(); return; }
      setDeviceStatus(status);
      if (status.state === 'recording' || status.state === 'preparing') {
        setMessage('Recording device audio. Switch to a compatible app, then return here or use Stop in the notification.');
      } else if (status.state === 'requesting-permission') {
        setMessage('Complete the Android permission and capture prompts. The session will remain available when you return.');
      } else if (status.state === 'cancelled') {
        try { await capture.cancel(); deviceCaptureRef.current = null; setDeviceStatus(null); setMessage('Recording consent was cancelled. Nothing was saved.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Device audio cleanup is still finishing.'); }
      } else if (status.state === 'failed') {
        try { await capture.cancel(); deviceCaptureRef.current = null; setDeviceStatus(null); setMessage(status.error || 'Could not start device audio recording.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Device audio cleanup is still finishing.'); }
      } else if (status.state === 'ready') {
        await finishDeviceCapture(capture);
      } else if (status.state === 'idle') {
        deviceCaptureRef.current = null; setMessage(status.error || 'Device audio recording did not start.');
      }
    } catch (error) {
      setDeviceStatus(capture.getStatus());
      setMessage(error instanceof Error ? error.message : 'Could not start device audio recording.');
      try { await capture.cancel(); if (deviceCaptureRef.current === capture) deviceCaptureRef.current = null; setDeviceStatus(null); }
      catch (cleanupError) { setDeviceStatus(capture.getStatus()); setMessage(cleanupError instanceof Error ? cleanupError.message : 'Device audio cleanup is still finishing. Use Discard to retry cleanup.'); }
    } finally { if (mountedRef.current) setBusy(false); }
  }

  async function refreshDeviceCapture() {
    const capture = deviceCaptureRef.current;
    if (!capture || deviceRefreshPendingRef.current || AppState.currentState !== 'active') return;
    deviceRefreshPendingRef.current = true;
    try {
      const status = await capture.refresh();
      if (!mountedRef.current || capture !== deviceCaptureRef.current) return;
      setDeviceStatus(status);
      if (status.state === 'ready') await finishDeviceCapture(capture);
      else if (status.state === 'recording') setMessage((current) => current.startsWith('Complete the Android permission') || current.startsWith('Android will ask for audio permission')
        ? 'Recording device audio. Switch to a compatible app, then return here or use Stop in the notification.' : current);
      else if (status.state === 'stopping') setMessage((current) => current.startsWith('Complete the Android permission') || current.startsWith('Recording device audio. Switch')
        ? 'Finishing device audio…' : current);
      else if (status.state === 'failed' || status.state === 'cancelled') {
        deviceResultHandledRef.current = true;
        setMessage(status.error || (status.state === 'cancelled' ? 'Device audio recording was cancelled. Nothing was saved.' : 'Device audio recording could not be completed.'));
        try {
          await capture.cancel();
          if (deviceCaptureRef.current === capture) deviceCaptureRef.current = null;
          setDeviceStatus(null);
          deviceResultHandledRef.current = false;
        } catch (error) {
          setDeviceStatus(capture.getStatus());
          setMessage(error instanceof Error ? error.message : 'Device audio cleanup is still finishing. Use Discard to retry cleanup.');
        }
      }
    } catch (error) {
      if (mountedRef.current && capture === deviceCaptureRef.current) setMessage(error instanceof Error ? error.message : 'Could not check device audio recording status.');
    } finally { deviceRefreshPendingRef.current = false; }
  }

  async function stopDeviceCapture() {
    const capture = deviceCaptureRef.current;
    if (!capture || busy || deviceResultHandledRef.current) return;
    deviceResultHandledRef.current = true;
    setBusy(true); setMessage('Finishing device audio…');
    const op = new AbortController(); controller.current = op;
    try {
      const status = await capture.refresh();
      setDeviceStatus(status);
      if (status.state === 'ready') await finishDeviceCapture(capture, op.signal, true);
      else {
        const adopted = await capture.stop(op.signal);
        deviceCaptureRef.current = null;
        setDeviceStatus(null);
        if (mountedRef.current && !op.signal.aborted) await offerDeviceCapturedSource(capture, adopted.source, adopted.quiet);
        else await disposeLocalAudioSource(adopted.source);
      }
    } catch (error) {
      if (!op.signal.aborted && mountedRef.current) {
        setMessage(`${error instanceof Error ? error.message : 'Could not finish device audio recording.'} Try again, record with the microphone, or import a file.`);
        try {
          await capture.cancel();
          if (deviceCaptureRef.current === capture) deviceCaptureRef.current = null;
          setDeviceStatus(null);
          deviceResultHandledRef.current = false;
        } catch (cleanupError) {
          setDeviceStatus(capture.getStatus());
          setMessage(cleanupError instanceof Error ? cleanupError.message : 'Device audio cleanup is still finishing. Use Discard to retry cleanup.');
        }
      }
    } finally { if (mountedRef.current) setBusy(false); }
  }

  async function finishDeviceCapture(capture: DeviceAudioCaptureController, signal?: AbortSignal, lockHeld = false) {
    if ((deviceResultHandledRef.current && !lockHeld) || capture !== deviceCaptureRef.current) return;
    deviceResultHandledRef.current = true;
    setBusy(true); setMessage('Preparing the captured audio for review…');
    try {
      const adopted = await capture.consumeReady(signal);
      if (capture !== deviceCaptureRef.current || !mountedRef.current || signal?.aborted) { await disposeLocalAudioSource(adopted.source); return; }
      deviceCaptureRef.current = null;
      setDeviceStatus(null);
      await offerDeviceCapturedSource(capture, adopted.source, adopted.quiet);
    } catch (error) {
      if (mountedRef.current && !signal?.aborted) {
        setMessage(`${error instanceof Error ? error.message : 'Could not open the captured audio.'} It may be silence or the source app may limit capture. Try again, use the microphone, or import a file.`);
        try {
          await capture.cancel();
          if (deviceCaptureRef.current === capture) deviceCaptureRef.current = null;
          setDeviceStatus(null);
          deviceResultHandledRef.current = false;
        } catch (cleanupError) {
          setDeviceStatus(capture.getStatus());
          setMessage(cleanupError instanceof Error ? cleanupError.message : 'Device audio cleanup is still finishing. Use Discard to retry cleanup.');
        }
      }
    } finally { if (mountedRef.current) setBusy(false); }
  }

  async function offerDeviceCapturedSource(capture: DeviceAudioCaptureController, captured: LocalAudioSource, quiet: boolean) {
    if (deviceSourceOfferedRef.current) {
      if (!isDeviceAudioSourceAlreadyOwned(captured, sourceRef.current, pendingCaptureRef.current)) await disposeLocalAudioSource(captured);
      return;
    }
    deviceSourceOfferedRef.current = true;
    if (deviceCaptureRef.current === capture) deviceCaptureRef.current = null;
    setDeviceStatus(null);
    await offerCapturedSource(captured, 'Device audio recording', quiet);
  }

  async function discardDeviceCapture() {
    const capture = deviceCaptureRef.current;
    if (!capture) return;
    controller.current?.abort();
    try {
      await capture.cancel();
      if (deviceCaptureRef.current === capture) deviceCaptureRef.current = null;
      deviceResultHandledRef.current = false;
      if (mountedRef.current) { setDeviceStatus(null); setMessage('Device audio recording discarded. Nothing was saved.'); }
    } catch (error) {
      if (mountedRef.current) { setDeviceStatus(capture.getStatus()); setMessage(error instanceof Error ? error.message : 'Device audio cleanup is still finishing. Use Discard to retry cleanup.'); }
    }
  }

  function confirmDiscardDeviceCapture() {
    Alert.alert('Discard device recording?', 'The capture will stop and its temporary audio will be deleted. Your existing draft will be kept.', [
      { text: 'Keep recording', style: 'cancel' },
      { text: 'Discard recording', style: 'destructive', onPress: () => { void discardDeviceCapture(); } },
    ]);
  }

  async function offerCapturedSource(captured: LocalAudioSource, title: string, quiet = false) {
    pendingCaptureRef.current = captured;
    if (!mountedRef.current) { pendingCaptureRef.current = null; await disposeLocalAudioSource(captured); return; }
    if (quiet) {
      Alert.alert('Very quiet recording', sourceRef.current ? 'Review the waveform and preview this capture before saving. Replacing the current draft requires your choice. Quiet audio can mean silence or an app that limits capture.' : 'Review the waveform and preview this capture before saving. Quiet audio can mean silence or an app that limits capture.', [
        { text: 'Discard and retry', style: 'cancel', onPress: () => {
          if (pendingCaptureRef.current === captured) pendingCaptureRef.current = null;
          void disposeLocalAudioSource(captured);
          setBusy(false); setMessage('The quiet recording was discarded. You can try another compatible app.');
        } },
        ...(sourceRef.current ? [{ text: 'Keep existing draft', onPress: () => {
          if (pendingCaptureRef.current === captured) pendingCaptureRef.current = null;
          void disposeLocalAudioSource(captured); setBusy(false); setMessage('The quiet recording was discarded. Your existing draft is ready.');
        } }] : []),
        { text: sourceRef.current ? 'Replace and review' : 'Review recording', onPress: () => { void adoptRecording(captured, title, true); } },
      ]);
      return;
    }
    if (sourceRef.current) {
      Alert.alert('Review this recording?', 'This will replace the current draft after you choose to use it. You can keep editing the existing draft.', [
        { text: 'Keep existing draft', style: 'cancel', onPress: () => {
          if (pendingCaptureRef.current === captured) pendingCaptureRef.current = null;
          void disposeLocalAudioSource(captured);
          setBusy(false); setMessage('Recording discarded. Your existing draft is ready.');
        } },
        { text: 'Review recording', onPress: () => { void adoptRecording(captured, title, quiet); } },
      ]);
    } else await adoptRecording(captured, title, quiet);
  }

  async function adoptRecording(captured: LocalAudioSource, title = 'My recording', quiet = false) {
    if (pendingCaptureRef.current === captured) pendingCaptureRef.current = null;
    if (!mountedRef.current) { await disposeLocalAudioSource(captured); return; }
    const current = sourceRef.current;
    if (current) await disposeLocalAudioSource(current);
    if (!mountedRef.current) { await disposeLocalAudioSource(captured); return; }
    clearArtwork();
    sourceRef.current = captured; setSource(captured); setName(title); setStartMs(0); setEndMs(Math.min(60_000, captured.durationMs)); setRender(null); setFineTune(false); setStep('trim'); setMessage(quiet ? 'This capture is very quiet. Review the waveform and preview it; retry if you hear no useful audio.' : ''); setBusy(false); setRecordingElapsedMs(0);
  }

  function requestCancel() {
    if (deviceCaptureRef.current) { confirmDiscardDeviceCapture(); return; }
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
    if (deviceCaptureRef.current) { confirmDiscardDeviceCapture(); return; }
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

  async function chooseGalleryArtwork() {
    setArtMode('gallery');
    setImagePreparing(true);
    try {
      const next = await pickGalleryArtwork();
      if (next) adoptArtwork(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open that image. Choose another one.');
    } finally { setImagePreparing(false); }
  }

  const steps: Array<{ id: Step; label: string }> = [{ id: 'source', label: 'Source' }, { id: 'trim', label: 'Trim' }, { id: 'customize', label: 'Details' }];
  const activeIndex = steps.findIndex((item) => item.id === step);
  const deviceActive = Boolean(deviceStatus && ['requesting-permission', 'preparing', 'recording', 'stopping', 'ready'].includes(deviceStatus.state));
  return <View style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={goBack} disabled={busy && Boolean(source) && !recordingRef.current} accessibilityRole="button" accessibilityLabel={recording ? 'Discard recording' : step === 'source' ? 'Cancel sound creation' : 'Back'} style={styles.back}><Icon name="back" size={24} color={theme.text} /></Pressable>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1, textAlign: 'center' }}>Create a sound</Text>
      <View style={styles.back} />
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={`${steps[activeIndex]!.label}, step ${activeIndex + 1} of 3`} style={styles.progress}>
      <View pointerEvents="none" style={styles.connectorLayer}>
        <View style={[styles.connector, { backgroundColor: activeIndex > 0 ? theme.primary : theme.border }]} />
        <View style={[styles.connector, { backgroundColor: activeIndex > 1 ? theme.primary : theme.border }]} />
      </View>
      {steps.map((item, index) => <View key={item.id} style={styles.progressItem}>
        <View style={[styles.progressDot, { backgroundColor: index <= activeIndex ? theme.primary : theme.raised, borderColor: index <= activeIndex ? theme.primary : theme.border }]}>{index < activeIndex ? <Icon name="check" size={16} color="#fff" /> : <Text style={{ color: index === activeIndex ? '#fff' : theme.muted, fontSize: 12, fontWeight: '800' }}>{index + 1}</Text>}</View>
        <Text numberOfLines={2} style={{ color: index === activeIndex ? theme.focus : theme.muted, fontSize: 11, fontWeight: index === activeIndex ? '800' : '500', textAlign: 'center', flexShrink: 1 }}>{item.label}</Text>
      </View>)}
    </View>
    <ScrollView ref={scrollRef} style={styles.scroll} onLayout={keyboardReveal.onViewportLayout} onScroll={keyboardReveal.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {step === 'source' ? <View style={styles.sourceScreen}>
        {!recording && !recordingStopped && !deviceActive ? <>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>Where’s your audio from?</Text>
          <Pressable onPress={() => void chooseSource()} disabled={busy} accessibilityRole="button" accessibilityLabel="Choose file, import audio from this device" style={[styles.sourceCard, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <View style={[styles.sourceIcon, { backgroundColor: theme.raised }]}><Icon name="file" size={24} color={theme.focus} /></View><View style={styles.sourceCardCopy}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Import from device</Text><Text style={{ color: theme.muted }}>Choose an audio or video file</Text></View>
          </Pressable>
          <Pressable onPress={() => void startRecording()} disabled={busy} accessibilityRole="button" accessibilityLabel="Record a sound using the phone microphone" style={[styles.sourceCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}>
            <View style={[styles.sourceIcon, { backgroundColor: theme.raised }]}><Icon name="mic" size={24} color={theme.focus} /></View><View style={styles.sourceCardCopy}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Record a new sound</Text><Text style={{ color: theme.muted }}>Use your microphone</Text></View>
          </Pressable>
          {isDeviceAudioCaptureSupported() ? <Pressable onPress={() => void startDeviceCapture()} disabled={busy} accessibilityRole="button" accessibilityLabel="Record audio playing in compatible Android apps" style={[styles.sourceCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}>
            <View style={[styles.sourceIcon, { backgroundColor: theme.raised }]}><Icon name="music" size={24} color={theme.focus} /></View><View style={styles.sourceCardCopy}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Record device audio</Text><Text style={{ color: theme.muted }}>Compatible apps only · Android audio permission · up to 2 minutes</Text></View>
          </Pressable> : null}
          {Platform.OS === 'android' && Number(Platform.Version) < 29 ? <Text style={{ color: theme.muted, lineHeight: 18 }}>Device audio recording requires Android 10 or later.</Text> : null}
          {source ? <Panel theme={theme} style={styles.currentDraft}>
            <Text style={{ color: theme.text, fontWeight: '800' }}>Current draft</Text><Text style={{ color: theme.muted }} numberOfLines={1}>{source.title} · {formatTime(source.durationMs)}</Text>
            <ActionButton label="Continue editing this draft" onPress={() => { setStep('trim'); setMessage(''); }} theme={theme} variant="primary" disabled={busy} />
          </Panel> : null}
        </> : null}
        {recording || recordingStopped ? <Panel theme={theme} style={styles.recordingPanel}>
          <View style={styles.recordingHeadline}><View style={styles.recordingDot} /><Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{recordingStopped ? 'Recording stopped' : 'Recording a sound'}</Text></View>
          <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '800' }}>{formatTime(recordingElapsedMs)}</Text>
          <Text style={{ color: theme.muted }}>{recordingStopped ? 'The recording reached the 5-minute limit.' : 'Keep this screen open. Recording stops if you leave the app.'}</Text>
          <ActionButton label={recordingStopped ? 'Use recording' : 'Stop recording'} icon={recordingStopped ? undefined : '■'} onPress={() => void stopRecording()} theme={theme} variant="recording" disabled={busy} />
          <ActionButton label="Discard" onPress={confirmDiscardRecording} theme={theme} variant="quiet" />
        </Panel> : null}
        {deviceActive ? <Panel theme={theme} style={styles.recordingPanel}>
          <View style={styles.recordingHeadline}><View style={styles.recordingDot} /><Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{deviceStatus?.state === 'ready' || deviceStatus?.state === 'stopping' ? 'Finishing device audio' : deviceStatus?.state === 'requesting-permission' ? 'Waiting for Android consent' : 'Recording device audio'}</Text></View>
          <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '800' }}>{formatTime(deviceStatus?.elapsedMs ?? 0)}</Text>
          <Text style={{ color: theme.muted, textAlign: 'center' }}>{deviceStatus?.state === 'requesting-permission' ? 'Complete or cancel the Android permission and capture prompts. Your session will stay active while those prompts are shown.' : 'Switch to an app that permits playback capture. Android requires audio permission and shows an ongoing notification with Stop. Some apps limit capture.'}</Text>
          {deviceStatus?.state === 'ready' ? <ActionButton label="Review captured audio" onPress={() => { const capture = deviceCaptureRef.current; if (capture) void finishDeviceCapture(capture, undefined, true); }} theme={theme} variant="primary" disabled={busy} /> : <ActionButton label={busy ? 'Finishing…' : 'Stop device audio'} icon="■" onPress={() => void stopDeviceCapture()} theme={theme} variant="recording" disabled={busy || deviceStatus?.state === 'requesting-permission'} />}
          <ActionButton label="Discard" onPress={confirmDiscardDeviceCapture} theme={theme} variant="quiet" disabled={busy} />
        </Panel> : null}
      </View> : null}

      {step === 'trim' && source ? <>
        <View style={[styles.compactSource, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.compactSourceIcon, { backgroundColor: theme.raised }]}><Icon name={source.title === 'Microphone recording' ? 'mic' : 'music'} size={24} color={theme.focus} /></View>
          <View style={styles.compactSourceText}><Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{source.title}</Text><Text style={{ color: theme.muted, fontSize: 12 }}>{formatTime(source.durationMs)} total · Up to 60 seconds</Text></View>
        </View>
        <View style={[styles.waveCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Waveform peaks={source.peaks} durationMs={source.durationMs} startMs={startMs} endMs={endMs} onChange={setRange} theme={theme} />
          <Pressable onPress={() => void preview()} disabled={busy} accessibilityRole="button" accessibilityLabel="Preview selection"
            style={({ pressed }) => [styles.previewButton, { backgroundColor: blendHex(theme.accent, theme.surface, 0.18), borderColor: theme.border, opacity: busy ? 0.55 : pressed ? 0.78 : 1 }]}>
            <Icon name="play" size={20} color={theme.accent} />
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Preview selection</Text>
          </Pressable>
        </View>
        <Panel theme={theme} style={styles.finePanel}>
          <Pressable onPress={() => setFineTune(!fineTune)} disabled={busy} accessibilityRole="button" accessibilityState={{ expanded: fineTune }} accessibilityLabel={fineTune ? 'Hide fine tune controls' : 'Show fine tune controls'} style={styles.fineDisclosure}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>Fine tune</Text>
            <View style={styles.fineRight}><Text style={{ color: theme.muted, fontWeight: '500', fontSize: 11 }}>(optional)</Text><Icon name="chevron" size={18} color={theme.muted} /></View>
          </Pressable>
          {fineTune ? <View style={styles.fineControls}>
            {(['start', 'end'] as const).map((which) => <View key={which} style={[styles.tuneSection, stackFineTuneControls && styles.tuneSectionStacked]}>
              <View style={[styles.tuneLabels, stackFineTuneControls && styles.tuneLabelsStacked]}><Text style={{ color: theme.text, fontWeight: '700', width: stackFineTuneControls ? undefined : 42 }}>{which === 'start' ? 'Start' : 'End'}</Text><Text style={{ color: theme.text, fontVariant: ['tabular-nums'], fontSize: 12 }}>{formatTime(which === 'start' ? startMs : endMs)}</Text></View>
              <View style={[styles.tuneButtons, stackFineTuneControls && styles.tuneButtonsGrid]}>
                {([[-1000, '−1s'], [-100, '−100ms'], [100, '+100ms'], [1000, '+1s']] as const).map(([amount, label]) => <Pressable key={label} onPress={() => nudge(which, amount)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${label} ${which}`} style={({ pressed }) => [styles.tuneButton, stackFineTuneControls && styles.tuneButtonGrid, { backgroundColor: theme.raised, borderColor: theme.border, opacity: busy ? 0.45 : pressed ? 0.72 : 1 }]}><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text, fontWeight: '700', textAlign: 'center' }}>{label}</Text></Pressable>)}
              </View>
            </View>)}
          </View> : null}
        </Panel>
        <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16 }}>Drag both waveform handles to select the moment. Fine tune is optional.</Text>
      </> : null}

      {step === 'customize' && source && render ? <>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: -6 }}>Make it yours <Icon name="spark" size={16} color={theme.secondary} /></Text>
        <Panel theme={theme} style={styles.artworkPreviewCard}>
          <View style={[styles.artworkPreview, { backgroundColor: theme.raised }]}>
            {artwork && !artworkImageFailed ? <Image source={{ uri: artwork.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setArtworkImageFailed(true)} /> : <><GradientFill colors={theme.primaryGradient} vertical /><Icon name="music" size={37} color="#fff" /></>}
          </View>
          <View style={styles.artworkSummary}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>Optional artwork</Text>
            <Text style={{ color: theme.muted, lineHeight: 18 }}>Choose a picture for your pad or keep the default icon.</Text>
          </View>
        </Panel>
        <Text style={[styles.fieldLabel, { color: theme.muted }]}>SOUNDBITE NAME</Text>
        <TextField inputRef={nameInputRef} onFocus={() => { if (nameInputRef.current) keyboardReveal.onFocus(nameInputRef.current); }} onBlur={() => { if (nameInputRef.current) keyboardReveal.onBlur(nameInputRef.current); }} value={name} onChangeText={(value) => setName(value.slice(0, 100))} placeholder="Name this sound" theme={theme} maxLength={100} />
        <View style={styles.artOptions}>
          <Pressable onPress={() => { setArtMode('default'); clearArtwork(); }} accessibilityRole="button" accessibilityState={{ selected: artMode === 'default' }} style={[styles.artOption, { backgroundColor: artMode === 'default' ? theme.raised : theme.surface, borderColor: artMode === 'default' ? theme.focus : theme.border, borderWidth: artMode === 'default' ? 2 : 1 }]}><Icon name="music" size={22} color={theme.focus} /><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Default</Text></Pressable>
          <Pressable onPress={() => void chooseGalleryArtwork()} disabled={busy || imagePreparing} accessibilityRole="button" accessibilityState={{ selected: artMode === 'gallery' }} style={[styles.artOption, { backgroundColor: artMode === 'gallery' ? theme.raised : theme.surface, borderColor: artMode === 'gallery' ? theme.focus : theme.border, borderWidth: artMode === 'gallery' ? 2 : 1, opacity: imagePreparing ? 0.6 : 1 }]}><Icon name="image" size={22} color={theme.focus} /><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Gallery</Text></Pressable>
          <Pressable onPress={() => setArtMode('search')} accessibilityRole="button" accessibilityState={{ selected: artMode === 'search' }} style={[styles.artOption, { backgroundColor: artMode === 'search' ? theme.raised : theme.surface, borderColor: artMode === 'search' ? theme.focus : theme.border, borderWidth: artMode === 'search' ? 2 : 1 }]}><Icon name="search" size={22} color={theme.focus} /><Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Search</Text></Pressable>
        </View>
        {artMode === 'search' ? <View style={styles.searchInfo}><Text style={{ color: theme.muted, lineHeight: 20 }}>Search online artwork is available through Imgflip’s popular template list.</Text><ActionButton label="Browse popular templates" icon="⌕" onPress={() => setPickerOpen(true)} theme={theme} variant="secondary" disabled={busy || imagePreparing} /></View> : null}
        <Text style={{ color: theme.muted, lineHeight: 20 }}>Your clip and optional artwork will be stored on this device. You can skip artwork.</Text>
      </> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: /could not|failed|microphone access is off|denied|recording is empty|too short|stopped when the app/i.test(message.toLowerCase()) ? theme.danger : theme.muted }}>{message}</Text> : null}
    </ScrollView>
    {step === 'source' && !recording && !recordingStopped ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}><ActionButton label="Cancel" onPress={requestCancel} theme={theme} variant="secondary" disabled={busy && Boolean(source)} /></View> : null}
    {step === 'trim' ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}><ActionButton label={busy ? 'Working…' : 'Next'} onPress={() => void renderRange()} theme={theme} variant="primary" disabled={busy} /></View> : null}
    {step === 'customize' ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}><ActionButton label={busy ? 'Saving…' : imagePreparing ? 'Preparing image…' : 'Save soundbite'} onPress={() => void save()} theme={theme} variant="primary" disabled={busy || imagePreparing || !name.trim()} /></View> : null}
    <ArtworkPicker visible={pickerOpen} theme={theme} onClose={() => setPickerOpen(false)} onSelect={adoptArtwork} onPreparingChange={setImagePreparing} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 }, back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'flex-start', position: 'relative', paddingBottom: 16 }, progressItem: { flex: 1, alignItems: 'center', gap: 5 }, progressDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, connectorLayer: { position: 'absolute', top: 13, left: '16.666%', right: '16.666%', height: 2, flexDirection: 'row' }, connector: { height: 2, flex: 1 },
  scroll: { flex: 1 }, content: { gap: 12, paddingBottom: 20 }, card: { gap: 14 }, sourceScreen: { gap: 10, paddingTop: 4 }, sourceCard: { minHeight: 82, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }, sourceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, sourceCardCopy: { flex: 1, gap: 4 }, currentDraft: { gap: 10 }, recordingPanel: { minHeight: 230, justifyContent: 'center', alignItems: 'center', gap: 16, borderColor: '#ff526b' }, recordingHeadline: { flexDirection: 'row', alignItems: 'center', gap: 10 }, recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ff304f' }, compactSource: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 }, compactSourceIcon: { width: 55, height: 55, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, compactSourceText: { flex: 1, gap: 2, minWidth: 0 }, waveCard: { borderRadius: 18, borderWidth: 1, padding: 15, gap: 0 }, previewButton: { minHeight: 47, width: '100%', borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, finePanel: { paddingHorizontal: 12, paddingVertical: 10, gap: 0, borderRadius: 17 }, fineDisclosure: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, fineRight: { flexDirection: 'row', alignItems: 'center', gap: 8 }, fineControls: { gap: 10, paddingBottom: 12 }, tuneSection: { flexDirection: 'row', alignItems: 'center', gap: 8 }, tuneSectionStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 6 }, tuneLabels: { flexDirection: 'row', alignItems: 'center', gap: 2 }, tuneLabelsStacked: { justifyContent: 'space-between' }, tuneButtons: { flex: 1, flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }, tuneButtonsGrid: { flex: 0, width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tuneButton: { minHeight: 44, minWidth: 0, flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }, tuneButtonGrid: { minHeight: 48, flex: 0, width: '47%' },
  artworkPreviewCard: { minHeight: 112, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }, artworkPreview: { width: 86, height: 86, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, artworkSummary: { flex: 1, gap: 7 }, fieldLabel: { color: '#baa8ad', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 8, marginBottom: -5 }, artOptions: { flexDirection: 'row', gap: 8 }, artOption: { flex: 1, minHeight: 82, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, searchInfo: { gap: 8 }, footer: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
