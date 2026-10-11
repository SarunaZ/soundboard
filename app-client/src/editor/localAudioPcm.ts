export const LOCAL_AUDIO_SAMPLE_RATE = 44_100;
export const LOCAL_AUDIO_MAX_CHANNELS = 2;
export const LOCAL_AUDIO_MAX_RENDER_MS = 60_000;
export const LOCAL_AUDIO_MIN_RENDER_MS = 100;

const RIFF_HEADER_BYTES = 44;

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function checkAbort(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Audio editing was cancelled.');
  error.name = 'AbortError';
  throw error;
}

/** Encode an actual interleaved PCM16 WAV slice from planar floating-point channels. */
export async function encodePcm16WavSlice(
  channels: readonly Float32Array[],
  startFrame: number,
  endFrame: number,
  sampleRate = LOCAL_AUDIO_SAMPLE_RATE,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) throw new Error('The audio sample rate is invalid.');
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame <= startFrame) {
    throw new Error('Choose a valid audio range.');
  }
  if (channels.length < 1 || channels.length > LOCAL_AUDIO_MAX_CHANNELS) throw new Error('This audio channel count is not supported.');
  const frameCount = endFrame - startFrame;
  if (frameCount > Math.floor(sampleRate * LOCAL_AUDIO_MAX_RENDER_MS / 1000)) throw new Error('Selections must be 60 seconds or shorter.');
  for (const channel of channels) {
    if (endFrame > channel.length) throw new Error('The selected range extends past the audio source.');
  }

  const bytesPerFrame = channels.length * 2;
  const dataBytes = frameCount * bytesPerFrame;
  if (!Number.isSafeInteger(dataBytes) || dataBytes + RIFF_HEADER_BYTES > 0xffff_ffff) throw new Error('The selected audio range is too large to render.');
  const result = new Uint8Array(RIFF_HEADER_BYTES + dataBytes);
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, result.byteLength - 8, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let outputOffset = RIFF_HEADER_BYTES;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    if ((frame - startFrame) % 16_384 === 0) {
      checkAbort(signal);
      if (frame !== startFrame) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    for (const channel of channels) {
      const raw = channel[frame]!;
      const sample = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      const integer = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      view.setInt16(outputOffset, integer, true);
      outputOffset += 2;
    }
  }
  checkAbort(signal);
  return result;
}

/** Make compact max-amplitude bins for a waveform from planar decoded PCM. */
export async function waveformPeaks(
  channels: readonly Float32Array[],
  frameCount: number,
  binCount = 256,
  signal?: AbortSignal,
): Promise<number[]> {
  if (!Number.isInteger(frameCount) || frameCount <= 0 || channels.length < 1 || channels.length > LOCAL_AUDIO_MAX_CHANNELS ||
      channels.some((channel) => channel.length < frameCount)) {
    throw new Error('The decoded audio data is invalid.');
  }
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > 2048) throw new Error('The waveform size is invalid.');
  const peaks: number[] = [];
  for (let bin = 0; bin < binCount; bin += 1) {
    const start = Math.floor(bin * frameCount / binCount);
    const end = Math.max(start + 1, Math.floor((bin + 1) * frameCount / binCount));
    let peak = 0;
    for (let frame = start; frame < Math.min(end, frameCount); frame += 1) {
      for (const channel of channels) {
        const sample = channel[frame]!;
        if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
      }
      if (frame % 16_384 === 0) {
        checkAbort(signal);
        if (frame !== start) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    peaks.push(Math.min(1, peak));
  }
  checkAbort(signal);
  return peaks;
}
