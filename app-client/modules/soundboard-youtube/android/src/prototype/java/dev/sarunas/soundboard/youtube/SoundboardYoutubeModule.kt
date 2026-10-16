package dev.sarunas.soundboard.youtube

import android.net.Uri
import android.os.SystemClock
import android.system.Os
import android.util.Log
import com.yausername.youtubedl_android.YoutubeDL
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Opt-in private prototype. The normal-build source set contains only a disabled stub. */
class SoundboardYoutubeModule : Module() {
  private data class Job(val id: String) {
    val cancelled = AtomicBoolean(false)
    @Volatile var stage = DiagnosticStage.INIT
    @Volatile var failure: Pair<DiagnosticStage, DiagnosticReason>? = null
    @Volatile var settled = false
    @Volatile var directory: File? = null
    @Volatile var applicationCache: File? = null
    val errorReportCaptured = AtomicBoolean(false)
  }

  private val lock = Any()
  private var activeJob: Job? = null
  private val cancelledBeforeStart = LinkedHashSet<String>()
  private val timers: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
  private val initialized = AtomicBoolean(false)
  private val destroyed = AtomicBoolean(false)
  private val cancelWatchers = ConcurrentHashMap<String, ScheduledFuture<*>>()

  override fun definition() = ModuleDefinition {
    Name("SoundboardYoutube")

    Constant("enabled") { true }
    Constant("privateRelease") { !BuildConfig.EXTERNAL_DIAGNOSTIC_REPORTS_ENABLED }
    Constant("bundledExtractorVersion") { EXTRACTOR_VERSION }

    AsyncFunction("extract") Coroutine { requestId: String, canonicalUrl: String ->
      withContext(Dispatchers.IO) { extractBlocking(requestId, canonicalUrl) }
    }

    AsyncFunction("cancel") Coroutine { requestId: String ->
      withContext(Dispatchers.IO) { cancelRequest(requestId) }
    }

    AsyncFunction("release") Coroutine { requestId: String ->
      withContext(Dispatchers.IO) { releaseRequest(requestId) }
    }

    OnDestroy {
      destroyed.set(true)
      val job = synchronized(lock) { activeJob }
      if (job != null) {
        job.cancelled.set(true)
        stopRepeatedlyUntilSettled(job)
      } else timers.shutdownNow()
    }
  }

