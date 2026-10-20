package dev.sarunas.soundboard.deviceaudio

import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

class PcmWavWriterTest {
  @Test fun writesPcm16HeaderFromFramesAndSignalStatistics() {
    val file = File.createTempFile("device-audio", ".wav")
    try {
      PcmWavWriter(file, sampleRate = 8_000, maxDataBytes = 2_000).use { writer ->
        val samples = ShortArray(800)
        samples[0] = Short.MIN_VALUE
        samples[1] = 16_384
        writer.write(samples, samples.size)
        val result = writer.finish()
        assertEquals(800L, result.frames)
        assertEquals(100L, result.durationMs)
        assertEquals(1.0, result.peak, 0.0001)
        assertFalse(result.quiet)
      }
      RandomAccessFile(file, "r").use { wav ->
        val bytes = ByteArray(4)
        wav.readFully(bytes)
        assertEquals("RIFF", String(bytes, Charsets.US_ASCII))
        assertEquals(1_636L, readLe32(wav, 4))
        wav.seek(8)
        wav.readFully(bytes)
        assertEquals("WAVE", String(bytes, Charsets.US_ASCII))
        assertEquals(1_600L, readLe32(wav, 40))
        assertEquals(1_644L, wav.length())
      }
    } finally { file.delete() }
  }

  @Test fun truncatesAtConfiguredByteLimitAndMarksIt() {
    val file = File.createTempFile("device-audio-limit", ".wav")
    try {
      PcmWavWriter(file, sampleRate = 8_000, maxDataBytes = 4).use { writer ->
        assertEquals(2, writer.write(shortArrayOf(1, 2, 3, 4), 4))
        assertEquals(0, writer.write(shortArrayOf(5, 6), 2))
        val result = writer.finish()
        assertEquals(2L, result.frames)
        assertTrue(result.byteLimitReached)
      }
      assertEquals(48L, file.length())
    } finally { file.delete() }
  }

  @Test fun identifiesEmptyAndAllZeroSignalAsQuiet() {
    val file = File.createTempFile("device-audio-silence", ".wav")
    try {
      PcmWavWriter(file, sampleRate = 44_100).use { writer ->
        writer.write(ShortArray(512), 512)
        val result = writer.finish()
        assertEquals(512L, result.frames)
        assertEquals(0.0, result.peak, 0.0)
        assertEquals(0.0, result.rms, 0.0)
        assertTrue(result.quiet)
      }
    } finally { file.delete() }
  }

  @Test fun finalizesAnEmptyCaptureAsAValidEmptyWaveFile() {
    val file = File.createTempFile("device-audio-empty", ".wav")
    try {
      val result = PcmWavWriter(file, sampleRate = 8_000).use { it.finish() }

      assertEquals(0L, result.frames)
      assertEquals(0L, result.durationMs)
      assertTrue(result.quiet)
      RandomAccessFile(file, "r").use { wav ->
        val tag = ByteArray(4)
        wav.readFully(tag)
        assertEquals("RIFF", String(tag, Charsets.US_ASCII))
        assertEquals(36L, readLe32(wav, 4))
        wav.seek(8)
        wav.readFully(tag)
        assertEquals("WAVE", String(tag, Charsets.US_ASCII))
        assertEquals(0L, readLe32(wav, 40))
        assertEquals(44L, wav.length())
      }
    } finally { file.delete() }
  }

  @Test fun rejectsInvalidFormatBeforeTruncatingAnExistingCaptureFile() {
    val file = File.createTempFile("device-audio-invalid-format", ".wav")
    val original = byteArrayOf(1, 2, 3, 4, 5)
    try {
      file.writeBytes(original)
      val error = runCatching { PcmWavWriter(file, sampleRate = 7_999) }.exceptionOrNull()

      assertNotNull("An out-of-range sample rate must be rejected", error)
      assertTrue("Invalid configuration must not erase a pre-existing file", file.readBytes().contentEquals(original))
    } finally { file.delete() }
  }

