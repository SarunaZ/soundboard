package dev.sarunas.soundboard.deviceaudio

import expo.modules.kotlin.jni.NativeArrayBuffer
import expo.modules.kotlin.typedarray.Float32Array
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

private const val MAX_PLAYBACK_AMPLITUDE = 3.9810717055349722 // 10^(12/20)

/** Owns PCM snapshots and performs the expensive DSP away from the JS thread. */
internal interface PlaybackDsp {
  fun analyze(inputs: Array<ByteBuffer>, frames: Int, gain: Double, cancelled: AtomicBoolean): DoubleArray
  fun process(inputs: Array<ByteBuffer>, outputs: Array<ByteBuffer>, frames: Int, gain: Double, sampleRate: Double, cancelled: AtomicBoolean): Double
}

private object JniPlaybackDsp : PlaybackDsp {
  override fun analyze(inputs: Array<ByteBuffer>, frames: Int, gain: Double, cancelled: AtomicBoolean) =
    NativePlaybackDsp.analyze(inputs, frames, gain, cancelled)
  override fun process(inputs: Array<ByteBuffer>, outputs: Array<ByteBuffer>, frames: Int, gain: Double, sampleRate: Double, cancelled: AtomicBoolean) =
    NativePlaybackDsp.process(inputs, outputs, frames, gain, sampleRate, cancelled)
}

internal class PlaybackPreparation(private val dsp: PlaybackDsp = JniPlaybackDsp) {
  private enum class State { PENDING, READY, FAILED, CANCELLED }

  private data class Job(
    val id: String,
    @Volatile var inputs: Array<ByteBuffer>?,
    val frames: Int,
    val gain: Double,
    val sampleRate: Double,
    val inputBytes: Long,
    val cancelled: AtomicBoolean = AtomicBoolean(false),
    @Volatile var state: State = State.PENDING,
    @Volatile var processed: Boolean = false,
    @Volatile var clipGain: Double = 1.0,
    @Volatile var peakBound: Double = 0.0,
    @Volatile var outputs: Array<ByteBuffer>? = null,
    @Volatile var outputBytes: Long = 0L,
    @Volatile var message: String? = null,
  )

  private val lock = Any()
  private val executor = Executors.newSingleThreadExecutor { task ->
    Thread(task, "soundboard-playback-dsp").apply { isDaemon = true }
  }
  private val jobs = LinkedHashMap<String, Job>()
  private var reservedInputBytes = 0L
  private var residentBytes = 0L
  private var closed = false

  fun start(channels: List<Float32Array>, gain: Double, sampleRate: Double): String {
    require(channels.isNotEmpty() && channels.size <= MAX_CHANNELS) { "Playback channel count is invalid." }
    require(gain.isFinite() && gain in 0.0..MAX_PLAYBACK_AMPLITUDE) { "Playback gain is invalid." }
    require(sampleRate.isFinite() && sampleRate in MIN_SAMPLE_RATE..MAX_SAMPLE_RATE) { "Playback sample rate is invalid." }
    val frames = channels.first().length
    require(frames > 0) { "Playback clip is empty." }
    require(channels.all { it.length == frames && it.byteLength.toLong() == frames.toLong() * Float.SIZE_BYTES }) {
      "Playback channels have inconsistent lengths."
    }
    val bytesPerChannel = frames.toLong() * Float.SIZE_BYTES
    val inputBytes = bytesPerChannel * channels.size
    require(inputBytes <= MAX_CLIP_BYTES) { "Playback clip exceeds the native memory limit." }

    val job = synchronized(lock) {
      check(!closed) { "Playback preparation is unavailable." }
      check(jobs.size < MAX_JOBS) { "Too many playback preparations are pending." }
      check(inputBytes <= MAX_QUEUED_INPUT_BYTES - reservedInputBytes) {
        "Queued playback audio exceeds the native memory limit."
      }
      check(inputBytes <= MAX_RESIDENT_BYTES - residentBytes) { "Queued playback audio exceeds the native memory limit." }
      reservedInputBytes += inputBytes
      residentBytes += inputBytes
      try {
        val snapshots = Array(channels.size) { index ->
          val source = channels[index].toDirectBuffer().order(ByteOrder.nativeOrder())
          require(source.isDirect && source.remaining() == bytesPerChannel.toInt()) {
            "Playback channel buffer is invalid."
          }
          ByteBuffer.allocateDirect(bytesPerChannel.toInt()).order(ByteOrder.nativeOrder()).apply {
            put(source)
            rewind()
          }
        }
        val id = UUID.randomUUID().toString()
        Job(id, snapshots, frames, gain, sampleRate, inputBytes).also { jobs[id] = it }
      } catch (error: Throwable) {
        reservedInputBytes -= inputBytes
        residentBytes -= inputBytes
        throw if (error is OutOfMemoryError) IllegalStateException("Not enough memory to prepare playback audio.") else error
      }
    }

    try {
      queue(job)
    } catch (error: Throwable) {
      synchronized(lock) {
        jobs.remove(job.id)
        reservedInputBytes -= job.inputBytes
        residentBytes -= job.inputBytes
      }
      throw IllegalStateException("Playback preparation could not be queued.", error)
    }
    return job.id
  }

