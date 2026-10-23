import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { conservativePeakEstimate, LIMITER_CEILING, MAX_PLAYBACK_AMPLITUDE, processClipPcm } from '../../app-play/src/media/playbackDsp.ts';

const exeArg = process.argv.find((value) => value.startsWith('--exe='));
const executable = exeArg?.slice('--exe='.length) ?? process.env.PLAYBACK_DSP_CLI;
const adbSerialArg = process.argv.find((value) => value.startsWith('--adb-serial='));
const adbSerial = adbSerialArg?.slice('--adb-serial='.length);
const remoteExeArg = process.argv.find((value) => value.startsWith('--remote-exe='));
const remoteExecutable = remoteExeArg?.slice('--remote-exe='.length) ?? '/data/local/tmp/playback_dsp_cli';
const adbExecutable = process.env.ADB_PATH ??
  (process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb');
const localInputPath = join(tmpdir(), `soundboard-playback-dsp-${process.pid}.f32`);
const localOutputPath = join(tmpdir(), `soundboard-playback-dsp-${process.pid}.out`);
const remoteInputPath = `/data/local/tmp/playback-dsp-${process.pid}.f32`;
const remoteOutputPath = `/data/local/tmp/playback-dsp-${process.pid}.out`;
process.on('exit', () => {
  try { rmSync(localInputPath, { force: true }); } catch {}
  try { rmSync(localOutputPath, { force: true }); } catch {}
});
if (!executable && !adbSerial) throw new Error('Pass --exe=<path>, --adb-serial=<serial>, or set PLAYBACK_DSP_CLI.');
if (executable && adbSerial) throw new Error('Choose either --exe or --adb-serial for one run.');
const benchmarkMode = process.argv.includes('--benchmarks');

function buildFixture(name, frames, sampleRate = 48000) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  let random = 0x1234abcd;
  const nextRandom = () => {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return (random >>> 0) / 0x1_0000_0000;
  };
  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / sampleRate;
    switch (name) {
      case 'sine-stereo':
        left[frame] = 0.62 * Math.sin(2 * Math.PI * 997 * time);
        right[frame] = 0.58 * Math.sin(2 * Math.PI * 997 * time + 0.71);
        break;
      case 'sine-44100':
        left[frame] = 0.71 * Math.sin(2 * Math.PI * 997 * time);
        right[frame] = 0.49 * Math.sin(2 * Math.PI * 997 * time + 0.71);
        break;
      case 'transient-noise':
        left[frame] = (nextRandom() * 2 - 1) * (frame % 997 < 37 ? 0.91 : 0.24);
        right[frame] = (nextRandom() * 2 - 1) * (frame % 613 < 29 ? 0.84 : 0.18);
        break;
      case 'edge-pulses':
        left[frame] = frame === 0 || frame === 17 || frame === frames - 1 ? 0.98 : 0;
        right[frame] = frame === 2 || frame === 18 || frame === frames - 2 ? -0.96 : 0;
        break;
      case 'quiet-boost':
        left[frame] = 0.043 * Math.sin(2 * Math.PI * 440 * time);
        right[frame] = 0.031 * Math.sin(2 * Math.PI * 880 * time + 0.2);
        break;
      case 'benchmark-sine':
        left[frame] = 0.62 * Math.sin(2 * Math.PI * 997 * time);
        right[frame] = 0.62 * Math.sin(2 * Math.PI * 997 * time + 0.31);
        break;
      case 'fs4-phase': {
        const phase = frame & 3;
        left[frame] = [0, 0.98, 0, -0.98][phase];
        right[frame] = [0.97, 0, -0.97, 0][phase];
        break;
      }
      default:
        throw new Error(`Unknown fixture: ${name}`);
    }
  }
  if (name === 'transient-noise' && frames > 100) {
    left[77] = Number.NaN;
    right[96] = Number.POSITIVE_INFINITY;
  }
  return { channels: [left, right], sampleRate };
}

function encodeInput(channels) {
  const bytes = Buffer.allocUnsafe(channels.reduce((total, channel) => total + channel.length * 4, 0));
  let offset = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      bytes.writeFloatLE(sample, offset);
      offset += 4;
    }
  }
  return bytes;
}

