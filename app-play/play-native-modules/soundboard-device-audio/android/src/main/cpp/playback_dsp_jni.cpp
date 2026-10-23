#include "playback_dsp.h"

#include <jni.h>

#include <cmath>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
constexpr jsize kMaxChannels = 32;
constexpr jlong kMaxBufferBytes = 128LL * 1024LL * 1024LL;

void throwJava(JNIEnv* env, const char* className, const std::string& message) {
  if (env->ExceptionCheck()) return;
  jclass type = env->FindClass(className);
  if (type != nullptr) env->ThrowNew(type, message.c_str());
}

struct CancellationProbe {
  JNIEnv* env;
  jobject token;
  jmethodID get;

  bool operator()() const {
    return env->CallBooleanMethod(token, get) == JNI_TRUE;
  }
};

CancellationProbe cancellationProbe(JNIEnv* env, jobject token) {
  jclass type = env->GetObjectClass(token);
  if (type == nullptr) throw std::runtime_error("Could not inspect cancellation token.");
  jmethodID get = env->GetMethodID(type, "get", "()Z");
  env->DeleteLocalRef(type);
  if (get == nullptr || env->ExceptionCheck()) throw std::runtime_error("Cancellation token is invalid.");
  return {env, token, get};
}

std::vector<const float*> readInputs(JNIEnv* env, jobjectArray buffers,
                                     jint frames) {
  if (buffers == nullptr) throw std::invalid_argument("Input buffers are null.");
  const jsize count = env->GetArrayLength(buffers);
  if (count < 1 || count > kMaxChannels) throw std::invalid_argument("Playback channel count is invalid.");
  if (frames < 1) throw std::invalid_argument("Playback frame count is invalid.");
  const uint64_t byteCount = static_cast<uint64_t>(frames) * sizeof(float);
  if (byteCount > static_cast<uint64_t>(kMaxBufferBytes)) throw std::invalid_argument("Playback channel is too large.");
  std::vector<const float*> result;
  result.reserve(static_cast<std::size_t>(count));
  const uint64_t totalBytes = byteCount * static_cast<uint64_t>(count);
  if (totalBytes > static_cast<uint64_t>(kMaxBufferBytes)) throw std::invalid_argument("Playback input exceeds the native memory limit.");
  for (jsize i = 0; i < count; ++i) {
    jobject buffer = env->GetObjectArrayElement(buffers, i);
    if (buffer == nullptr) throw std::invalid_argument("Input buffer is null.");
    const jlong capacity = env->GetDirectBufferCapacity(buffer);
    void* data = env->GetDirectBufferAddress(buffer);
    env->DeleteLocalRef(buffer);
    if (data == nullptr || capacity != static_cast<jlong>(byteCount) ||
        reinterpret_cast<std::uintptr_t>(data) % alignof(float) != 0) {
      throw std::invalid_argument("Input buffer is not a correctly sized direct float buffer.");
    }
    result.push_back(static_cast<const float*>(data));
  }
  if (env->ExceptionCheck()) throw std::runtime_error("Could not read playback input buffers.");
  return result;
}

std::vector<float*> readOutputs(JNIEnv* env, jobjectArray buffers, jint frames,
                               jsize channelCount) {
  if (buffers == nullptr || env->GetArrayLength(buffers) != channelCount) {
    throw std::invalid_argument("Output channel count is invalid.");
  }
  const uint64_t byteCount = static_cast<uint64_t>(frames) * sizeof(float);
  const uint64_t outputBytes = byteCount * static_cast<uint64_t>(channelCount);
  const uint64_t inputBytes = outputBytes;
  if (outputBytes > static_cast<uint64_t>(kMaxBufferBytes) ||
      inputBytes > static_cast<uint64_t>(kMaxBufferBytes) - outputBytes) {
    throw std::invalid_argument("Playback input and output exceed the native memory limit.");
  }
  std::vector<float*> result;
  result.reserve(static_cast<std::size_t>(channelCount));
  for (jsize i = 0; i < channelCount; ++i) {
    jobject buffer = env->GetObjectArrayElement(buffers, i);
    if (buffer == nullptr) throw std::invalid_argument("Output buffer is null.");
    const jlong capacity = env->GetDirectBufferCapacity(buffer);
    void* data = env->GetDirectBufferAddress(buffer);
    env->DeleteLocalRef(buffer);
    if (data == nullptr || capacity != static_cast<jlong>(byteCount) ||
        reinterpret_cast<std::uintptr_t>(data) % alignof(float) != 0) {
      throw std::invalid_argument("Output buffer is not a correctly sized direct float buffer.");
    }
    result.push_back(static_cast<float*>(data));
  }
  if (env->ExceptionCheck()) throw std::runtime_error("Could not read playback output buffers.");
  return result;
}