  @Test fun closesTheOpenedHandleWhenWaveFileInitializationFails() {
    val fullDevice = File("/dev/full")
    val descriptorDirectory = File("/proc/self/fd")
    assumeTrue("This initialization-failure check requires Linux /dev/full and procfs", fullDevice.exists() && descriptorDirectory.isDirectory)
    val before = countDescriptorsFor(fullDevice, descriptorDirectory)

    val error = runCatching { PcmWavWriter(fullDevice, sampleRate = 8_000) }.exceptionOrNull()

    assertNotNull("The full device must reject WAV initialization", error)
    assertEquals("The constructor must close its descriptor after initialization fails", before, countDescriptorsFor(fullDevice, descriptorDirectory))
  }

  @Test fun closesAndRemovesOutputAfterARealTmpfsWriteFailure() {
    val faultDirectoryPath = System.getenv("DEVICE_AUDIO_FAULT_DIR")
    assumeTrue("Set DEVICE_AUDIO_FAULT_DIR to enable the constrained-filesystem test", !faultDirectoryPath.isNullOrBlank())

    val faultDirectory = File(faultDirectoryPath!!)
    val descriptorDirectory = File("/proc/self/fd")
    assertTrue("DEVICE_AUDIO_FAULT_DIR must be a writable directory: $faultDirectory", faultDirectory.isDirectory && faultDirectory.canWrite())
    assertTrue("The fault-test tmpfs must start empty", faultDirectory.listFiles().orEmpty().isEmpty())
    assertTrue("The constrained-filesystem test requires procfs", descriptorDirectory.isDirectory)
    val fileStore = Files.getFileStore(faultDirectory.toPath())
    assertEquals("The configured fault directory must be a tmpfs mount", "tmpfs", fileStore.type().lowercase())
    assertTrue("The fault-test tmpfs should be at most 128 KiB, got ${fileStore.totalSpace} bytes", fileStore.totalSpace <= 128L * 1024)

    val file = File.createTempFile("device-audio-enospc", ".wav", faultDirectory)
    val descriptorsBefore = countDescriptorsFor(file, descriptorDirectory)
    var writer: PcmWavWriter? = null
    var writeError: Throwable? = null
    var partialOutputLength = 0L
    var closed = false
    var descriptorsAfterClose: Int? = null
    var outputRemoved = false
    try {
      val activeWriter = PcmWavWriter(file, sampleRate = 8_000)
      writer = activeWriter
      val samples = ShortArray(64 * 1024)
      writeError = runCatching { activeWriter.write(samples, samples.size) }.exceptionOrNull()
      partialOutputLength = file.length()
    } finally {
      try {
        writer?.close()
        closed = true
      } finally {
        descriptorsAfterClose = countDescriptorsFor(file, descriptorDirectory)
        outputRemoved = file.delete() || !file.exists()
      }
    }

    assertNotNull("A 128 KiB write must fail on the configured 64 KiB tmpfs after the WAV header", writeError)
    assertTrue("Expected a real filesystem IOException, got $writeError", writeError is IOException)
    assertTrue("Expected ENOSPC, got $writeError", writeError?.message.orEmpty().lowercase().contains("no space left"))
    assertTrue("The failed write must leave evidence of a partial data write, file length was $partialOutputLength", partialOutputLength > 44L)
    assertTrue("The writer must close before deleting its partial output", closed)
    assertTrue("The unique partial output file must be removed", outputRemoved)
    assertFalse("No partial output may remain", file.exists())
    assertEquals("The failed-write descriptor must be closed before unlink", descriptorsBefore, descriptorsAfterClose)
  }

  private fun readLe32(file: RandomAccessFile, offset: Long): Long {
    file.seek(offset)
    return file.read().toLong() or (file.read().toLong() shl 8) or
      (file.read().toLong() shl 16) or (file.read().toLong() shl 24)
  }

  private fun countDescriptorsFor(target: File, descriptorDirectory: File): Int =
    descriptorDirectory.listFiles().orEmpty().count { descriptor ->
      runCatching { Files.readSymbolicLink(descriptor.toPath()).toString() == target.absolutePath }.getOrDefault(false)
    }
}
