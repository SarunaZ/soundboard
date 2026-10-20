package dev.sarunas.soundboard.deviceaudio

import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile
import kotlin.math.sqrt

internal class PcmWavWriter(
  file: File,
  val sampleRate: Int,
  val channels: Int = 1,
  private val maxDataBytes: Long = 32L * 1024 * 1024,
) : Closeable {
  private val output: RandomAccessFile
  var frames: Long = 0
    private set
  private var sumSquares = 0.0
  private var peakValue = 0
  private var finalized = false
  val durationMs: Long get() = frames * 1000 / sampleRate
  val peak: Double get() = peakValue / 32768.0
  val rms: Double get() = if (frames == 0L) 0.0 else sqrt(sumSquares / (frames * channels)) / 32768.0
  val quiet: Boolean get() = peak < 0.003 && rms < 0.001

  init {
    require(sampleRate in 8_000..192_000 && channels in 1..2)
    val opened = RandomAccessFile(file, "rw")
    try {
      opened.setLength(0)
      opened.write(ByteArray(44))
      output = opened
    } catch (error: Throwable) {
      runCatching { opened.close() }
      throw error
    }
  }

  @Synchronized fun write(samples: ShortArray, count: Int): Int {
    check(!finalized)
    require(count in 0..samples.size && count % channels == 0)
    val writable = minOf(count, ((maxDataBytes - frames * channels * 2) / 2).toInt()).let { it - it % channels }
    val buffer = ByteArray(writable * 2)
    for (index in 0 until writable) {
      val sample = samples[index].toInt()
      if (kotlin.math.abs(sample) > peakValue) peakValue = kotlin.math.abs(sample)
      sumSquares += sample.toDouble() * sample
      buffer[index * 2] = sample.toByte()
      buffer[index * 2 + 1] = (sample shr 8).toByte()
    }
    output.seek(44L + frames * channels * 2)
    output.write(buffer)
    frames += writable / channels
    return writable
  }

  @Synchronized fun finish(): PcmWavResult {
    if (!finalized) {
      val dataBytes = frames * channels * 2
      output.seek(0)
      output.write("RIFF".toByteArray(Charsets.US_ASCII)); output.writeLe32(36 + dataBytes)
      output.write("WAVEfmt ".toByteArray(Charsets.US_ASCII)); output.writeLe32(16)
      output.writeLe16(1); output.writeLe16(channels); output.writeLe32(sampleRate.toLong())
      output.writeLe32(sampleRate.toLong() * channels * 2); output.writeLe16(channels * 2); output.writeLe16(16)
      output.write("data".toByteArray(Charsets.US_ASCII)); output.writeLe32(dataBytes)
      output.fd.sync()
      finalized = true
    }
    return PcmWavResult(frames, durationMs, sampleRate, channels, peak, rms, quiet, frames * channels * 2 >= maxDataBytes)
  }

  @Synchronized override fun close() = output.close()
  private fun RandomAccessFile.writeLe16(value: Int) { write(value and 255); write((value shr 8) and 255) }
  private fun RandomAccessFile.writeLe32(value: Long) { repeat(4) { write((value shr (8 * it)).toInt() and 255) } }
}

internal data class PcmWavResult(val frames: Long, val durationMs: Long, val sampleRate: Int, val channels: Int, val peak: Double, val rms: Double, val quiet: Boolean, val byteLimitReached: Boolean)