  /** Enqueues already-owned direct buffers; also gives JVM tests a no-JSI entry point. */
  internal fun enqueueOwnedSnapshot(inputs: Array<ByteBuffer>, frames: Int, gain: Double, sampleRate: Double): String {
    require(inputs.isNotEmpty() && inputs.size <= MAX_CHANNELS) { "Playback channel count is invalid." }
    require(frames > 0 && gain.isFinite() && gain in 0.0..MAX_PLAYBACK_AMPLITUDE) { "Playback request is invalid." }
    require(sampleRate.isFinite() && sampleRate in MIN_SAMPLE_RATE..MAX_SAMPLE_RATE) { "Playback sample rate is invalid." }
    val bytesPerChannel = frames.toLong() * Float.SIZE_BYTES
    require(bytesPerChannel <= Int.MAX_VALUE && inputs.all { it.isDirect && it.capacity().toLong() == bytesPerChannel }) {
      "Playback channel buffer is invalid."
    }
    val inputBytes = bytesPerChannel * inputs.size
    require(inputBytes <= MAX_CLIP_BYTES) { "Playback clip exceeds the native memory limit." }
    val job = synchronized(lock) {
      check(!closed) { "Playback preparation is unavailable." }
      check(jobs.size < MAX_JOBS) { "Too many playback preparations are pending." }
      check(inputBytes <= MAX_QUEUED_INPUT_BYTES - reservedInputBytes && inputBytes <= MAX_RESIDENT_BYTES - residentBytes) {
        "Queued playback audio exceeds the native memory limit."
      }
      reservedInputBytes += inputBytes
      residentBytes += inputBytes
      val id = UUID.randomUUID().toString()
      Job(id, inputs, frames, gain, sampleRate, inputBytes).also { jobs[id] = it }
    }
    try {
      queue(job)
    } catch (error: Throwable) {
      synchronized(lock) {
        jobs.remove(job.id)
        reservedInputBytes -= job.inputBytes
        residentBytes -= job.inputBytes
      }
      throw IllegalStateException("Playback preparation could not be queued.", error)
    }
    return job.id
  }

  private fun queue(job: Job) {
    executor.execute { finish(job, process(job)) }
  }

  fun poll(id: String): Map<String, Any?> = synchronized(lock) {
    val job = jobs[id] ?: return@synchronized mapOf("state" to "failed", "message" to "Playback preparation was not found.")
    when (job.state) {
      State.PENDING -> mapOf("state" to "pending")
      State.CANCELLED -> {
        jobs.remove(id)
        residentBytes = (residentBytes - job.outputBytes).coerceAtLeast(0L)
        mapOf("state" to "cancelled")
      }
      State.FAILED -> {
        jobs.remove(id)
        residentBytes = (residentBytes - job.outputBytes).coerceAtLeast(0L)
        mapOf("state" to "failed", "message" to (job.message ?: "Playback preparation failed."))
      }
      State.READY -> {
        jobs.remove(id)
        residentBytes = (residentBytes - job.outputBytes).coerceAtLeast(0L)
        val outputs = job.outputs?.map { NativeArrayBuffer.wrap(it) } ?: emptyList<NativeArrayBuffer>()
        mapOf(
          "state" to "ready",
          "processed" to job.processed,
          "clipGain" to job.clipGain,
          "peakBound" to job.peakBound,
          "channels" to outputs,
        )
      }
    }
  }

