package dev.sarunas.soundboard.deviceaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.content.pm.ServiceInfo
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

internal class DeviceAudioCaptureService : Service() {
  companion object {
    const val ACTION_START = "dev.sarunas.soundboard.deviceaudio.START"
    const val ACTION_STOP = "dev.sarunas.soundboard.deviceaudio.STOP"
    const val ACTION_CANCEL = "dev.sarunas.soundboard.deviceaudio.CANCEL"
    const val EXTRA_SESSION = "sessionId"
    const val EXTRA_RESULT_CODE = "projectionResultCode"
    const val EXTRA_RESULT_DATA = "projectionResultData"
    internal const val CHANNEL = "device_audio_capture"
    private const val NOTIFICATION_ID = 9032
  }

  private var sessionId: String? = null
  private var projection: MediaProjection? = null
  private var projectionCallback: MediaProjection.Callback? = null
  private var recorder: AudioRecord? = null
  private var writer: PcmWavWriter? = null
  private var output: File? = null
  private var startedAt = 0L
  private val stopping = AtomicBoolean(false)
  private val cancelRequested = AtomicBoolean(false)
  private val handler by lazy { android.os.Handler(mainLooper) }
  private var worker: Thread? = null
  private var pendingStart: Pair<Intent, Int>? = null
  private val deadlineCheck = object : Runnable {
    override fun run() {
      if (stopping.get()) return
      val elapsed = SystemClock.elapsedRealtime() - startedAt
      if (!notificationsEnabled(this@DeviceAudioCaptureService)) finish(false, "notification-disabled")
      else if (elapsed >= 120_000) finish(false, "duration-limit")
      else handler.postDelayed(this, 1_000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val requestedSession = intent?.getStringExtra(EXTRA_SESSION)
    if (intent?.action == ACTION_STOP || intent?.action == ACTION_CANCEL) {
      if (requestedSession == sessionId) finish(intent.action == ACTION_CANCEL, "notification-stop")
      else if (sessionId == null && intent.action == ACTION_CANCEL && requestedSession != null) {
        val status = CaptureStatus.read(this)
        if (status["sessionId"] == requestedSession && status["state"] in setOf("preparing", "recording", "stopping")) {
          CaptureStatus.deleteSessionFile(this, requestedSession)
          CaptureStatus.transition(this, requestedSession, setOf("preparing", "recording", "stopping"), mapOf("state" to "cancelled", "result" to null, "error" to null, "stopReason" to "cancelled"))
        }
        stopSelf(startId)
      } else if (sessionId == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    if (intent?.action != ACTION_START || requestedSession.isNullOrBlank()) { stopSelf(startId); return START_NOT_STICKY }
    if (sessionId != null) {
      if (sessionId == requestedSession) return START_NOT_STICKY
      if (stopping.get()) pendingStart = intent to startId
      return START_NOT_STICKY
    }
    if (!CaptureStatus.isCurrent(this, requestedSession, "preparing")) { stopSelf(startId); return START_NOT_STICKY }
    sessionId = requestedSession
    try {
      ensureChannel(this)
      check(notificationsEnabled(this)) { "Enable Stimmyz notifications to start recording with a visible Stop action" }
      val notification = notification()
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
      else startForeground(NOTIFICATION_ID, notification)
      val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
      val resultData = intent.parcelableIntent(EXTRA_RESULT_DATA) ?: error("Projection consent was not received")
      val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val activeProjection = manager.getMediaProjection(resultCode, resultData) ?: error("Android did not provide a media projection")
      projection = activeProjection
      val ownerSession = sessionId
      val callback = object : MediaProjection.Callback() {
        override fun onStop() {
          if (sessionId == ownerSession && projection === activeProjection) finish(cancel = false, reason = "projection-stopped")
        }
      }
      projectionCallback = callback
      activeProjection.registerCallback(callback, android.os.Handler(mainLooper))
      beginCapture(activeProjection)
    } catch (error: Throwable) {
      fail(error.message ?: "Could not start device audio capture")
    }
    return START_NOT_STICKY
  }

  private fun beginCapture(activeProjection: MediaProjection) {
    val rate = 44_100
    val config = android.media.AudioPlaybackCaptureConfiguration.Builder(activeProjection)
      .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
      .addMatchingUsage(AudioAttributes.USAGE_GAME)
      .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
      .excludeUid(applicationInfo.uid)
      .build()
    val format = AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()
    val minBuffer = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minBuffer > 0) { "This device does not support the requested playback capture format" }
    val audioRecord = AudioRecord.Builder().setAudioFormat(format)
      .setBufferSizeInBytes(maxOf(minBuffer * 2, rate / 2))
      .setAudioPlaybackCaptureConfig(config).build()
    recorder = audioRecord
    check(audioRecord.state == AudioRecord.STATE_INITIALIZED) { "Could not initialize playback capture" }
    val file = CaptureStatus.newRecording(this, sessionId!!)
    output = file
    val wav = PcmWavWriter(file, rate, maxDataBytes = 32L * 1024 * 1024 - 44)
    writer = wav
    audioRecord.startRecording()
    check(audioRecord.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Playback capture did not start" }
    startedAt = SystemClock.elapsedRealtime()
    check(CaptureStatus.transition(this, sessionId!!, setOf("preparing"), mapOf("state" to "recording", "elapsedMs" to 0L))) { "Capture session was cancelled before recording began" }
    updateNotification()
    handler.postDelayed(deadlineCheck, 1_000)
    val readThread = Thread({ readLoop(audioRecord, wav, sessionId!!) }, "DeviceAudioCapture")
    worker = readThread
    readThread.start()
  }

  private fun readLoop(audioRecord: AudioRecord, wav: PcmWavWriter, ownerSession: String) {
    val samples = ShortArray(8_192)
    try {
      while (!stopping.get() && sessionId == ownerSession) {
        val count = audioRecord.read(samples, 0, samples.size, AudioRecord.READ_BLOCKING)
        if (stopping.get() || sessionId != ownerSession) return
        if (count < 0) throw IllegalStateException("Audio capture read failed ($count)")
        if (count > 0) wav.write(samples, count)
        if (stopping.get() || sessionId != ownerSession) return
        val elapsed = SystemClock.elapsedRealtime() - startedAt
        if (!stopping.get() && sessionId == ownerSession) CaptureStatus.transition(this, ownerSession, setOf("recording"), mapOf("elapsedMs" to elapsed))
        if (elapsed >= 120_000 || wav.frames * 2 + 44 >= 32L * 1024 * 1024) {
          finish(false, if (elapsed >= 120_000) "duration-limit" else "size-limit")
          return
        }
      }
    } catch (error: Throwable) {
      if (!stopping.get() && sessionId == ownerSession) fail(error.message ?: "Device audio capture failed")
    }
  }

  private fun finish(cancel: Boolean, reason: String) {
    finish(cancel, reason, null)
  }

  private fun finish(cancel: Boolean, reason: String, failure: String?) {
    if (cancel) cancelRequested.set(true)
    if (!stopping.compareAndSet(false, true)) return
    handler.removeCallbacks(deadlineCheck)
    val id = sessionId
    if (id == null) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return }
    if (cancel) CaptureStatus.requestCancel(this, id)
    CaptureStatus.transition(this, id, setOf("preparing", "recording"), mapOf("state" to "stopping", "stopReason" to reason,
      "elapsedMs" to if (startedAt == 0L) 0L else SystemClock.elapsedRealtime() - startedAt))
    Thread({
      var terminalValues: Map<String, Any?> = mapOf("state" to "failed", "error" to "Could not finalize capture", "result" to null)
      try {
        runCatching { recorder?.let { if (it.recordingState == AudioRecord.RECORDSTATE_RECORDING) it.stop() } }
        projection?.let { active ->
          projectionCallback?.let { runCatching { active.unregisterCallback(it) } }
          projectionCallback = null
          runCatching { active.stop() }
        }
        projection = null
        val readWorker = worker
        readWorker?.takeIf { it !== Thread.currentThread() }?.join(5_000)
        if (readWorker?.isAlive == true) {
          runCatching { recorder?.release() }; recorder = null
          readWorker.join(1_000)
        }
        val readerStopped = readWorker?.isAlive != true
        runCatching { recorder?.release() }; recorder = null
        val wav = writer
        if (!readerStopped) {
          wav?.close(); writer = null; output?.delete()
          terminalValues = mapOf("state" to "failed", "error" to "Audio capture reader did not stop after the audio stream was closed", "result" to null, "stopReason" to reason)
        } else if (failure != null) {
          wav?.close(); writer = null; output?.delete()
          terminalValues = mapOf("state" to "failed", "error" to failure, "result" to null, "stopReason" to reason)
        } else if (cancelRequested.get()) {
          wav?.close(); output?.delete()
          terminalValues = mapOf("state" to "cancelled", "result" to null, "error" to null, "stopReason" to reason)
        } else {
          val result = wav?.finish()
          wav?.close(); writer = null
          if (cancelRequested.get()) {
            output?.delete()
            terminalValues = mapOf("state" to "cancelled", "result" to null, "error" to null)
          } else if (result == null || result.frames == 0L || result.peak == 0.0 || result.durationMs < 100L) {
            output?.delete()
            terminalValues = mapOf("state" to "failed", "error" to "No usable audio was captured; the source may be silent or may restrict playback capture. Try a compatible app, microphone recording, or file import.", "result" to null, "stopReason" to reason)
          } else {
            terminalValues = mapOf("state" to "ready", "error" to null, "stopReason" to reason,
              "result" to mapOf("uri" to android.net.Uri.fromFile(output!!).toString(), "durationMs" to result.durationMs,
                "sampleRate" to result.sampleRate, "channels" to result.channels, "frames" to result.frames,
                "peak" to result.peak, "rms" to result.rms, "quiet" to result.quiet))
          }
        }
      } catch (error: Throwable) {
        output?.delete()
        if (cancelRequested.get()) {
          terminalValues = mapOf("state" to "cancelled", "error" to null, "result" to null)
        } else {
          terminalValues = mapOf("state" to "failed", "error" to (error.message ?: "Could not finalize capture"), "result" to null)
        }
      } finally {
        runCatching { recorder?.release() }; recorder = null
        runCatching { writer?.close() }; writer = null
        runCatching {
          projection?.let { active -> projectionCallback?.let { active.unregisterCallback(it) }; active.stop() }
        }; projection = null; projectionCallback = null
        handler.post {
          stopForeground(STOP_FOREGROUND_REMOVE)
          val completed = CaptureStatus.complete(this, id, terminalValues)
          if (completed["state"] != "ready") output?.delete()
          output = null; worker = null; startedAt = 0L
          sessionId = null; stopping.set(false); cancelRequested.set(false)
          val pending = pendingStart
          pendingStart = null
          if (pending != null) onStartCommand(pending.first, 0, pending.second) else stopSelf()
        }
      }
    }, "DeviceAudioFinalize").start()
  }

  private fun fail(message: String) {
    finish(cancel = false, reason = "capture-failed", failure = message)
  }

  private fun notification(): Notification {
    val stopIntent = Intent(this, DeviceAudioCaptureService::class.java).setAction(ACTION_STOP).putExtra(EXTRA_SESSION, sessionId)
    val stop = PendingIntent.getService(this, 9033, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 9034, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    builder.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Recording device audio")
      .setContentText("Capture is active. Tap Stop when finished.").setOngoing(true).addAction(0, "Stop", stop)
    if (launch != null) builder.setContentIntent(launch)
    return builder.build()
  }

  private fun updateNotification() = getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification())

  override fun onDestroy() {
    if (!stopping.get() && sessionId != null) finish(false, "service-destroyed")
    super.onDestroy()
  }
}

internal fun ensureChannel(context: Context) {
  if (Build.VERSION.SDK_INT >= 26) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(DeviceAudioCaptureService.CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(DeviceAudioCaptureService.CHANNEL, "Device audio recording", NotificationManager.IMPORTANCE_LOW))
    }
  }
}

internal fun notificationsEnabled(context: Context): Boolean {
  val manager = context.getSystemService(NotificationManager::class.java)
  val channelEnabled = Build.VERSION.SDK_INT < 26 || manager.getNotificationChannel(DeviceAudioCaptureService.CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
  return manager.areNotificationsEnabled() && channelEnabled
}

@Suppress("DEPRECATION")
private fun Intent.parcelableIntent(name: String): Intent? =
  if (Build.VERSION.SDK_INT >= 33) getParcelableExtra(name, Intent::class.java) else getParcelableExtra(name)
