/**
 * Offline, linked-channel clip protection. The short block look-ahead gives
 * fast attack while a 50 ms release avoids pumping on ordinary peaks. This is
 * a sample-peak limiter with margin, not a measured true-peak limiter.
 */
export const LIMITER_CEILING = 0.794328235; // -2 dBFS; extra margin for estimated intersample peaks
export const LIMITER_LOOKAHEAD_SECONDS = 0.004;
export const LIMITER_RELEASE_SECONDS = 0.05;
export const MAX_PLAYBACK_AMPLITUDE = 10 ** (12 / 20);
// Yield often enough to keep cancellation responsive, without scheduling a
// timer every few milliseconds of audio. On Hermes, hundreds of timer turns
// during one cold protected clip cost more than the sample work itself.
export const DSP_YIELD_SAMPLES = 131_072;
const TRUE_PEAK_TAPS = 12;
const TRUE_PEAK_PHASES = 4;

function sinc(value: number): number {
  if (Math.abs(value) < 1e-8) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

const interpolationKernels = Array.from({ length: TRUE_PEAK_PHASES }, (_, phase) => {
  const fraction = phase / TRUE_PEAK_PHASES;
  const coefficients = new Float32Array(TRUE_PEAK_TAPS);
  let sum = 0;
  for (let tap = 0; tap < TRUE_PEAK_TAPS; tap += 1) {
    const offset = tap - (TRUE_PEAK_TAPS / 2 - 1);
    const distance = fraction - offset;
    const windowPosition = distance / (TRUE_PEAK_TAPS / 2);
    const window = Math.abs(windowPosition) >= 1
      ? 0
      : 0.42 + 0.5 * Math.cos(Math.PI * windowPosition) + 0.08 * Math.cos(2 * Math.PI * windowPosition);
    const coefficient = sinc(distance) * window;
    coefficients[tap] = coefficient;
    sum += coefficient;
  }
  for (let tap = 0; tap < TRUE_PEAK_TAPS; tap += 1) coefficients[tap] /= sum;
  return coefficients;
});
export const MAX_INTERPOLATION_L1 = Math.max(...interpolationKernels.map((kernel) =>
  kernel.reduce((sum, coefficient) => sum + Math.abs(coefficient), 0)));
// Small allowance for finite tap count/window error relative to the ideal
// reconstructed waveform. Native FFmpeg output remains the acceptance check.
const INTERSAMPLE_SAFETY = 10 ** (0.6 / 20);

/** 4× windowed-sinc reconstruction estimate; deliberately not called a certified true-peak meter. */
export async function estimateOversampledPeak(
  channels: readonly Float32Array[],
  shouldCancel: () => boolean = () => false,
): Promise<number> {
  const length = channels[0]?.length ?? 0;
  let peak = 0;
  for (let frame = 0; frame < length; frame += 1) {
    if (frame > 0 && frame % DSP_YIELD_SAMPLES === 0) {
      if (shouldCancel()) throw new Error('Playback request was superseded.');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    for (const channel of channels) {
      let localPeak = 0;
      let localMin = Infinity;
      let localMax = -Infinity;
      for (let tap = 0; tap < TRUE_PEAK_TAPS; tap += 1) {
        const sampleIndex = frame + tap - (TRUE_PEAK_TAPS / 2 - 1);
        if (sampleIndex >= 0 && sampleIndex < length) {
          const sample = finiteSample(channel[sampleIndex]!);
          localPeak = Math.max(localPeak, Math.abs(sample));
          localMin = Math.min(localMin, sample);
          localMax = Math.max(localMax, sample);
        }
      }
      peak = Math.max(peak, localPeak);
      // A 12-tap normalized interpolation kernel cannot produce a peak from
      // small local samples that reaches the protected ceiling; use the FIR
      // L1 bound for those skipped regions so they remain in the result bound.
      if (localPeak * MAX_INTERPOLATION_L1 * INTERSAMPLE_SAFETY <= LIMITER_CEILING) {
        peak = Math.max(peak, localPeak * MAX_INTERPOLATION_L1);
        continue;
      }
      // Constant/slow same-polarity regions have no material intersample
      // overshoot. Bound the residual variation by the negative-coefficient
      // L1 mass rather than treating the raw sample peak as exact.
      const localRange = localMax - localMin;
      if ((localMin >= 0 || localMax <= 0) && localRange < localPeak * 0.1) {
        peak = Math.max(peak, localPeak + localRange * (MAX_INTERPOLATION_L1 - 1) / 2);
        continue;
      }
      for (const coefficients of interpolationKernels) {
        let reconstructed = 0;
        for (let tap = 0; tap < TRUE_PEAK_TAPS; tap += 1) {
          const sampleIndex = frame + tap - (TRUE_PEAK_TAPS / 2 - 1);
          if (sampleIndex >= 0 && sampleIndex < length) {
            reconstructed += finiteSample(channel[sampleIndex]!) * coefficients[tap]!;
          }
        }
        peak = Math.max(peak, Math.abs(reconstructed));
      }
    }
  }
  return peak;
}

export type ClipPcmResult = { channels: Float32Array[]; peak: number };

/** Conservative static mix gain for aligned protected clip peaks. */
export function calculateMixHeadroom(peakBounds: readonly number[]): number {
  const sum = peakBounds.reduce((total, peak) => total + (Number.isFinite(peak) ? Math.max(0, peak) : LIMITER_CEILING), 0);
  return sum > LIMITER_CEILING ? LIMITER_CEILING / sum : 1;
}

/** Conservative bound for an unprocessed sample peak under reconstructed audio. */
export function conservativePeakBound(samplePeak: number): number {
  return Math.min(LIMITER_CEILING, conservativePeakEstimate(samplePeak));
}

export function conservativePeakEstimate(samplePeak: number): number {
  const finitePeak = Number.isFinite(samplePeak) ? Math.max(0, samplePeak) : LIMITER_CEILING;
  return finitePeak * MAX_INTERPOLATION_L1 * INTERSAMPLE_SAFETY;
}

function finiteSample(sample: number): number {
  return Number.isFinite(sample) ? sample : 0;
}

/**
 * Apply digital gain and a linked-channel look-ahead limiter to copied PCM.
 * Input arrays are never modified. Processing yields periodically and can be
 * cancelled, so long clips do not monopolize the JS thread.
 */
export async function processClipPcm(
  inputChannels: readonly Float32Array[],
  gain: number,
  sampleRate: number,
  shouldCancel: () => boolean = () => false,
): Promise<ClipPcmResult> {
  const safeGain = Number.isFinite(gain) ? Math.max(0, Math.min(MAX_PLAYBACK_AMPLITUDE, gain)) : 1;
  const length = inputChannels[0]?.length ?? 0;
  if (inputChannels.some((channel) => channel.length !== length)) {
    throw new Error('Clip channels must have matching sample counts.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Clip sample rate is invalid.');
  }
  const outputs = inputChannels.map(() => new Float32Array(length));
  if (!inputChannels.length || !length || safeGain === 0) {
    return { channels: outputs, peak: 0 };
  }

  const blockFrames = Math.max(1, Math.round(sampleRate * LIMITER_LOOKAHEAD_SECONDS));
  const blockCount = Math.ceil(length / blockFrames);
  const blockPeaks = new Float32Array(blockCount);
  let peak = 0;
  // Compute linked block peaks, sanitizing non-finite input during the pass.
  for (let block = 0; block < blockCount; block += 1) {
    if (shouldCancel()) throw new Error('Playback request was superseded.');
    const start = block * blockFrames;
    const end = Math.min(length, start + blockFrames);
    let blockPeak = 0;
    for (let frame = start; frame < end; frame += 1) {
      for (const channel of inputChannels) {
        const value = Math.abs(finiteSample(channel[frame]!) * safeGain);
        if (value > blockPeak) blockPeak = value;
      }
    }
    blockPeaks[block] = blockPeak;
    if (blockPeak > peak) peak = blockPeak;
    if ((end % DSP_YIELD_SAMPLES) < blockFrames) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const releasePerBlock = Math.exp(-(blockFrames / sampleRate) / LIMITER_RELEASE_SECONDS);
  let envelope = 1;
  let outputPeak = 0;
  for (let block = 0; block < blockCount; block += 1) {
    if (shouldCancel()) throw new Error('Playback request was superseded.');
    const start = block * blockFrames;
    const end = Math.min(length, start + blockFrames);
    const futurePeak = Math.max(blockPeaks[block]!, blockPeaks[block + 1] ?? 0);
    const target = futurePeak > LIMITER_CEILING ? LIMITER_CEILING / futurePeak : 1;
    // Immediate attack. Release only at block boundaries, while the following
    // block's peak is already visible through the look-ahead detector.
    const releasedEnvelope = 1 - (1 - envelope) * releasePerBlock;
    envelope = Math.min(target, releasedEnvelope);
    for (let frame = start; frame < end; frame += 1) {
      for (let channelIndex = 0; channelIndex < inputChannels.length; channelIndex += 1) {
        const sample = finiteSample(inputChannels[channelIndex]![frame]!) * safeGain * envelope;
        outputs[channelIndex]![frame] = sample;
        const magnitude = Math.abs(sample);
        if (magnitude > outputPeak) outputPeak = magnitude;
      }
    }
    if ((end % DSP_YIELD_SAMPLES) < blockFrames) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  // Sample-peak limiting can miss intersample peaks. Estimate reconstructed
  // peaks at 4×; when needed, attenuate the entire clip without makeup gain.
  // The estimate is intentionally conservative and remains subject to native
  // rendered-output metering in QA.
  const estimatedBound = outputPeak * MAX_INTERPOLATION_L1 * INTERSAMPLE_SAFETY;
  const usedL1Bound = estimatedBound <= LIMITER_CEILING;
  const estimatedPeak = usedL1Bound ? estimatedBound : await estimateOversampledPeak(outputs, shouldCancel);
  const protectedPeak = usedL1Bound ? estimatedPeak : estimatedPeak * INTERSAMPLE_SAFETY;
  const postGain = protectedPeak > LIMITER_CEILING ? LIMITER_CEILING / protectedPeak : 1;
  if (postGain < 1) {
    for (let channelIndex = 0; channelIndex < outputs.length; channelIndex += 1) {
      const output = outputs[channelIndex]!;
      for (let frame = 0; frame < length; frame += 1) {
        output[frame] *= postGain;
        if (frame > 0 && frame % DSP_YIELD_SAMPLES === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    outputPeak *= postGain;
  }
  const peakBound = postGain < 1 ? protectedPeak * postGain : protectedPeak;
  return { channels: outputs, peak: Math.min(LIMITER_CEILING, peakBound) };
}

/** WebAudio's final node is a second-stage smooth fail-safe, not the boost DSP. */
export function softLimitSample(sample: number): number {
  if (!Number.isFinite(sample) || sample === 0) return 0;
  const sign = sample < 0 ? -1 : 1;
  const magnitude = Math.abs(sample);
  if (magnitude <= 0.92) return sample;
  const span = 0.999 - 0.92;
  const t = Math.min(1, (magnitude - 0.92) / 0.08);
  const knee = t + t * t - t * t * t;
  return sign * Math.min(0.999, 0.92 + span * knee);
}

export function createSoftLimiterCurve(length = 2049): Float32Array {
  const curve = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    curve[index] = softLimitSample((index / (length - 1)) * 2 - 1);
  }
  return curve;
}

export function safeClipGain(value: number | undefined, boostAvailable: boolean): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(boostAvailable ? 2 : 1, Math.max(0, value ?? 1));
}

/** Convert the persisted 0–200% control into amplitude; values through unity stay linear. */
export function playbackGainFromControl(value: number | undefined, boostAvailable: boolean): number {
  const control = safeClipGain(value, boostAvailable);
  return control <= 1 ? control : 10 ** (12 * (control - 1) / 20);
}
