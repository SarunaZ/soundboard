package dev.sarunas.soundboard.youtube

import expo.modules.kotlin.exception.CodedException

internal enum class DiagnosticStage { INIT, METADATA, DOWNLOAD, OUTPUT }

internal enum class DiagnosticReason {
  RUNTIME,
  NETWORK,
  ACCESS,
  FORMAT,
  EXTRACTOR,
  INVALID,
  STORAGE,
  TIMEOUT,
  TOO_LARGE,
  TOO_LONG,
  LIVE_SOURCE,
  HTTP_UNAUTHORIZED,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_RATE_LIMIT,
  HTTP_SERVER,
  HTTP_OTHER,
  SIGNATURE,
  JS_CHALLENGE,
  PO_TOKEN,
  TOOL_MISSING,
  IO,
  PYTHON,
  BUSY,
  CANCELLED,
  UNKNOWN,
}

/** Converts private native failures to stable codes and fixed, non-sensitive messages. */
internal object PrototypeDiagnostic {
  private val networkPatterns = listOf(
    Regex("\\btemporary failure in name resolution\\b", RegexOption.IGNORE_CASE),
    Regex("\\bname or service not known\\b", RegexOption.IGNORE_CASE),
    Regex("\\bgetaddrinfo failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\b(?:ssl|tls|certificate) error\\b", RegexOption.IGNORE_CASE),
    Regex("\\bcertificate[_ ]verify[_ ]failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bcertificate verify failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bconnection (?:reset|refused|aborted|timed out)\\b", RegexOption.IGNORE_CASE),
    Regex("\\bnetwork is unreachable\\b", RegexOption.IGNORE_CASE),
    Regex("\\b(read|connect) timed out\\b", RegexOption.IGNORE_CASE),
  )
  private val accessPatterns = listOf(
    Regex("\\bsign in to confirm\\b", RegexOption.IGNORE_CASE),
    Regex("\\bnot a bot\\b", RegexOption.IGNORE_CASE),
    Regex("\\bprivate video\\b", RegexOption.IGNORE_CASE),
    Regex("\\bvideo unavailable\\b", RegexOption.IGNORE_CASE),
    Regex("\\bthis video is unavailable\\b", RegexOption.IGNORE_CASE),
  )
  private val formatPatterns = listOf(
    Regex("\\brequested format is not available\\b", RegexOption.IGNORE_CASE),
  )
  private val runtimePatterns = listOf(
    Regex("\\bunrecognized option\\b", RegexOption.IGNORE_CASE),
    Regex("\\bImportError\\b", RegexOption.IGNORE_CASE),
    Regex("\\bModuleNotFoundError\\b", RegexOption.IGNORE_CASE),
    Regex("\\bNo module named\\b", RegexOption.IGNORE_CASE),
    Regex("\\bNo such option:\\s*--js-runtimes\\b", RegexOption.IGNORE_CASE),
    Regex("\\b(?:failed|unable) to execute\\b", RegexOption.IGNORE_CASE),
    Regex("\\bexec format error\\b", RegexOption.IGNORE_CASE),
    Regex("\\bpermission denied\\b", RegexOption.IGNORE_CASE),
  )
  private val httpStatusPattern = Regex("(?i)\\bHTTP(?: Error|Error)?\\s*[: ]?([1-5][0-9]{2})\\b")
  private val signaturePatterns = listOf(
    Regex("\\bsignature (?:extraction|decryption) failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bnsig extraction failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bn-signature (?:extraction|decryption) failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bfailed to decrypt (?:the )?signature\\b", RegexOption.IGNORE_CASE),
    Regex("\\bsignature could not be deciphered\\b", RegexOption.IGNORE_CASE),
  )
  private val challengePatterns = listOf(
    Regex("\\b(?:javascript )?challenge solver failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bchallenge solving failed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bEJS.{0,80}\\b(?:failed|failure|error)\\b", RegexOption.IGNORE_CASE),
    Regex("\\b(?:failed|failure|error).{0,80}\\bEJS\\b", RegexOption.IGNORE_CASE),
  )
  private val poTokenPatterns = listOf(
    Regex("\\bPO[_ -]?token (?:is )?(?:required|missing)\\b", RegexOption.IGNORE_CASE),
    Regex("\\bmissing required PO[_ -]?token\\b", RegexOption.IGNORE_CASE),
    Regex("\\bPO[_ -]?token required\\b", RegexOption.IGNORE_CASE),
  )
  private val toolMissingPatterns = listOf(
    Regex("\\bffmpeg(?:/ffprobe| and ffprobe)? (?:is )?not installed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bffprobe(?:/ffmpeg| and ffmpeg)? (?:is )?not installed\\b", RegexOption.IGNORE_CASE),
    Regex("\\bffmpeg(?:/ffprobe| and ffprobe)? (?:was )?not found\\b", RegexOption.IGNORE_CASE),
    Regex("\\bffprobe(?:/ffmpeg| and ffmpeg)? (?:was )?not found\\b", RegexOption.IGNORE_CASE),
  )
  private val ioPatterns = listOf(
    Regex("\\bno space left on device\\b", RegexOption.IGNORE_CASE),
    Regex("\\bread-only file system\\b", RegexOption.IGNORE_CASE),
    Regex("\\b(?:failed|unable) to open .{0,120} for writing\\b", RegexOption.IGNORE_CASE),
    Regex("\\bopen for writing failed\\b", RegexOption.IGNORE_CASE),
  )
  private val pythonTracebackPattern = Regex(
    "(?is)Traceback \\(most recent call last\\):.{0,4096}\\n\\s*[A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception):",
  )
  private val terminalErrorLine = Regex("(?im)^\\s*ERROR:\\s*.*$")

