package dev.sarunas.soundboard.deviceaudio

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle

internal class DeviceAudioConsentActivity : Activity() {
  companion object {
    private const val REQUEST_AUDIO = 4110
    private const val REQUEST_NOTIFICATIONS = 4111
    private const val REQUEST_PROJECTION = 4112
    private const val EXTRA_SESSION = "sessionId"
  }

  private var sessionId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    sessionId = intent.getStringExtra(EXTRA_SESSION)
    if (sessionId.isNullOrBlank() || !isPending()) { finish(); return }
    ensureChannel(this)
    if (Build.VERSION.SDK_INT < 29) { fail("Device audio capture requires Android 10 or newer"); return }
    if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), REQUEST_AUDIO)
      return
    }
    requestNotificationsOrProjection()
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (!isPending()) { finish(); return }
    when (requestCode) {
      REQUEST_AUDIO -> if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) requestNotificationsOrProjection()
        else fail("Android recording permission is required for playback capture")
      REQUEST_NOTIFICATIONS -> checkNotificationsAndContinue()
    }
  }

  private fun requestNotificationsOrProjection() {
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
      return
    }
    checkNotificationsAndContinue()
  }

  private fun checkNotificationsAndContinue() {
    if (!isPending()) { finish(); return }
    val manager = getSystemService(android.app.NotificationManager::class.java)
    val channelEnabled = Build.VERSION.SDK_INT < 26 || manager.getNotificationChannel(DeviceAudioCaptureService.CHANNEL)?.importance != android.app.NotificationManager.IMPORTANCE_NONE
    if (!manager.areNotificationsEnabled() || !channelEnabled) {
      fail("Enable Stimmyz notifications to start a recording with a visible Stop action")
      return
    }
    val managerProjection = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    try { startActivityForResult(managerProjection.createScreenCaptureIntent(), REQUEST_PROJECTION) }
    catch (error: Throwable) { fail(error.message ?: "Could not request Android capture consent") }
  }

  @Deprecated("Android system consent result callback")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQUEST_PROJECTION) return
    if (!isPending()) { finish(); return }
    if (resultCode != RESULT_OK || data == null) {
      CaptureStatus.transition(this, sessionId!!, setOf("requesting-permission"), mapOf("state" to "cancelled", "error" to null, "result" to null, "stopReason" to "consent-cancelled"))
      finish(); return
    }
    val service = Intent(this, DeviceAudioCaptureService::class.java).apply {
      action = DeviceAudioCaptureService.ACTION_START
      putExtra(DeviceAudioCaptureService.EXTRA_SESSION, sessionId)
      putExtra(DeviceAudioCaptureService.EXTRA_RESULT_CODE, resultCode)
      putExtra(DeviceAudioCaptureService.EXTRA_RESULT_DATA, data)
    }
    try {
      if (!CaptureStatus.transition(this, sessionId!!, setOf("requesting-permission"), mapOf("state" to "preparing", "error" to null))) { finish(); return }
      if (Build.VERSION.SDK_INT >= 26) startForegroundService(service) else startService(service)
    } catch (error: Throwable) {
      CaptureStatus.transition(this, sessionId!!, setOf("preparing"), mapOf("state" to "failed", "error" to (error.message ?: "Could not start visible capture service"), "result" to null))
    }
    finish()
  }

  override fun onDestroy() {
    // Closing Stimmyz while Android consent is still visible invalidates this session.
    if (isPending()) CaptureStatus.transition(this, sessionId!!, setOf("requesting-permission"), mapOf("state" to "cancelled", "error" to null, "result" to null, "stopReason" to "consent-activity-closed"))
    super.onDestroy()
  }

  private fun isPending(): Boolean {
    val current = CaptureStatus.forSession(this, sessionId ?: return false)
    return current["state"] == "requesting-permission"
  }

  private fun fail(message: String) {
    CaptureStatus.transition(this, sessionId ?: return, setOf("requesting-permission"), mapOf("state" to "failed", "error" to message, "result" to null))
    finish()
  }
}
