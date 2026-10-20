package dev.sarunas.soundboard.deviceaudio

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SoundboardDeviceAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SoundboardDeviceAudio")
    Constants("isSupported" to (Build.VERSION.SDK_INT >= 29))

    AsyncFunction("getStatus") {
      val context = appContext.reactContext ?: error("React context is unavailable")
      CaptureStatus.sweepStale(context)
      CaptureStatus.read(context)
    }

    AsyncFunction("start") { sessionId: String ->
      require(sessionId.matches(Regex("[A-Za-z0-9_-]{1,80}"))) { "Invalid device audio session id" }
      val context = appContext.reactContext ?: error("React context is unavailable")
      CaptureStatus.sweepStale(context)
      if (Build.VERSION.SDK_INT < 29) {
        CaptureStatus.begin(context, sessionId)
        CaptureStatus.transition(context, sessionId, setOf("requesting-permission"), mapOf("state" to "failed", "error" to "Device audio capture requires Android 10 or newer"))
        return@AsyncFunction CaptureStatus.forSession(context, sessionId)
      }
      val (status, created) = CaptureStatus.begin(context, sessionId)
      if (!created) return@AsyncFunction status
      val activity = appContext.activityProvider?.currentActivity
      if (activity == null) {
        CaptureStatus.transition(context, sessionId, setOf("requesting-permission"), mapOf("state" to "failed", "error" to "Stimmyz must be open to request capture consent"))
      } else {
        try {
          activity.startActivity(Intent(activity, DeviceAudioConsentActivity::class.java).putExtra("sessionId", sessionId))
        } catch (error: Throwable) {
          CaptureStatus.transition(context, sessionId, setOf("requesting-permission"), mapOf("state" to "failed", "error" to (error.message ?: "Could not open capture permission flow")))
        }
      }
      CaptureStatus.forSession(context, sessionId)
    }

    AsyncFunction("stop") { sessionId: String ->
      val context = appContext.reactContext ?: error("React context is unavailable")
      var status = CaptureStatus.read(context)
      if (status["sessionId"] != sessionId) return@AsyncFunction status
      when (status["state"]) {
        "recording", "preparing", "stopping" -> try {
          context.startService(Intent(context, DeviceAudioCaptureService::class.java).setAction(DeviceAudioCaptureService.ACTION_STOP).putExtra(DeviceAudioCaptureService.EXTRA_SESSION, sessionId))
        } catch (error: Throwable) {
          CaptureStatus.transition(context, sessionId, setOf("recording", "preparing", "stopping"), mapOf("state" to "failed", "error" to (error.message ?: "Could not stop capture")))
        }
        "requesting-permission" -> CaptureStatus.transition(context, sessionId, setOf("requesting-permission"), mapOf("state" to "cancelled", "result" to null, "stopReason" to "stopped-before-consent"))
      }
      CaptureStatus.forSession(context, sessionId)
    }

    AsyncFunction("cancel") { sessionId: String ->
      val context = appContext.reactContext ?: error("React context is unavailable")
      val status = CaptureStatus.read(context)
      if (status["sessionId"] != sessionId) return@AsyncFunction Unit
      when (status["state"]) {
        "recording", "preparing", "stopping" -> {
          if (CaptureStatus.requestCancel(context, sessionId)) {
            runCatching { context.startService(Intent(context, DeviceAudioCaptureService::class.java).setAction(DeviceAudioCaptureService.ACTION_CANCEL).putExtra(DeviceAudioCaptureService.EXTRA_SESSION, sessionId)) }
          } else CaptureStatus.cancelReady(context, sessionId)
        }
        "requesting-permission" -> CaptureStatus.transition(context, sessionId, setOf("requesting-permission"), mapOf("state" to "cancelled", "result" to null, "error" to null, "stopReason" to "cancelled"))
        "ready" -> CaptureStatus.cancelReady(context, sessionId)
      }
      Unit
    }

    AsyncFunction("release") { sessionId: String ->
      val context = appContext.reactContext ?: error("React context is unavailable")
      val status = CaptureStatus.read(context)
      if (status["sessionId"] != sessionId) return@AsyncFunction Unit
      check(status["state"] !in setOf("requesting-permission", "preparing", "recording", "stopping")) { "Stop or cancel the active capture before releasing it" }
      CaptureStatus.deleteResult(context, status)
      CaptureStatus.transition(context, sessionId, setOf("ready", "failed", "cancelled"), CaptureStatus.idle())
      Unit
    }
  }
}
