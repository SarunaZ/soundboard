#include "playback_dsp.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <vector>

namespace soundboard::playback {
namespace {

constexpr std::size_t kYieldCheckFrames = 131072;

double finiteSample(float sample) {
  return std::isfinite(sample) ? static_cast<double>(sample) : 0.0;
}

double safeGain(double gain) {
  return std::isfinite(gain) ? std::max(0.0, std::min(kMaxPlaybackAmplitude, gain)) : 1.0;
}

double sinc(double value) {
  if (std::abs(value) < 1e-8) return 1.0;
  const double angle = std::acos(-1.0) * value;
  return std::sin(angle) / angle;
}

using Kernel = std::array<float, kTruePeakTaps>;

const std::array<Kernel, kTruePeakPhases>& interpolationKernels() {
  static const auto kernels = [] {
    std::array<Kernel, kTruePeakPhases> result{};
    const double pi = std::acos(-1.0);
    for (std::size_t phase = 0; phase < kTruePeakPhases; ++phase) {
      const double fraction = static_cast<double>(phase) / kTruePeakPhases;
      double sum = 0.0;
      for (std::size_t tap = 0; tap < kTruePeakTaps; ++tap) {
        const double offset = static_cast<double>(tap) - (kTruePeakTaps / 2 - 1);
        const double distance = fraction - offset;
        const double windowPosition = distance / (kTruePeakTaps / 2.0);
        const double window = std::abs(windowPosition) >= 1.0
            ? 0.0
            : 0.42 + 0.5 * std::cos(pi * windowPosition) +
                  0.08 * std::cos(2.0 * pi * windowPosition);
        const double coefficient = sinc(distance) * window;
        result[phase][tap] = static_cast<float>(coefficient);
        sum += coefficient;
      }
      for (std::size_t tap = 0; tap < kTruePeakTaps; ++tap) {
        // Match Float32Array's coefficient write after each normalization.
        result[phase][tap] = static_cast<float>(result[phase][tap] / sum);
      }
    }
    return result;
  }();
  return kernels;
}

double interpolationL1() {
  const auto& kernels = interpolationKernels();
  double maximum = 0.0;
  for (const auto& kernel : kernels) {
    double sum = 0.0;
    for (float coefficient : kernel) sum += std::abs(static_cast<double>(coefficient));
    maximum = std::max(maximum, sum);
  }
  return maximum;
}

void checkCancelled(const CancellationCheck& check) {
  if (check && check()) throw std::runtime_error("Playback request was superseded.");
}

void validateChannels(const float* const* input, float* const* output,
                      std::size_t channelCount, std::size_t frameCount) {
  if (channelCount > 0 && frameCount > 0 && input == nullptr) {
    throw std::invalid_argument("Input channel array is null.");
  }
  for (std::size_t channel = 0; channel < channelCount; ++channel) {
    if (frameCount > 0 && input[channel] == nullptr) throw std::invalid_argument("Input channel is null.");
    if (frameCount > 0 && output != nullptr && output[channel] == nullptr) {
      throw std::invalid_argument("Output channel is null.");
    }
    if (frameCount > 0 && output != nullptr) {
      for (std::size_t other = 0; other < channelCount; ++other) {
        if (input[channel] == output[other]) {
          throw std::invalid_argument("Input and output buffers must not alias.");
        }
        if (channel != other && output[channel] == output[other]) {
          throw std::invalid_argument("Output channels must use distinct buffers.");
        }
      }
    }
  }
  (void)frameCount;
}

double estimateOversampledPeak(const float* const* channels,
                               std::size_t channelCount,
                               std::size_t frameCount,
                               const CancellationCheck& shouldCancel) {
  const auto& kernels = interpolationKernels();
  const double l1 = interpolationL1();
  double peak = 0.0;
  for (std::size_t frame = 0; frame < frameCount; ++frame) {
    if (frame > 0 && frame % kYieldCheckFrames == 0) checkCancelled(shouldCancel);
    for (std::size_t channelIndex = 0; channelIndex < channelCount; ++channelIndex) {
      const float* channel = channels[channelIndex];
      double localPeak = 0.0;
      double localMin = std::numeric_limits<double>::infinity();
      double localMax = -std::numeric_limits<double>::infinity();
      for (std::size_t tap = 0; tap < kTruePeakTaps; ++tap) {
        const auto sampleIndex = static_cast<std::ptrdiff_t>(frame) +
            static_cast<std::ptrdiff_t>(tap) -
            static_cast<std::ptrdiff_t>(kTruePeakTaps / 2 - 1);
        if (sampleIndex >= 0 && static_cast<std::size_t>(sampleIndex) < frameCount) {
          const double sample = finiteSample(channel[sampleIndex]);
          localPeak = std::max(localPeak, std::abs(sample));
          localMin = std::min(localMin, sample);
          localMax = std::max(localMax, sample);
        }
      }
      peak = std::max(peak, localPeak);
      if (localPeak * l1 * kIntersampleSafety <= kLimiterCeiling) {
        peak = std::max(peak, localPeak * l1);
        continue;
      }
      const double localRange = localMax - localMin;
      if ((localMin >= 0.0 || localMax <= 0.0) && localRange < localPeak * 0.1) {
        peak = std::max(peak, localPeak + localRange * (l1 - 1.0) / 2.0);
        continue;
      }
      for (const auto& coefficients : kernels) {
        double reconstructed = 0.0;
        for (std::size_t tap = 0; tap < kTruePeakTaps; ++tap) {
          const auto sampleIndex = static_cast<std::ptrdiff_t>(frame) +
              static_cast<std::ptrdiff_t>(tap) -
              static_cast<std::ptrdiff_t>(kTruePeakTaps / 2 - 1);
          if (sampleIndex >= 0 && static_cast<std::size_t>(sampleIndex) < frameCount) {
            reconstructed += finiteSample(channel[sampleIndex]) * coefficients[tap];
          }
        }
        peak = std::max(peak, std::abs(reconstructed));
      }
    }
  }
  return peak;
}

} // namespace

ClipAnalysis analyzeClip(const float* const* channels, std::size_t channelCount,
                         std::size_t frameCount,
                         const CancellationCheck& shouldCancel) {
  validateChannels(channels, nullptr, channelCount, frameCount);
  checkCancelled(shouldCancel);
  ClipAnalysis result;
  for (std::size_t frame = 0; frame < frameCount; ++frame) {
    if (frame > 0 && frame % kYieldCheckFrames == 0) checkCancelled(shouldCancel);
    for (std::size_t channel = 0; channel < channelCount; ++channel) {
      const float sample = channels[channel][frame];
      if (!std::isfinite(sample)) {
        result.hasNonFinite = true;
      } else {
        result.peak = std::max(result.peak, std::abs(static_cast<double>(sample)));
      }
    }
  }
  return result;
}

double maxInterpolationL1() { return interpolationL1(); }

double conservativePeakEstimate(double samplePeak) {
  const double finitePeak = std::isfinite(samplePeak)
      ? std::max(0.0, samplePeak)
      : kLimiterCeiling;
  return finitePeak * interpolationL1() * kIntersampleSafety;
}

bool requiresProtection(const ClipAnalysis& analysis, double gain) {
  const double appliedGain = safeGain(gain);
  return analysis.hasNonFinite ||
      conservativePeakEstimate(analysis.peak * appliedGain) > kLimiterCeiling;
}

ClipPcmResult processClipPcm(const float* const* inputChannels,
                             float* const* outputChannels,
                             std::size_t channelCount,
                             std::size_t frameCount,
                             double gain,
                             double sampleRate,
                             const CancellationCheck& shouldCancel) {
  if (!std::isfinite(sampleRate) || sampleRate <= 0.0) {
    throw std::invalid_argument("Clip sample rate is invalid.");
  }
  const double framesPerBlock = sampleRate * kLimiterLookaheadSeconds;
  if (!std::isfinite(framesPerBlock) ||
      framesPerBlock >= std::ldexp(1.0, std::numeric_limits<std::size_t>::digits)) {
    throw std::invalid_argument("Clip sample rate is too large.");
  }
  validateChannels(inputChannels, outputChannels, channelCount, frameCount);
  if (channelCount > 0 && frameCount > 0 && outputChannels == nullptr) {
    throw std::invalid_argument("Output channel array is null.");
  }
  const double appliedGain = safeGain(gain);
  ClipPcmResult result;
  if (channelCount == 0 || frameCount == 0 || appliedGain == 0.0) {
    if (frameCount > 0) {
      for (std::size_t channel = 0; channel < channelCount; ++channel) {
        std::fill(outputChannels[channel], outputChannels[channel] + frameCount, 0.0f);
      }
    }
    return result;
  }

  const double roundedBlockFrames = std::floor(framesPerBlock + 0.5);
  const std::size_t blockFrames = std::max<std::size_t>(1, static_cast<std::size_t>(roundedBlockFrames));
  const std::size_t blockCount = frameCount / blockFrames + (frameCount % blockFrames != 0 ? 1 : 0);
  std::vector<float> blockPeaks(blockCount, 0.0f);
  double peak = 0.0;
  for (std::size_t block = 0; block < blockCount; ++block) {
    checkCancelled(shouldCancel);
    const std::size_t start = block * blockFrames;
    const std::size_t end = std::min(frameCount, start + blockFrames);
    double blockPeak = 0.0;
    for (std::size_t frame = start; frame < end; ++frame) {
      for (std::size_t channel = 0; channel < channelCount; ++channel) {
        const double magnitude = std::abs(finiteSample(inputChannels[channel][frame]) * appliedGain);
        if (magnitude > blockPeak) blockPeak = magnitude;
      }
    }
    blockPeaks[block] = static_cast<float>(blockPeak);
    if (blockPeak > peak) peak = blockPeak;
  }

  const double releasePerBlock = std::exp(-((static_cast<double>(blockFrames) / sampleRate) /
                                             kLimiterReleaseSeconds));
  double envelope = 1.0;
  double outputPeak = 0.0;
  for (std::size_t block = 0; block < blockCount; ++block) {
    checkCancelled(shouldCancel);
    const std::size_t start = block * blockFrames;
    const std::size_t end = std::min(frameCount, start + blockFrames);
    const double futurePeak = std::max(static_cast<double>(blockPeaks[block]),
        block + 1 < blockCount ? static_cast<double>(blockPeaks[block + 1]) : 0.0);
    const double target = futurePeak > kLimiterCeiling ? kLimiterCeiling / futurePeak : 1.0;
    const double releasedEnvelope = 1.0 - (1.0 - envelope) * releasePerBlock;
    envelope = std::min(target, releasedEnvelope);
    for (std::size_t frame = start; frame < end; ++frame) {
      for (std::size_t channel = 0; channel < channelCount; ++channel) {
        const double sample = finiteSample(inputChannels[channel][frame]) * appliedGain * envelope;
        outputChannels[channel][frame] = static_cast<float>(sample);
        outputPeak = std::max(outputPeak, std::abs(sample));
      }
    }
  }

  const double estimatedBound = outputPeak * interpolationL1() * kIntersampleSafety;
  result.usedL1Bound = estimatedBound <= kLimiterCeiling;
  double estimatedPeak = estimatedBound;
  if (!result.usedL1Bound) {
    std::vector<const float*> outputInputPointers(channelCount);
    for (std::size_t channel = 0; channel < channelCount; ++channel) {
      outputInputPointers[channel] = outputChannels[channel];
    }
    estimatedPeak = estimateOversampledPeak(outputInputPointers.data(), channelCount,
                                            frameCount, shouldCancel);
  }
  const double protectedPeak = result.usedL1Bound ? estimatedPeak : estimatedPeak * kIntersampleSafety;
  const double postGain = protectedPeak > kLimiterCeiling ? kLimiterCeiling / protectedPeak : 1.0;
  if (postGain < 1.0) {
    for (std::size_t channel = 0; channel < channelCount; ++channel) {
      for (std::size_t frame = 0; frame < frameCount; ++frame) {
        outputChannels[channel][frame] = static_cast<float>(outputChannels[channel][frame] * postGain);
      }
    }
    outputPeak *= postGain;
  }
  result.outputPeak = outputPeak;
  result.peak = std::min(kLimiterCeiling,
                         postGain < 1.0 ? protectedPeak * postGain : protectedPeak);
  return result;
}

} // namespace soundboard::playback