  fun error(stage: DiagnosticStage, reason: DiagnosticReason): CodedException {
    val code = "ERR_SBYT_${stage.name}_${reason.name}"
    return CodedException(code, safeMessage(stage, reason), null)
  }

  fun existingDiagnostic(error: Throwable): CodedException? = generateSequence(error) { it.cause }
    .take(MAX_CAUSE_DEPTH)
    .filterIsInstance<CodedException>()
    .firstNotNullOfOrNull { coded ->
      val match = DIAGNOSTIC_CODE.matchEntire(coded.code) ?: return@firstNotNullOfOrNull null
      val stage = DiagnosticStage.valueOf(match.groupValues[1])
      val reason = DiagnosticReason.valueOf(match.groupValues[2])
      error(stage, reason)
    }

  fun isDiagnostic(error: Throwable): Boolean = existingDiagnostic(error) != null

  /** Only known patterns are classified; all input text is discarded after this check. */
  fun classify(stage: DiagnosticStage, error: Throwable): CodedException {
    existingDiagnostic(error)?.let { return it }
    val text = generateSequence(error) { it.cause }
      .take(MAX_CAUSE_DEPTH)
      .mapNotNull { it.message }
      .map { it.takeLast(MAX_MESSAGE_CHARS) }
      .joinToString("\n")
    val errorLines = terminalErrorLine.findAll(text).joinToString("\n") { it.value }
    val evidence = errorLines.ifBlank { text }
    val httpReason = classifyHttpStatus(errorLines)
    val reason = when {
      httpReason != null -> httpReason
      signaturePatterns.any { it.containsMatchIn(errorLines) } -> DiagnosticReason.SIGNATURE
      challengePatterns.any { it.containsMatchIn(errorLines) } -> DiagnosticReason.JS_CHALLENGE
      poTokenPatterns.any { it.containsMatchIn(errorLines) } -> DiagnosticReason.PO_TOKEN
      toolMissingPatterns.any { it.containsMatchIn(errorLines) } -> DiagnosticReason.TOOL_MISSING
      ioPatterns.any { it.containsMatchIn(errorLines) } -> DiagnosticReason.IO
      networkPatterns.any { it.containsMatchIn(evidence) } -> DiagnosticReason.NETWORK
      accessPatterns.any { it.containsMatchIn(evidence) } -> DiagnosticReason.ACCESS
      formatPatterns.any { it.containsMatchIn(evidence) } -> DiagnosticReason.FORMAT
      runtimePatterns.any { it.containsMatchIn(evidence) } -> DiagnosticReason.RUNTIME
      pythonTracebackPattern.containsMatchIn(text) -> DiagnosticReason.PYTHON
      stage == DiagnosticStage.METADATA || stage == DiagnosticStage.DOWNLOAD -> DiagnosticReason.EXTRACTOR
      else -> DiagnosticReason.UNKNOWN
    }
    return error(stage, reason)
  }

