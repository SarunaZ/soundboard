package dev.sarunas.soundboard.deviceaudio

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackPreparationTest {
  @Test
  fun cancellationStaysPendingUntilDspReturnsAndBuffersAreReleased() {
    val dsp = BlockingDsp()
    val preparation = PlaybackPreparation(dsp)
    try {
      val input = ByteBuffer.allocateDirect(8).order(ByteOrder.nativeOrder()).apply {
        putFloat(0.95f)
        putFloat(-0.95f)
        rewind()
      }
      val jobId = preparation.enqueueOwnedSnapshot(arrayOf(input), frames = 2, gain = 2.0, sampleRate = 48000.0)

      assertTrue("DSP did not reach the blocked native call", dsp.entered.await(2, TimeUnit.SECONDS))
      preparation.cancel(jobId)

      assertEquals("pending", preparation.poll(jobId)["state"])
      assertEquals("pending", preparation.poll(jobId)["state"])

      dsp.release.countDown()
      val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
      var state: String
      do {
        state = preparation.poll(jobId)["state"] as String
        if (state == "pending") Thread.sleep(5)
      } while (state == "pending" && System.nanoTime() < deadline)
      assertEquals("cancelled", state)
      assertEquals("failed", preparation.poll(jobId)["state"])
    } finally {
      dsp.release.countDown()
      preparation.close()
    }
  }

  private class BlockingDsp : PlaybackDsp {
    val entered = CountDownLatch(1)
    val release = CountDownLatch(1)

    override fun analyze(inputs: Array<ByteBuffer>, frames: Int, gain: Double, cancelled: AtomicBoolean) =
      doubleArrayOf(0.95, 0.0, 1.0, 1.0)

    override fun process(
      inputs: Array<ByteBuffer>, outputs: Array<ByteBuffer>, frames: Int,
      gain: Double, sampleRate: Double, cancelled: AtomicBoolean,
    ): Double {
      entered.countDown()
      check(release.await(2, TimeUnit.SECONDS)) { "test DSP was not released" }
      outputs.forEach { output ->
        output.putFloat(0.5f)
        output.putFloat(-0.5f)
      }
      return 0.6
    }
  }
}
