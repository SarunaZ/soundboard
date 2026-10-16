package dev.sarunas.soundboard.youtube

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrototypeErrorReportTest {
  @Test fun removesUrlsHeadersBearerCredentialsOpaqueValuesPathsAndVideoIds() {
    val raw = """ERROR: [youtube] dQw4w9WgXcQ: request https://private.example/watch?v=video-secret&token=query-secret
Authorization: Bearer header-secret
Cookie: session=cookie-secret
token=assignment-secret
opaque=${"A".repeat(48)}
failed at C:\\Users\\someone\\private\\extractor.py and /data/user/0/app/private/file
"""

    val redacted = PrototypeErrorReport.redactMessage(raw)

    listOf(
      "https://private.example", "video-secret", "query-secret", "header-secret", "cookie-secret",
      "assignment-secret", "A".repeat(48), "C:\\Users", "/data/user/0", "dQw4w9WgXcQ",
    ).forEach { secret -> assertFalse("unexpected raw value: $secret", redacted.contains(secret)) }
    assertTrue(redacted.contains("<URL>"))
    assertTrue(redacted.contains("<PATH>"))
    assertTrue(redacted.contains("[youtube] <VIDEO_ID>"))
  }

  @Test fun preservesReadableUnknownFailureAfterAnsiRemoval() {
    val raw = "\u001B[31mERROR\u001B[0m: extractor returned an unfamiliar response"
    assertEquals("ERROR: extractor returned an unfamiliar response", PrototypeErrorReport.redactMessage(raw))
  }

  @Test fun capturesUnknownOriginalFailureInsteadOfOnlyTheFiniteSafeClassification() {
    val original = IllegalStateException("unrecognized demux handshake failed: ${"x".repeat(48)}")
    val report = PrototypeErrorReport.render(
      DiagnosticStage.DOWNLOAD,
      "ERR_SBYT_DOWNLOAD_EXTRACTOR",
      original,
      1_791_720_000_000L,
    )

    assertTrue(report.contains("safeCode=ERR_SBYT_DOWNLOAD_EXTRACTOR"))
    assertTrue(report.contains("exception[0].class=IllegalStateException"))
    assertTrue(report.contains("unrecognized demux handshake failed"))
    assertTrue(report.contains("<OPAQUE>"))
    assertFalse(report.contains("x".repeat(48)))
  }

  @Test fun limitsCauseDepthAndStopsOnCycles() {
    val outer = IllegalStateException("outer")
    val second = IllegalArgumentException("second")
    val third = UnsupportedOperationException("third")
    val fourth = IllegalStateException("fourth")
    val fifth = IllegalStateException("fifth")
    outer.initCause(second)
    second.initCause(third)
    third.initCause(fourth)
    fourth.initCause(fifth)
    fifth.initCause(outer)

    val report = PrototypeErrorReport.render(DiagnosticStage.DOWNLOAD, "ERR_SBYT_DOWNLOAD_EXTRACTOR", outer, 1L)

    assertTrue(report.contains("exception[3].message=fourth"))
    assertFalse(report.contains("fifth"))
    assertTrue(report.contains("causesTruncated=true"))
  }

  @Test fun reportIsAtMostEightKiBAndEndsOnUtf8Boundary() {
    val fourth = IllegalStateException("音".repeat(1_200))
    val third = IllegalStateException("音".repeat(1_200), fourth)
    val second = IllegalStateException("音".repeat(1_200), third)
    val first = IllegalStateException("音".repeat(1_200), second)
    val report = PrototypeErrorReport.render(
      DiagnosticStage.DOWNLOAD,
      "ERR_SBYT_DOWNLOAD_EXTRACTOR",
      first,
      1L,
    )
    val bytes = report.toByteArray(Charsets.UTF_8)
    assertTrue(bytes.size <= PrototypeErrorReport.MAX_REPORT_BYTES)
    val decoded = String(bytes, Charsets.UTF_8)
    assertTrue(decoded.contains("exception[0].message="))
    assertEquals(decoded, String(decoded.toByteArray(Charsets.UTF_8), Charsets.UTF_8))
  }

  @Test fun capsInputBeforeRedactingAndValidatesClassNameAndCode() {
    val report = PrototypeErrorReport.render(
      DiagnosticStage.OUTPUT,
      "private-code\nAuthorization: leaked",
      IllegalStateException(("prefix line\n").repeat(20_000) + "ERROR: final useful tail"),
      2L,
    )
    assertTrue(report.contains("safeCode=ERR_SBYT_UNKNOWN_UNKNOWN"))
    assertTrue(report.contains("final useful tail"))
    assertFalse(report.contains("Authorization: leaked"))
  }

  @Test fun truncatingInsideOneLongUrlCredentialLineDiscardsTheIncompleteLine() {
    val secretSuffix = "?token=private-query-secret"
    val message = "https://private.example/" + "pathsegment".repeat(2_000) + secretSuffix
    val redacted = PrototypeErrorReport.redactMessage(message)

    assertEquals("[TRUNCATED_LONG_LINE]", redacted)
    assertFalse(redacted.contains("private.example"))
    assertFalse(redacted.contains(secretSuffix))
    assertFalse(redacted.contains("private-query-secret"))
  }
}
