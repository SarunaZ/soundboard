package dev.sarunas.soundboard.deviceaudio

import androidx.annotation.Keep
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/** JNI boundary accepts only module-owned direct buffers, never JS runtime views. */
@Keep
internal object NativePlaybackDsp {
  init { System.loadLibrary("soundboard_playback_dsp") }

  @Keep @JvmStatic external fun analyze(
    inputs: Array<ByteBuffer>, frames: Int, gain: Double, cancelled: AtomicBoolean,
  ): DoubleArray

  @Keep @JvmStatic external fun process(
    inputs: Array<ByteBuffer>, outputs: Array<ByteBuffer>, frames: Int,
    gain: Double, sampleRate: Double, cancelled: AtomicBoolean,
  ): Double
}
