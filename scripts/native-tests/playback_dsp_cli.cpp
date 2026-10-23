#include "../../app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp.h"

#include <cstdint>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <vector>

namespace {

template <typename T>
bool readValue(T& value) {
  return static_cast<bool>(std::cin.read(reinterpret_cast<char*>(&value), sizeof(T)));
}

template <typename T>
void writeValue(const T& value) {
  std::cout.write(reinterpret_cast<const char*>(&value), sizeof(T));
}

std::size_t parseSize(const char* value) {
  char* end = nullptr;
  const unsigned long long parsed = std::strtoull(value, &end, 10);
  if (end == value || *end != '\0' || parsed > std::numeric_limits<std::size_t>::max()) {
    throw std::invalid_argument("Invalid integer argument.");
  }
  return static_cast<std::size_t>(parsed);
}

double parseDouble(const char* value) {
  char* end = nullptr;
  const double parsed = std::strtod(value, &end);
  if (end == value || *end != '\0') throw std::invalid_argument("Invalid numeric argument.");
  return parsed;
}

} // namespace

int main(int argc, char** argv) {
  try {
    if (argc != 5) {
      std::cerr << "usage: playback_dsp_cli CHANNELS FRAMES SAMPLE_RATE GAIN < channel-major-f32\n";
      return 2;
    }
    const std::size_t channelCount = parseSize(argv[1]);
    const std::size_t frameCount = parseSize(argv[2]);
    const double sampleRate = parseDouble(argv[3]);
    const double gain = parseDouble(argv[4]);
    if (channelCount > 8 || frameCount > 2880000 || channelCount * frameCount > 23040000) {
      throw std::invalid_argument("Input exceeds the CLI test limits.");
    }

    std::vector<std::vector<float>> input(channelCount, std::vector<float>(frameCount));
    std::vector<std::vector<float>> output(channelCount, std::vector<float>(frameCount));
    std::vector<const float*> inputPointers(channelCount);
    std::vector<float*> outputPointers(channelCount);
    for (std::size_t channel = 0; channel < channelCount; ++channel) {
      inputPointers[channel] = input[channel].data();
      outputPointers[channel] = output[channel].data();
      if (!std::cin.read(reinterpret_cast<char*>(input[channel].data()),
                         static_cast<std::streamsize>(frameCount * sizeof(float)))) {
        throw std::runtime_error("Input ended before all PCM samples were read.");
      }
    }

    const auto coreStart = std::chrono::steady_clock::now();
    const auto analysis = soundboard::playback::analyzeClip(inputPointers.data(), channelCount, frameCount);
    const bool protectionRequired = soundboard::playback::requiresProtection(analysis, gain);
    const auto result = soundboard::playback::processClipPcm(
        inputPointers.data(), outputPointers.data(), channelCount, frameCount, gain, sampleRate);
    const auto coreEnd = std::chrono::steady_clock::now();
    const double coreMilliseconds =
        std::chrono::duration<double, std::milli>(coreEnd - coreStart).count();
    std::cerr << "CORE_DSP_MS=" << coreMilliseconds << '\n';

    std::cout.write("SBPD", 4);
    const std::uint32_t outputChannels = static_cast<std::uint32_t>(channelCount);
    const std::uint64_t outputFrames = static_cast<std::uint64_t>(frameCount);
    const std::uint32_t hasNonFinite = analysis.hasNonFinite ? 1u : 0u;
    const std::uint32_t needsProtection = protectionRequired ? 1u : 0u;
    const std::uint32_t usedL1Bound = result.usedL1Bound ? 1u : 0u;
    writeValue(outputChannels);
    writeValue(outputFrames);
    writeValue(hasNonFinite);
    writeValue(needsProtection);
    writeValue(analysis.peak);
    writeValue(result.peak);
    writeValue(result.outputPeak);
    writeValue(usedL1Bound);
    for (const auto& channel : output) {
      std::cout.write(reinterpret_cast<const char*>(channel.data()),
                      static_cast<std::streamsize>(channel.size() * sizeof(float)));
    }
    if (!std::cout) throw std::runtime_error("Could not write test output.");
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "playback_dsp_cli: " << error.what() << '\n';
    return 1;
  }
}
