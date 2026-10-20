package dev.sarunas.soundboard.deviceaudio

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File

internal object CaptureStatus {
  private const val PREFS = "device_audio_capture"
  private const val KEY = "status"
  private const val OWNER = "owner"
  private const val CANCEL = "cancelRequested"
  private val lock = Any()
  private val processToken = java.util.UUID.randomUUID().toString()
  private val states = setOf("idle", "requesting-permission", "preparing", "recording", "stopping", "ready", "failed", "cancelled")

  fun read(context: Context): Map<String, Any?> = synchronized(lock) {
    recoverOrphan(context)
    decode(context)
  }

  fun begin(context: Context, sessionId: String): Pair<Map<String, Any?>, Boolean> = synchronized(lock) {
    recoverOrphan(context)
    val old = decode(context)
    if (old["sessionId"] == sessionId && old["state"] in activeOrReady) return old to false
    check(old["state"] in setOf("idle", "failed", "cancelled")) { "Release the previous device audio session first" }
    val value = idle().toMutableMap().apply {
      put("sessionId", sessionId); put("state", "requesting-permission")
    }
    persist(context, value)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(CANCEL, false).apply()
    value to true
  }

  fun requestCancel(context: Context, sessionId: String): Boolean = synchronized(lock) {
    recoverOrphan(context)
    val old = decode(context)
    if (old["sessionId"] != sessionId || old["state"] !in activeStates) return false
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(CANCEL, true).apply()
    true
  }

  fun isCancelRequested(context: Context, sessionId: String): Boolean = synchronized(lock) {
    val old = decode(context)
    old["sessionId"] == sessionId && context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(CANCEL, false)
  }

  fun complete(context: Context, sessionId: String, values: Map<String, Any?>): Map<String, Any?> = synchronized(lock) {
    recoverOrphan(context)
    val old = decode(context)
    if (old["sessionId"] != sessionId || old["state"] != "stopping") return old
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val cancelled = prefs.getBoolean(CANCEL, false)
    val finalValues = if (cancelled) mapOf("state" to "cancelled", "result" to null, "error" to null, "stopReason" to "cancelled") else values
    val merged = old.toMutableMap().apply { putAll(finalValues) }
    persist(context, merged)
    prefs.edit().putBoolean(CANCEL, false).apply()
    merged
  }

  fun cancelReady(context: Context, sessionId: String): Boolean = synchronized(lock) {
    recoverOrphan(context)
    val old = decode(context)
    if (old["sessionId"] != sessionId || old["state"] != "ready") return false
    deleteResult(context, old)
    val cancelled = old.toMutableMap().apply { put("state", "cancelled"); put("result", null); put("error", null); put("stopReason", "cancelled") }
    persist(context, cancelled)
    true
  }

  fun transition(context: Context, sessionId: String, expected: Set<String>, values: Map<String, Any?>): Boolean = synchronized(lock) {
    recoverOrphan(context)
    val old = decode(context)
    if (old["sessionId"] != sessionId || old["state"] !in expected) return false
    val merged = old.toMutableMap().apply { putAll(values) }
    require((merged["state"] as? String) in states)
    persist(context, merged)
    if (merged["state"] !in activeStates) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(CANCEL, false).apply()
    true
  }

  fun forSession(context: Context, sessionId: String): Map<String, Any?> {
    val value = read(context)
    return if (value["sessionId"] == sessionId) value else idle()
  }

  fun isCurrent(context: Context, sessionId: String, state: String): Boolean = synchronized(lock) {
    recoverOrphan(context)
    val value = decode(context)
    value["sessionId"] == sessionId && value["state"] == state
  }

  fun idle() = mapOf("sessionId" to null, "state" to "idle", "elapsedMs" to 0L, "error" to null, "result" to null, "stopReason" to null)

  fun newRecording(context: Context, sessionId: String): File {
    val directory = File(context.cacheDir, "device-audio-capture").apply { mkdirs() }
    val file = File(directory, "$sessionId.wav")
    require(file.canonicalPath.startsWith(directory.canonicalPath + File.separator))
    return file
  }