  private fun extractBlocking(requestId: String, canonicalUrl: String): Map<String, Any> {
    validateRequestId(requestId)
    validateCanonicalUrl(canonicalUrl)

    val job = Job(requestId)
    synchronized(lock) {
      if (cancelledBeforeStart.remove(requestId)) throw diagnostic(DiagnosticStage.INIT, DiagnosticReason.CANCELLED)
      if (activeJob != null) throw diagnostic(DiagnosticStage.INIT, DiagnosticReason.BUSY)
      activeJob = job
    }
    clearErrorReport()

    val startedAt = SystemClock.elapsedRealtime()
    var wholeJobTimer: java.util.concurrent.ScheduledFuture<*>? = null
    var sizeWatch: ScheduledFuture<*>? = null
    try {
      wholeJobTimer = timers.schedule({ failAndStop(job, DiagnosticReason.TIMEOUT) }, WHOLE_JOB_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      ensureInitialized(job)
      job.applicationCache = requireNotNull(appContext.reactContext).applicationContext.cacheDir
      job.directory = File(File(requireNotNull(job.applicationCache), CACHE_DIRECTORY), requestId).also {
        if (!it.exists() && !it.mkdirs()) throw diagnostic(DiagnosticStage.INIT, DiagnosticReason.STORAGE)
        if (!it.isDirectory) throw diagnostic(DiagnosticStage.INIT, DiagnosticReason.STORAGE)
      }
      checkJob(job)
      sizeWatch = timers.scheduleAtFixedRate({
        if (!job.settled && directoryBytes(job.directory) > MAX_OUTPUT_BYTES) failAndStop(job, DiagnosticReason.TOO_LARGE)
      }, 100, 100, TimeUnit.MILLISECONDS)

      job.stage = DiagnosticStage.METADATA
      val metadata = readMetadata(job, canonicalUrl)
      val liveStatus = metadata.optString("live_status", "")
      if (metadata.optBoolean("is_live") || liveStatus == "is_live" || liveStatus == "is_upcoming") {
        throw diagnostic(job.stage, DiagnosticReason.LIVE_SOURCE)
      }
      val durationMs = metadata.optDouble("duration", Double.NaN) * 1000.0
      if (!durationMs.isFinite() || durationMs <= 0.0) {
        throw diagnostic(job.stage, DiagnosticReason.INVALID)
      }
      if (durationMs > MAX_SOURCE_MS) {
        throw diagnostic(job.stage, DiagnosticReason.TOO_LONG)
      }
      checkJob(job)
      if (SystemClock.elapsedRealtime() - startedAt >= WHOLE_JOB_TIMEOUT_MS) {
        throw diagnostic(job.stage, DiagnosticReason.TIMEOUT)
      }

      val output = File(requireNotNull(job.directory), "$requestId.m4a")
      job.stage = DiagnosticStage.DOWNLOAD
      downloadAudio(job, canonicalUrl)
      checkJob(job)
      job.stage = DiagnosticStage.OUTPUT
      if (!output.isFile || output.length() <= 0L) {
        throw diagnostic(job.stage, DiagnosticReason.INVALID)
      }
      if (output.length() > MAX_OUTPUT_BYTES) {
        throw diagnostic(job.stage, DiagnosticReason.TOO_LARGE)
      }

      val title = metadata.optString("title", "YouTube audio")
        .replace(Regex("[\\r\\n\\t]"), " ")
        .trim()
        .take(200)
        .ifBlank { "YouTube audio" }
      return mapOf("uri" to Uri.fromFile(output).toString(), "title" to title, "durationMs" to durationMs.toLong())
    } catch (error: Throwable) {
      captureErrorReport(job, error)
      deleteOwnedDirectory(job.directory, job.applicationCache)
      val safe = safeError(job, error)
      Log.e(LOG_TAG, (safe as? CodedException)?.code ?: "ERR_SBYT_UNKNOWN_UNKNOWN")
      throw safe
    } finally {
      job.settled = true
      wholeJobTimer?.cancel(false)
      sizeWatch?.cancel(false)
      cancelWatchers.remove(requestId)?.cancel(false)
      synchronized(lock) {
        if (activeJob === job) activeJob = null
      }
      if (destroyed.get()) timers.shutdownNow()
    }
  }

  private fun readMetadata(job: Job, canonicalUrl: String): JSONObject {
    val request = PrototypeYoutubeRequestFactory.metadata(canonicalUrl)
    val timeout = scheduleCommandTimeout(job, METADATA_TIMEOUT_MS)
    return try {
      checkJob(job)
      val response = YoutubeDL.getInstance().execute(request, job.id) { _, _, _ -> }
      checkJob(job)
      val output = response.out
      if (output.length > MAX_METADATA_OUTPUT_CHARS) throw diagnostic(job.stage, DiagnosticReason.INVALID)
      val jsonStart = output.indexOf('{')
      val jsonEnd = output.lastIndexOf('}')
      if (jsonStart < 0 || jsonEnd <= jsonStart) throw diagnostic(job.stage, DiagnosticReason.INVALID)
      JSONObject(output.substring(jsonStart, jsonEnd + 1))
    } catch (error: Throwable) {
      captureErrorReport(job, error)
      val safe = safeError(job, error)
      throw safe
    } finally {
      timeout.cancel(false)
    }
  }

  private fun downloadAudio(job: Job, canonicalUrl: String) {
    val outputTemplate = File(requireNotNull(job.directory), "${job.id}.%(ext)s").absolutePath
    val request = PrototypeYoutubeRequestFactory.download(canonicalUrl, outputTemplate)

    val timeout = scheduleCommandTimeout(job, DOWNLOAD_TIMEOUT_MS)
    try {
      checkJob(job)
      YoutubeDL.getInstance().execute(request, job.id) { _, _, _ ->
        if (directoryBytes(job.directory) > MAX_OUTPUT_BYTES) failAndStop(job, DiagnosticReason.TOO_LARGE)
      }
      checkJob(job)
    } catch (error: Throwable) {
      captureErrorReport(job, error)
      val safe = safeError(job, error)
      throw safe
    } finally {
      timeout.cancel(false)
    }
  }

  private fun scheduleCommandTimeout(job: Job, timeoutMs: Long) = timers.schedule({
    failAndStop(job, DiagnosticReason.TIMEOUT)
  }, timeoutMs, TimeUnit.MILLISECONDS)

  private fun failAndStop(job: Job, reason: DiagnosticReason) {
    if (!job.settled) {
      if (job.failure == null) job.failure = job.stage to reason
      stopRepeatedlyUntilSettled(job)
    }
  }

  private fun stopRepeatedlyUntilSettled(job: Job) {
    stopProcess(job.id)
    if (!job.settled && !cancelWatchers.containsKey(job.id)) {
      cancelWatchers[job.id] = timers.scheduleAtFixedRate({
        if (job.settled) cancelWatchers.remove(job.id)?.cancel(false)
        else stopProcess(job.id)
      }, 100, 100, TimeUnit.MILLISECONDS)
    }
  }

  private fun cancelRequest(requestId: String) {
    validateRequestId(requestId)
    val job = synchronized(lock) {
      activeJob?.takeIf { it.id == requestId } ?: run {
        if (cancelledBeforeStart.size >= MAX_PENDING_CANCELLATIONS) cancelledBeforeStart.remove(cancelledBeforeStart.first())
        cancelledBeforeStart.add(requestId)
        null
      }
    }
    if (job != null) {
      job.cancelled.set(true)
      stopRepeatedlyUntilSettled(job)
    }
  }

  private fun releaseRequest(requestId: String) {
    validateRequestId(requestId)
    val canDelete = synchronized(lock) {
      cancelledBeforeStart.remove(requestId)
      activeJob?.id != requestId
    }
    if (canDelete) {
      val cache = requireNotNull(appContext.reactContext).applicationContext.cacheDir
      deleteOwnedDirectory(File(File(cache, CACHE_DIRECTORY), requestId), cache)
    }
  }

  private fun deleteOwnedDirectory(directory: File?, cacheRoot: File?) {
    if (directory == null || !directory.exists()) return
    if (cacheRoot == null) return
    val expectedRoot = File(cacheRoot, CACHE_DIRECTORY).canonicalFile
    val owned = directory.canonicalFile
    val rootPath = expectedRoot.path + File.separator
    if (owned != expectedRoot && !owned.path.startsWith(rootPath)) return
    directory.deleteRecursively()
  }

  private fun ensureInitialized(job: Job) {
    if (initialized.compareAndSet(false, true)) {
      val context = requireNotNull(appContext.reactContext).applicationContext
      try {
        YoutubeDL.getInstance().init(context)
      } catch (error: Throwable) {
        initialized.set(false)
        captureErrorReport(job, error, diagnostic(DiagnosticStage.INIT, DiagnosticReason.RUNTIME).code)
        throw IllegalStateException("The on-device YouTube runtime could not start.")
      }
    }
  }

  private fun clearErrorReport() {
    if (!BuildConfig.EXTERNAL_DIAGNOSTIC_REPORTS_ENABLED) return
    try {
      val context = appContext.reactContext?.applicationContext ?: return
      val directory = context.getExternalFilesDir(null)?.let { File(it, ERROR_REPORT_DIRECTORY) } ?: return
      File(directory, ERROR_REPORT_FILE).delete()
    } catch (_: Throwable) {
      // Diagnostics are best-effort and must not change extraction behavior.
    }
  }

  private fun captureErrorReport(job: Job, error: Throwable, forcedSafeCode: String? = null) {
    if (!BuildConfig.EXTERNAL_DIAGNOSTIC_REPORTS_ENABLED) return
    if (!job.errorReportCaptured.compareAndSet(false, true)) return
    try {
      val stage = job.failure?.first ?: job.stage
      val safeCode = forcedSafeCode ?: when {
        job.cancelled.get() -> diagnostic(stage, DiagnosticReason.CANCELLED).code
        job.failure != null -> diagnostic(stage, job.failure!!.second).code
        PrototypeDiagnostic.existingDiagnostic(error) != null -> PrototypeDiagnostic.existingDiagnostic(error)!!.code
        error is IllegalArgumentException && stage == DiagnosticStage.INIT -> diagnostic(stage, DiagnosticReason.INVALID).code
        error.message == "The on-device YouTube runtime could not start." -> diagnostic(stage, DiagnosticReason.RUNTIME).code
        else -> PrototypeDiagnostic.classify(stage, error).code
      }
      val report = PrototypeErrorReport.render(stage, safeCode, error, System.currentTimeMillis())
      val context = appContext.reactContext?.applicationContext ?: return
      val directory = context.getExternalFilesDir(null)?.let { File(it, ERROR_REPORT_DIRECTORY) } ?: return
      if (!directory.exists() && !directory.mkdirs()) return
      if (!directory.isDirectory) return
      val target = File(directory, ERROR_REPORT_FILE)
      val temporary = File(directory, "$ERROR_REPORT_FILE.tmp")
      temporary.writeText(report, Charsets.UTF_8)
      Os.rename(temporary.absolutePath, target.absolutePath)
    } catch (_: Throwable) {
      try {
        val context = appContext.reactContext?.applicationContext
        context?.getExternalFilesDir(null)?.let { File(File(it, ERROR_REPORT_DIRECTORY), "$ERROR_REPORT_FILE.tmp").delete() }
      } catch (_: Throwable) {
        // Ignore all report-storage failures.
      }
    }
  }

  private fun stopProcess(requestId: String) {
    try {
      YoutubeDL.getInstance().destroyProcessById(requestId)
    } catch (_: Throwable) {
      // The process may not have started yet or may already have exited.
    }
  }

  private fun checkJob(job: Job) {
    if (job.cancelled.get()) throw diagnostic(job.stage, DiagnosticReason.CANCELLED)
    job.failure?.let { (stage, reason) -> throw diagnostic(stage, reason) }
  }

  private fun safeError(job: Job, error: Throwable): Throwable {
    if (job.cancelled.get()) return diagnostic(job.stage, DiagnosticReason.CANCELLED)
    val failure = job.failure
    if (failure != null) return diagnostic(failure.first, failure.second)
    PrototypeDiagnostic.existingDiagnostic(error)?.let { return it }
    if (error is IllegalArgumentException && job.stage == DiagnosticStage.INIT) {
      return diagnostic(DiagnosticStage.INIT, DiagnosticReason.INVALID)
    }
    if (error.message == "The on-device YouTube runtime could not start.") {
      return diagnostic(DiagnosticStage.INIT, DiagnosticReason.RUNTIME)
    }
    return PrototypeDiagnostic.classify(job.stage, error)
  }

  private fun diagnostic(stage: DiagnosticStage, reason: DiagnosticReason) = PrototypeDiagnostic.error(stage, reason)

  private fun directoryBytes(directory: File?): Long {
    if (directory == null || !directory.exists()) return 0L
    var total = 0L
    directory.walkTopDown().forEach { file ->
      if (file.isFile) {
        total += file.length()
        if (total > MAX_OUTPUT_BYTES) return total
      }
    }
    return total
  }

  private fun validateRequestId(value: String) {
    val parsed = try { UUID.fromString(value) } catch (_: IllegalArgumentException) { null }
    if (parsed == null || parsed.toString() != value.lowercase()) {
      throw diagnostic(DiagnosticStage.INIT, DiagnosticReason.INVALID)
    }
  }

  private fun validateCanonicalUrl(value: String) {
    val videoId = Regex("[A-Za-z0-9_-]{11}")
    val match = CANONICAL_URL.matchEntire(value) ?: throw diagnostic(DiagnosticStage.INIT, DiagnosticReason.INVALID)
    if (!videoId.matches(match.groupValues[1]) || value != "https://www.youtube.com/watch?v=${match.groupValues[1]}") {
      throw diagnostic(DiagnosticStage.INIT, DiagnosticReason.INVALID)
    }
  }

  companion object {
    private const val CACHE_DIRECTORY = "soundboard-youtube-prototype"
    private const val MAX_SOURCE_MS = 5 * 60_000.0
    private const val MAX_OUTPUT_BYTES = 32L * 1024L * 1024L
    private const val MAX_METADATA_OUTPUT_CHARS = 1_048_576
    private const val WHOLE_JOB_TIMEOUT_MS = 240_000L
    private const val METADATA_TIMEOUT_MS = 45_000L
    private const val DOWNLOAD_TIMEOUT_MS = 240_000L
    private const val MAX_PENDING_CANCELLATIONS = 128
    private const val EXTRACTOR_VERSION = "2025.11.12"
    private const val LOG_TAG = "SoundboardYoutube"
    private const val ERROR_REPORT_DIRECTORY = "diagnostics"
    private const val ERROR_REPORT_FILE = "youtube-error-report.txt"
    private val CANONICAL_URL = Regex("https://www\\.youtube\\.com/watch\\?v=([A-Za-z0-9_-]{11})")
  }
}