  fun cancel(id: String) = synchronized(lock) {
    val job = jobs[id] ?: return@synchronized
    if (job.state == State.READY) {
      job.cancelled.set(true)
      job.outputs = null
      residentBytes = (residentBytes - job.outputBytes).coerceAtLeast(0L)
      job.outputBytes = 0L
      job.state = State.CANCELLED
      return@synchronized
    }
    if (job.state != State.PENDING) return@synchronized
    job.cancelled.set(true)
    Unit
  }

  private data class Completion(val state: State, val message: String? = null)

  private fun process(job: Job): Completion {
    try {
      if (job.cancelled.get()) return Completion(State.CANCELLED)
      val inputs = job.inputs ?: return Completion(State.FAILED, "Playback input buffers were released early.")
      val analysis = dsp.analyze(inputs, job.frames, job.gain, job.cancelled)
      if (job.cancelled.get()) return Completion(State.CANCELLED)
      job.processed = analysis[2] != 0.0
      job.clipGain = job.gain
      if (!job.processed) {
        job.peakBound = min(LIMITER_CEILING, analysis[3])
      } else {
        job.clipGain = 1.0
        val outputBytes = job.frames.toLong() * Float.SIZE_BYTES * inputs.size
        require(outputBytes <= MAX_CLIP_BYTES && outputBytes <= Int.MAX_VALUE) { "Protected playback output exceeds the native memory limit." }
        synchronized(lock) {
          check(outputBytes <= MAX_RESIDENT_BYTES - residentBytes) { "Not enough memory to protect this playback clip." }
          residentBytes += outputBytes
          job.outputBytes = outputBytes
        }
        val outputs = try {
          Array(inputs.size) { ByteBuffer.allocateDirect((job.frames.toLong() * Float.SIZE_BYTES).toInt()).order(ByteOrder.nativeOrder()) }
        } catch (_: OutOfMemoryError) {
          throw IllegalStateException("Not enough memory to protect this playback clip.")
        }
        if (job.cancelled.get()) return Completion(State.CANCELLED)
        val peak = dsp.process(inputs, outputs, job.frames, job.gain, job.sampleRate, job.cancelled)
        job.peakBound = min(LIMITER_CEILING, peak)
        job.outputs = outputs
      }
      return Completion(State.READY)
    } catch (error: Throwable) {
      val message = if (error is OutOfMemoryError) "Not enough memory to prepare playback audio." else error.message ?: "Playback preparation failed."
      return Completion(if (job.cancelled.get()) State.CANCELLED else State.FAILED, message)
    }
  }

  private fun finish(job: Job, completion: Completion) = synchronized(lock) {
    reservedInputBytes = (reservedInputBytes - job.inputBytes).coerceAtLeast(0L)
    residentBytes = (residentBytes - job.inputBytes).coerceAtLeast(0L)
    // process() has returned, so JNI and its local references no longer own the buffers.
    job.inputs = null
    val finalState = if (job.cancelled.get()) State.CANCELLED else completion.state
    if (finalState != State.READY) {
      job.outputs = null
      residentBytes = (residentBytes - job.outputBytes).coerceAtLeast(0L)
      job.outputBytes = 0L
    }
    job.message = completion.message
    job.state = finalState
  }

  fun close() = synchronized(lock) {
    if (closed) return@synchronized
    closed = true
    jobs.values.forEach { job ->
      job.cancelled.set(true)
      job.outputs = null
      job.state = State.CANCELLED
    }
    jobs.clear()
    reservedInputBytes = 0L
    residentBytes = 0L
    executor.shutdownNow()
  }

  companion object {
    private const val MAX_CHANNELS = 32
    private const val MAX_JOBS = 8
    private const val MAX_CLIP_BYTES = 128L * 1024L * 1024L
    private const val MAX_QUEUED_INPUT_BYTES = 128L * 1024L * 1024L
    private const val MAX_RESIDENT_BYTES = 128L * 1024L * 1024L
    private const val MIN_SAMPLE_RATE = 1000.0
    private const val MAX_SAMPLE_RATE = 384000.0
    private const val LIMITER_CEILING = 0.794328235
  }
}