function runNative(channels, sampleRate, gain) {
  const args = [String(channels.length), String(channels[0]?.length ?? 0), String(sampleRate), String(gain)];
  const input = encodeInput(channels);
  if (adbSerial) writeFileSync(localInputPath, input);
  const started = performance.now();
  let child;
  let bytes;
  if (adbSerial) {
    // This adb build's exec-out is stdout-only and shell -T stdin treats some
    // binary control bytes specially, so stage raw fixture input and output.
    const pushed = spawnSync(adbExecutable, ['-s', adbSerial, 'push', localInputPath, remoteInputPath], {
      maxBuffer: 1024 * 1024,
    });
    if (pushed.error) throw pushed.error;
    if (pushed.status !== 0) throw new Error(pushed.stderr.toString() || 'Could not push raw PCM fixture.');
    const command = `${remoteExecutable} ${args.join(' ')} < ${remoteInputPath} > ${remoteOutputPath}`;
    child = spawnSync(adbExecutable, ['-s', adbSerial, 'shell', '-T', command], { maxBuffer: 1024 * 1024 });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(child.stderr.toString() || `Native CLI exited ${child.status}.`);
    const pulled = spawnSync(adbExecutable, ['-s', adbSerial, 'pull', remoteOutputPath, localOutputPath], {
      maxBuffer: 1024 * 1024,
    });
    if (pulled.error) throw pulled.error;
    if (pulled.status !== 0) throw new Error(pulled.stderr.toString() || 'Could not pull native PCM output.');
    bytes = readFileSync(localOutputPath);
  } else {
    child = spawnSync(executable, args, {
      input,
      maxBuffer: Math.max(1024 * 1024, channels.length * (channels[0]?.length ?? 0) * 4 + 1024),
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(child.stderr.toString() || `Native CLI exited ${child.status}.`);
    bytes = child.stdout;
  }
  const elapsedMs = performance.now() - started;
  const diagnostic = child.stderr.toString();
  const timingMatch = diagnostic.match(/CORE_DSP_MS=([0-9.]+)/);
  const coreMilliseconds = timingMatch ? Number(timingMatch[1]) : null;
  assert.equal(bytes.toString('ascii', 0, 4), 'SBPD', 'native result header');
  const outputChannels = bytes.readUInt32LE(4);
  const outputFrames = Number(bytes.readBigUInt64LE(8));
  const hasNonFinite = bytes.readUInt32LE(16) !== 0;
  const protectionRequired = bytes.readUInt32LE(20) !== 0;
  const analysisPeak = bytes.readDoubleLE(24);
  const peak = bytes.readDoubleLE(32);
  const outputPeak = bytes.readDoubleLE(40);
  const usedL1Bound = bytes.readUInt32LE(48) !== 0;
  assert.equal(outputChannels, channels.length);
  assert.equal(outputFrames, channels[0]?.length ?? 0);
  const expectedBytes = 52 + outputChannels * outputFrames * 4;
  assert.equal(bytes.length, expectedBytes, 'native result byte length');
  const output = [];
  let offset = 52;
  for (let channel = 0; channel < outputChannels; channel += 1) {
    const values = new Float32Array(outputFrames);
    for (let frame = 0; frame < outputFrames; frame += 1) {
      values[frame] = bytes.readFloatLE(offset);
      offset += 4;
    }
    output.push(values);
  }
  return { channels: output, analysisPeak, hasNonFinite, protectionRequired, peak, outputPeak, usedL1Bound, elapsedMs, coreMilliseconds };
}

async function compareFixture(name, gain, sampleRate = 48000) {
  const { channels } = buildFixture(name, 12000, sampleRate);
  const originals = channels.map((channel) => channel.slice());
  const expected = await processClipPcm(channels, gain, sampleRate);
  const actual = runNative(channels, sampleRate, gain);
  const inputPeak = channels.reduce((maximum, channel) => {
    for (const sample of channel) if (Number.isFinite(sample)) maximum = Math.max(maximum, Math.abs(sample));
    return maximum;
  }, 0);
  for (let channel = 0; channel < channels.length; channel += 1) {
    assert.deepEqual(channels[channel], originals[channel], `${name}: input channel ${channel} unchanged`);
    assert.equal(actual.channels[channel].length, expected.channels[channel].length);
    let maximumError = 0;
    for (let frame = 0; frame < channels[channel].length; frame += 1) {
      maximumError = Math.max(maximumError,
        Math.abs(actual.channels[channel][frame] - expected.channels[channel][frame]));
    }
    assert.ok(maximumError <= 2e-6, `${name}: channel ${channel} max error ${maximumError}`);
  }
  assert.equal(actual.hasNonFinite, name === 'transient-noise', `${name}: finite-input analysis`);
  assert.ok(Math.abs(actual.analysisPeak - inputPeak) < 1e-8, `${name}: analysis peak`);
  const safeGain = Number.isFinite(gain) ? Math.max(0, Math.min(MAX_PLAYBACK_AMPLITUDE, gain)) : 1;
  const expectedProtection = actual.hasNonFinite ||
    conservativePeakEstimate(inputPeak * safeGain) > LIMITER_CEILING;
  assert.equal(actual.protectionRequired, expectedProtection,
    `${name}: protection decision`);
  assert.ok(Math.abs(actual.peak - expected.peak) <= 2e-6,
    `${name}: peak ${actual.peak} differs from TS ${expected.peak}`);
  const timing = actual.coreMilliseconds === null
    ? `${actual.elapsedMs.toFixed(1)} ms end-to-end (core timing unavailable)`
    : `${actual.coreMilliseconds.toFixed(1)} ms core; ${actual.elapsedMs.toFixed(1)} ms end-to-end`;
  console.log(`${name} gain=${gain}: output/peak match; ${timing}`);
}

await compareFixture('sine-stereo', 2);
await compareFixture('sine-44100', 1.6, 44100);
await compareFixture('transient-noise', 1.7);
await compareFixture('edge-pulses', 1.4);
await compareFixture('fs4-phase', 1.4);
await compareFixture('quiet-boost', 2);
await compareFixture('sine-stereo', MAX_PLAYBACK_AMPLITUDE);
await compareFixture('transient-noise', MAX_PLAYBACK_AMPLITUDE, 44100);
await compareFixture('edge-pulses', MAX_PLAYBACK_AMPLITUDE, 48000);
await compareFixture('quiet-boost', MAX_PLAYBACK_AMPLITUDE, 44100);

if (benchmarkMode) {
  for (const seconds of [17, 60]) {
    const fixture = buildFixture('benchmark-sine', seconds * 48000);
    const result = runNative(fixture.channels, fixture.sampleRate, MAX_PLAYBACK_AMPLITUDE);
    const timing = result.coreMilliseconds === null
      ? `${result.elapsedMs.toFixed(1)} ms end-to-end (core timing unavailable)`
      : `${result.coreMilliseconds.toFixed(1)} ms core; ${result.elapsedMs.toFixed(1)} ms end-to-end`;
    console.log(`benchmark stereo ${seconds}s gain=${MAX_PLAYBACK_AMPLITUDE.toFixed(6)} (+12 dB): ${timing}; peak=${result.peak.toFixed(9)}`);
  }
}
