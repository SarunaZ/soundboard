package dev.sarunas.soundboard.youtube

import expo.modules.kotlin.exception.CodedException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PrototypeDiagnosticTest {
  @Test fun classifiesOnlyStrongExtractorPatterns() {
    assertCode("ERR_SBYT_DOWNLOAD_NETWORK", DiagnosticStage.DOWNLOAD, "Temporary failure in name resolution")
    assertCode("ERR_SBYT_METADATA_NETWORK", DiagnosticStage.METADATA, "CERTIFICATE_VERIFY_FAILED")
    assertCode("ERR_SBYT_DOWNLOAD_ACCESS", DiagnosticStage.DOWNLOAD, "Sign in to confirm you are not a bot")
    assertCode("ERR_SBYT_METADATA_ACCESS", DiagnosticStage.METADATA, "Private video")
    assertCode("ERR_SBYT_DOWNLOAD_FORMAT", DiagnosticStage.DOWNLOAD, "Requested format is not available")
    assertCode("ERR_SBYT_DOWNLOAD_RUNTIME", DiagnosticStage.DOWNLOAD, "ImportError: missing runtime module")
    assertCode("ERR_SBYT_DOWNLOAD_RUNTIME", DiagnosticStage.DOWNLOAD, "ModuleNotFoundError: missing runtime module")
    assertCode("ERR_SBYT_DOWNLOAD_RUNTIME", DiagnosticStage.DOWNLOAD, "No such option: --js-runtimes")
    assertCode("ERR_SBYT_DOWNLOAD_EXTRACTOR", DiagnosticStage.DOWNLOAD, "opaque extractor failure")
  }

  @Test fun classifiesExplicitHttpFailuresAndPrefersTerminalHttpErrorOverWarnings() {
    val cases = listOf(
      "ERROR: [youtube] abc: HTTP Error 401: Unauthorized" to "HTTP_UNAUTHORIZED",
      "ERROR: [youtube] abc: HTTP Error 403: Forbidden" to "HTTP_FORBIDDEN",
      "ERROR: [youtube] abc: HTTP Error 404: Not Found" to "HTTP_NOT_FOUND",
      "ERROR: [youtube] abc: HTTP Error 429: Too Many Requests" to "HTTP_RATE_LIMIT",
      "ERROR: [youtube] abc: HTTP Error 503: Service Unavailable" to "HTTP_SERVER",
      "ERROR: [youtube] abc: HTTP Error 418: I'm a teapot" to "HTTP_OTHER",
    )
    cases.forEach { (line, reason) ->
      assertCode("ERR_SBYT_DOWNLOAD_$reason", DiagnosticStage.DOWNLOAD, line)
    }
    assertCode(
      "ERR_SBYT_DOWNLOAD_HTTP_FORBIDDEN",
      DiagnosticStage.DOWNLOAD,
      "WARNING: [youtube] abc: nsig extraction failed\nERROR: [youtube] abc: HTTP Error 403: Forbidden",
    )
    assertCode(
      "ERR_SBYT_DOWNLOAD_EXTRACTOR",
      DiagnosticStage.DOWNLOAD,
      "WARNING: [youtube] abc: HTTP Error 403: Forbidden",
    )
    assertCode(
      "ERR_SBYT_DOWNLOAD_EXTRACTOR",
      DiagnosticStage.DOWNLOAD,
      "WARNING: Sign in to confirm you are not a bot\nERROR: opaque extractor failure",
    )
  }

  @Test fun classifiesSpecificDownloadErrorsOnlyFromTerminalErrorLines() {
    val cases = listOf(
      "ERROR: [youtube] abc: Signature extraction failed: unsupported player" to "SIGNATURE",
      "ERROR: [youtube] abc: challenge solving failed" to "JS_CHALLENGE",
      "ERROR: [youtube] abc: PO token is required" to "PO_TOKEN",
      "ERROR: ffmpeg is not installed" to "TOOL_MISSING",
      "ERROR: [download] No space left on device" to "IO",
      "Traceback (most recent call last):\n  File \"extractor.py\", line 3\nValueError: malformed response" to "PYTHON",
    )
    cases.forEach { (line, reason) ->
      assertCode("ERR_SBYT_DOWNLOAD_$reason", DiagnosticStage.DOWNLOAD, line)
    }

    listOf(
      "WARNING: [youtube] abc: nsig extraction failed",
      "WARNING: challenge solving failed",
      "WARNING: PO token is required",
      "WARNING: [youtube] abc: HTTP Error 403: Forbidden",
      "https://example.invalid/audio?token=private-value",
    ).forEach { text ->
      assertCode("ERR_SBYT_DOWNLOAD_EXTRACTOR", DiagnosticStage.DOWNLOAD, text)
    }
  }

  @Test fun unknownTextNeverAppearsInCodeOrMessageAndStageIsPreserved() {
    val secret = "https://private.invalid/watch?v=secret-id stderr=raw diagnostic payload"
    val error = PrototypeDiagnostic.classify(DiagnosticStage.METADATA, IllegalStateException(secret))
    assertEquals("ERR_SBYT_METADATA_EXTRACTOR", error.code)
    assertFalse(error.message.orEmpty().contains(secret))
    assertFalse(error.code.contains(secret))
    assertNull(error.cause)
  }

  @Test fun existingTypedDiagnosticSurvivesNestedWrappingWithoutCauseRetention() {
    val typed = PrototypeDiagnostic.error(DiagnosticStage.DOWNLOAD, DiagnosticReason.NETWORK)
    val wrapped = IllegalStateException("wrapper contains private text", typed)
    val result = PrototypeDiagnostic.classify(DiagnosticStage.OUTPUT, wrapped)
    assertTrue(typed !== result)
    assertEquals("ERR_SBYT_DOWNLOAD_NETWORK", result.code)
    assertNull(result.cause)
  }

  @Test fun knownLimitAndLifecycleReasonsHaveSafeCodes() {
    listOf(
      DiagnosticReason.TIMEOUT to "ERR_SBYT_DOWNLOAD_TIMEOUT",
      DiagnosticReason.TOO_LARGE to "ERR_SBYT_OUTPUT_TOO_LARGE",
      DiagnosticReason.TOO_LONG to "ERR_SBYT_METADATA_TOO_LONG",
      DiagnosticReason.LIVE_SOURCE to "ERR_SBYT_METADATA_LIVE_SOURCE",
      DiagnosticReason.BUSY to "ERR_SBYT_INIT_BUSY",
      DiagnosticReason.CANCELLED to "ERR_SBYT_DOWNLOAD_CANCELLED",
    ).forEach { (reason, expected) ->
      val error: CodedException = PrototypeDiagnostic.error(
        when (reason) {
          DiagnosticReason.TOO_LARGE -> DiagnosticStage.OUTPUT
          DiagnosticReason.TOO_LONG, DiagnosticReason.LIVE_SOURCE -> DiagnosticStage.METADATA
          DiagnosticReason.BUSY -> DiagnosticStage.INIT
          else -> DiagnosticStage.DOWNLOAD
        },
        reason,
      )
      assertEquals(expected, error.code)
      assertTrue(error.message.orEmpty().isNotBlank())
      assertNull(error.cause)
    }
  }

  @Test fun everyReasonCodeRoundTripsThroughWrappedDiagnosticsWithFixedMessages() {
    DiagnosticReason.values().forEach { reason ->
      val original = PrototypeDiagnostic.error(DiagnosticStage.DOWNLOAD, reason)
      val wrapped = IllegalStateException("private wrapper text", original)
      val roundTrip = PrototypeDiagnostic.existingDiagnostic(wrapped)
      assertEquals("ERR_SBYT_DOWNLOAD_${reason.name}", roundTrip?.code)
      assertTrue(roundTrip?.message.orEmpty().isNotBlank())
      assertFalse(roundTrip?.message.orEmpty().contains("private wrapper text"))
      assertNull(roundTrip?.cause)
    }
  }

  private fun assertCode(expected: String, stage: DiagnosticStage, stderr: String) {
    val error = PrototypeDiagnostic.classify(stage, IllegalStateException(stderr))
    assertEquals(expected, error.code)
    assertFalse(error.message.orEmpty().contains(stderr))
    assertNull(error.cause)
  }
}