void validateGain(jdouble gain) {
  if (!std::isfinite(gain) || gain < 0.0 || gain > soundboard::playback::kMaxPlaybackAmplitude) {
    throw std::invalid_argument("Playback gain is invalid.");
  }
}
} // namespace

extern "C" JNIEXPORT jdoubleArray JNICALL
Java_dev_sarunas_soundboard_deviceaudio_NativePlaybackDsp_analyze(
    JNIEnv* env, jclass, jobjectArray buffers, jint frames, jdouble gain,
    jobject cancellationToken) {
  try {
    validateGain(gain);
    if (cancellationToken == nullptr) throw std::invalid_argument("Cancellation token is null.");
    const auto inputs = readInputs(env, buffers, frames);
    const auto probe = cancellationProbe(env, cancellationToken);
    const auto check = [probe]() { return probe(); };
    const auto analysis = soundboard::playback::analyzeClip(
        inputs.data(), inputs.size(), static_cast<std::size_t>(frames), check);
    const bool protect = soundboard::playback::requiresProtection(analysis, gain);
    const double estimate = soundboard::playback::conservativePeakEstimate(analysis.peak * gain);
    const jdouble values[] = {analysis.peak, analysis.hasNonFinite ? 1.0 : 0.0,
                              protect ? 1.0 : 0.0, estimate};
    jdoubleArray result = env->NewDoubleArray(4);
    if (result == nullptr) return nullptr;
    env->SetDoubleArrayRegion(result, 0, 4, values);
    return result;
  } catch (const std::invalid_argument& error) {
    throwJava(env, "java/lang/IllegalArgumentException", error.what());
  } catch (const std::exception& error) {
    throwJava(env, "java/lang/IllegalStateException", error.what());
  } catch (...) {
    throwJava(env, "java/lang/IllegalStateException", "Native playback analysis failed.");
  }
  return nullptr;
}

extern "C" JNIEXPORT jdouble JNICALL
Java_dev_sarunas_soundboard_deviceaudio_NativePlaybackDsp_process(
    JNIEnv* env, jclass, jobjectArray inputBuffers, jobjectArray outputBuffers,
    jint frames, jdouble gain, jdouble sampleRate, jobject cancellationToken) {
  try {
    validateGain(gain);
    if (!std::isfinite(sampleRate) || sampleRate < 1000.0 || sampleRate > 384000.0) {
      throw std::invalid_argument("Playback sample rate is invalid.");
    }
    if (cancellationToken == nullptr) throw std::invalid_argument("Cancellation token is null.");
    const auto inputs = readInputs(env, inputBuffers, frames);
    const auto outputs = readOutputs(env, outputBuffers, frames, static_cast<jsize>(inputs.size()));
    std::vector<const float*> inputPointers(inputs.begin(), inputs.end());
    const auto probe = cancellationProbe(env, cancellationToken);
    const auto check = [probe]() { return probe(); };
    const auto result = soundboard::playback::processClipPcm(
        inputPointers.data(), outputs.data(), outputs.size(),
        static_cast<std::size_t>(frames), gain, sampleRate, check);
    return result.peak;
  } catch (const std::invalid_argument& error) {
    throwJava(env, "java/lang/IllegalArgumentException", error.what());
  } catch (const std::exception& error) {
    throwJava(env, "java/lang/IllegalStateException", error.what());
  } catch (...) {
    throwJava(env, "java/lang/IllegalStateException", "Native playback processing failed.");
  }
  return 0.0;
}
