#pragma once

#include <cstddef>
#include <functional>

namespace soundboard::playback {

inline constexpr double kLimiterCeiling = 0.794328235;
inline constexpr double kLimiterLookaheadSeconds = 0.004;
inline constexpr double kLimiterReleaseSeconds = 0.05;
inline constexpr double kMaxPlaybackAmplitude = 3.9810717055349722; // 10^(12/20)
inline constexpr double kIntersampleSafety = 1.0715193052376064; // 10^(0.6/20)
inline constexpr std::size_t kTruePeakTaps = 12;
inline constexpr std::size_t kTruePeakPhases = 4;

struct ClipAnalysis {
  double peak = 0.0;
  bool hasNonFinite = false;
};

struct ClipPcmResult {
  double peak = 0.0;
  double outputPeak = 0.0;
  bool usedL1Bound = false;
};

using CancellationCheck = std::function<bool()>;

// Reads channel-major PCM without changing it. A null channel pointer is
// treated as invalid input and throws std::invalid_argument.
ClipAnalysis analyzeClip(const float* const* channels, std::size_t channelCount,
                         std::size_t frameCount,
                         const CancellationCheck& shouldCancel = {});

double maxInterpolationL1();
double conservativePeakEstimate(double samplePeak);
bool requiresProtection(const ClipAnalysis& analysis, double gain);

// Applies gain and linked-channel look-ahead protection into distinct output
// buffers. Input buffers remain unchanged. Throws std::invalid_argument for
// malformed channel/rate/buffer arguments and std::runtime_error on cancel.
ClipPcmResult processClipPcm(const float* const* inputChannels,
                             float* const* outputChannels,
                             std::size_t channelCount,
                             std::size_t frameCount,
                             double gain,
                             double sampleRate,
                             const CancellationCheck& shouldCancel = {});

} // namespace soundboard::playback