  fun deleteResult(context: Context, status: Map<String, Any?>) {
    val uri = (status["result"] as? Map<*, *>)?.get("uri") as? String ?: return
    val file = File(Uri.parse(uri).path ?: return)
    val directory = File(context.cacheDir, "device-audio-capture").canonicalFile
    if (file.canonicalFile.parentFile == directory) file.delete()
  }

  fun deleteSessionFile(context: Context, sessionId: String?) = deleteOwnedFile(context, sessionId)

  fun sweepStale(context: Context) = synchronized(lock) {
    recoverOrphan(context)
    val directory = File(context.cacheDir, "device-audio-capture")
    val now = System.currentTimeMillis()
    val current = decode(context)
    val activeFile = if (current["state"] in activeOrReady) File(directory, "${current["sessionId"]}.wav").canonicalFile else null
    directory.listFiles()?.forEach { file ->
      if (file.isFile && file.canonicalFile != activeFile && now - file.lastModified() > 24L * 60 * 60 * 1000) file.delete()
    }
  }

  private val activeStates = setOf("requesting-permission", "preparing", "recording", "stopping")
  private val activeOrReady = activeStates + "ready"

  private fun recoverOrphan(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val oldOwner = prefs.getString(OWNER, null)
    val current = decode(context)
    if (oldOwner != null && oldOwner != processToken) {
      if (current["state"] in activeStates) {
        deleteOwnedFile(context, current["sessionId"] as? String)
        persist(context, current.toMutableMap().apply {
          put("state", "failed"); put("error", "Capture ended when Stimmyz closed"); put("result", null); put("stopReason", "process-ended")
        })
      } else if (current["state"] == "ready") {
        deleteResult(context, current)
        persist(context, idle())
      }
    }
  }

  private fun deleteOwnedFile(context: Context, sessionId: String?) {
    if (sessionId == null || !sessionId.matches(Regex("[A-Za-z0-9_-]{1,80}"))) return
    val directory = File(context.cacheDir, "device-audio-capture").canonicalFile
    val candidate = File(directory, "$sessionId.wav").canonicalFile
    if (candidate.parentFile == directory) candidate.delete()
  }

  private fun persist(context: Context, value: Map<String, Any?>) {
    val result = value["result"] as? Map<*, *>
    val json = JSONObject().apply {
      put("sessionId", value["sessionId"] ?: JSONObject.NULL); put("state", value["state"] ?: "idle")
      put("elapsedMs", value["elapsedMs"] ?: 0L); put("error", value["error"] ?: JSONObject.NULL)
      put("stopReason", value["stopReason"] ?: JSONObject.NULL)
      if (result != null) put("result", JSONObject().apply {
        put("uri", result["uri"] ?: JSONObject.NULL); put("durationMs", result["durationMs"] ?: 0L)
        put("sampleRate", result["sampleRate"] ?: 0); put("channels", result["channels"] ?: 0)
        put("frames", result["frames"] ?: 0L); put("peak", result["peak"] ?: 0.0)
        put("rms", result["rms"] ?: 0.0); put("quiet", result["quiet"] ?: false)
      }) else put("result", JSONObject.NULL)
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json.toString()).putString(OWNER, processToken).apply()
  }

  private fun decode(context: Context): Map<String, Any?> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return idle()
    return try {
      val json = JSONObject(raw)
      val resultJson = json.optJSONObject("result")
      val result = resultJson?.let {
        mapOf("uri" to it.optString("uri").takeIf(String::isNotEmpty), "durationMs" to it.optLong("durationMs"),
          "sampleRate" to it.optInt("sampleRate"), "channels" to it.optInt("channels"), "frames" to it.optLong("frames"),
          "peak" to it.optDouble("peak"), "rms" to it.optDouble("rms"), "quiet" to it.optBoolean("quiet"))
      }
      val state = json.optString("state", "idle").takeIf(states::contains) ?: "failed"
      mapOf("sessionId" to json.nullableString("sessionId"), "state" to state,
        "elapsedMs" to json.optLong("elapsedMs"), "error" to json.nullableString("error"),
        "result" to result, "stopReason" to json.nullableString("stopReason"))
    } catch (_: Exception) { idle() }
  }

  private fun JSONObject.nullableString(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf(String::isNotEmpty)
}