  private fun classifyHttpStatus(text: String): DiagnosticReason? {
    if (text.isBlank()) return null
    val status = httpStatusPattern.findAll(text).mapNotNull { it.groupValues[1].toIntOrNull() }.lastOrNull() ?: return null
    return when (status) {
      401 -> DiagnosticReason.HTTP_UNAUTHORIZED
      403 -> DiagnosticReason.HTTP_FORBIDDEN
      404 -> DiagnosticReason.HTTP_NOT_FOUND
      429 -> DiagnosticReason.HTTP_RATE_LIMIT
      in 500..599 -> DiagnosticReason.HTTP_SERVER
      in 400..499 -> DiagnosticReason.HTTP_OTHER
      else -> null
    }
  }

  private fun safeMessage(stage: DiagnosticStage, reason: DiagnosticReason): String = when (reason) {
    DiagnosticReason.NETWORK -> "The network request failed. Check the connection and try again."
    DiagnosticReason.ACCESS -> "This video is unavailable without sign-in or has an access restriction."
    DiagnosticReason.FORMAT -> "No supported HTTPS M4A audio format is available for this video."
    DiagnosticReason.RUNTIME -> "The on-device extraction runtime could not complete the request."
    DiagnosticReason.EXTRACTOR -> "The on-device extractor could not process this video."
    DiagnosticReason.INVALID -> when (stage) {
      DiagnosticStage.METADATA -> "YouTube did not provide valid audio metadata."
      DiagnosticStage.OUTPUT -> "The extractor did not produce a playable audio file."
      else -> "The extraction request is invalid."
    }
    DiagnosticReason.STORAGE -> "On-device audio storage is unavailable."
    DiagnosticReason.TIMEOUT -> "On-device YouTube extraction timed out."
    DiagnosticReason.TOO_LARGE -> "The extracted audio is larger than 32 MiB."
    DiagnosticReason.TOO_LONG -> "On-device YouTube sources must be five minutes or shorter."
    DiagnosticReason.LIVE_SOURCE -> "Live and upcoming streams are not supported."
    DiagnosticReason.HTTP_UNAUTHORIZED -> "The audio request was rejected as unauthorized (HTTP 401)."
    DiagnosticReason.HTTP_FORBIDDEN -> "The audio request was forbidden (HTTP 403)."
    DiagnosticReason.HTTP_NOT_FOUND -> "The requested audio resource was not found (HTTP 404)."
    DiagnosticReason.HTTP_RATE_LIMIT -> "The audio request was rate limited (HTTP 429)."
    DiagnosticReason.HTTP_SERVER -> "The audio service returned a server error (HTTP 5xx)."
    DiagnosticReason.HTTP_OTHER -> "The audio request failed with a client error (HTTP 4xx)."
    DiagnosticReason.SIGNATURE -> "The extractor could not decipher the audio signature."
    DiagnosticReason.JS_CHALLENGE -> "The extractor could not complete a JavaScript challenge."
    DiagnosticReason.PO_TOKEN -> "The extractor reported that a required PO token is missing."
    DiagnosticReason.TOOL_MISSING -> "A required media tool is missing from the runtime."
    DiagnosticReason.IO -> "The device could not write the extracted audio to storage."
    DiagnosticReason.PYTHON -> "The extractor encountered an internal Python error."
    DiagnosticReason.BUSY -> "Another on-device extraction is already running."
    DiagnosticReason.CANCELLED -> "On-device YouTube extraction was cancelled."
    DiagnosticReason.UNKNOWN -> "On-device YouTube extraction failed."
  }

  private val DIAGNOSTIC_CODE = Regex(
    "ERR_SBYT_(${DiagnosticStage.values().joinToString("|") { it.name }})_" +
      "(${DiagnosticReason.values().joinToString("|") { it.name }})",
  )
  private const val MAX_CAUSE_DEPTH = 8
  private const val MAX_MESSAGE_CHARS = 16_384
}
