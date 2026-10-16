package dev.sarunas.soundboard.youtube

import java.nio.charset.StandardCharsets
import java.util.Collections
import java.util.IdentityHashMap

/** Pure, best-effort redaction and bounded formatting for the opt-in local diagnostic report. */
internal object PrototypeErrorReport {
  const val MAX_REPORT_BYTES = 8 * 1024
  private const val MAX_INPUT_BYTES = 16 * 1024
  private const val MAX_CAUSES = 4
  private const val MAX_MESSAGE_BYTES = 2_048

  fun render(stage: DiagnosticStage, safeCode: String, error: Throwable, timestampMillis: Long): String {
    val code = safeCode.takeIf { SAFE_CODE.matches(it) } ?: "ERR_SBYT_UNKNOWN_UNKNOWN"
    val output = StringBuilder()
      .append("schema=1\n")
      .append("timestampUtcMillis=").append(timestampMillis.coerceAtLeast(0L)).append('\n')
      .append("stage=").append(stage.name).append('\n')
      .append("safeCode=").append(code).append('\n')

    val seen = Collections.newSetFromMap(IdentityHashMap<Throwable, Boolean>())
    var current: Throwable? = error
    var index = 0
    while (current != null && index < MAX_CAUSES && seen.add(current)) {
      output.append("exception[").append(index).append("].class=")
        .append(safeClassName(current.javaClass.simpleName)).append('\n')
      val message = current.message?.let(::redactMessage).orEmpty().ifBlank { "(no message)" }
      output.append("exception[").append(index).append("].message=")
        .append(utf8TailAfterRedaction(message, MAX_MESSAGE_BYTES)).append('\n')
      current = current.cause
      index += 1
    }
    if (current != null && index == MAX_CAUSES) output.append("causesTruncated=true\n")
    return utf8Prefix(output.toString(), MAX_REPORT_BYTES)
  }

  fun redactMessage(value: String): String {
    var text = utf8Tail(value, MAX_INPUT_BYTES)
    text = ANSI_ESCAPE.replace(text, "")
    text = CONTROL_CHARS.replace(text, "")
    text = FILE_URI.replace(text, "<PATH>")
    text = URL.replace(text, "<URL>")

    // Drop entire lines that are likely to contain credentials, even if their value format is unusual.
    text = text.lineSequence().filterNot { line ->
      SENSITIVE_HEADER.containsMatchIn(line) || CREDENTIAL_ASSIGNMENT.containsMatchIn(line)
    }.joinToString("\n")

    text = BEARER.replace(text, "Bearer <REDACTED>")
    text = QUOTED_PATH.replace(text, "<PATH>")
    text = LOCAL_PATH.replace(text, "<PATH>")
    text = YOUTUBE_ID.replace(text, "[youtube] <VIDEO_ID>")
    text = OPAQUE_TOKEN.replace(text, "<OPAQUE>")
    return text
  }

  private fun safeClassName(value: String): String =
    value.takeIf { it.length in 1..100 && SIMPLE_CLASS.matches(it) } ?: "UnknownException"

  /** Return a prefix ending on a Unicode code-point boundary and within the UTF-8 byte limit. */
  private fun utf8Prefix(value: String, maxBytes: Int): String {
    if (maxBytes <= 0) return ""
    val result = StringBuilder()
    var index = 0
    var bytes = 0
    while (index < value.length) {
      val point = value.codePointAt(index)
      val piece = String(Character.toChars(point))
      val size = piece.toByteArray(StandardCharsets.UTF_8).size
      if (bytes + size > maxBytes) break
      result.append(piece)
      bytes += size
      index += Character.charCount(point)
    }
    return result.toString()
  }

  /** Bound attacker-controlled text before applying regexes, retaining the diagnostically useful tail. */
  private fun utf8Tail(value: String, maxBytes: Int): String {
    if (maxBytes <= 0 || value.isEmpty()) return ""
    val start = utf8StartIndex(value, maxBytes)
    if (start == 0) return value

    val tail = value.substring(start)
    val firstLineEnd = tail.indexOf('\n')
    return if (firstLineEnd >= 0) tail.substring(firstLineEnd + 1) else "[TRUNCATED_LONG_LINE]"
  }

  /** This is called only after redaction, so retaining a partial sanitized line is safe. */
  private fun utf8TailAfterRedaction(value: String, maxBytes: Int): String =
    value.substring(utf8StartIndex(value, maxBytes))

  private fun utf8StartIndex(value: String, maxBytes: Int): Int {
    if (maxBytes <= 0 || value.isEmpty()) return value.length
    var start = value.length
    var bytes = 0
    while (start > 0) {
      val point = value.codePointBefore(start)
      val size = when {
        point <= 0x7F -> 1
        point <= 0x7FF -> 2
        point <= 0xFFFF -> 3
        else -> 4
      }
      if (bytes + size > maxBytes) break
      bytes += size
      start -= Character.charCount(point)
    }
    return start
  }

  private val SAFE_CODE = Regex(
    "ERR_SBYT_(?:${DiagnosticStage.values().joinToString("|") { it.name }})_" +
      "(?:${DiagnosticReason.values().joinToString("|") { it.name }})",
  )
  private val SIMPLE_CLASS = Regex("[A-Za-z0-9_$]{1,100}")
  private val ANSI_ESCAPE = Regex("\\u001B(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\u0007]*(?:\\u0007|\\u001B\\\\)|[@-Z\\\\^_])")
  private val CONTROL_CHARS = Regex("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]")
  private val SENSITIVE_HEADER = Regex("(?i)^\\s*(?:authorization|proxy-authorization|cookie|set-cookie)\\s*[:=].*$")
  private val CREDENTIAL_ASSIGNMENT = Regex(
    "(?i).*(?:token|secret|password|api[_-]?key|access[_-]?key|authorization|cookie|set-cookie)\\s*[:=].*",
  )
  private val BEARER = Regex("(?i)\\bBearer\\s+[^\\s,;]+")
  private val FILE_URI = Regex("(?i)\\bfile://[^\\s\\\"'<>]+")
  private val URL = Regex("(?i)\\b(?:https?|ftp)://[^\\s\\\"'<>]+")
  private val QUOTED_PATH = Regex("([\\\"'])(?:[A-Za-z]:\\\\|/)[^\\\"'\\r\\n]{1,1024}\\1")
  private val LOCAL_PATH = Regex("(?<![A-Za-z0-9_:])(?:[A-Za-z]:\\\\|/)[^\\s\\\"'<>]+")
  private val YOUTUBE_ID = Regex("(?i)\\[youtube]\\s+[A-Za-z0-9_-]{11}(?=[:\\s]|$)")
  private val OPAQUE_TOKEN = Regex("(?<![A-Za-z0-9])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9])")
}
