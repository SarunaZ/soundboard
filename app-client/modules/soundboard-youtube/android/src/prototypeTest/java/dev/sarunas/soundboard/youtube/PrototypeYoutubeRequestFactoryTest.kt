package dev.sarunas.soundboard.youtube

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PrototypeYoutubeRequestFactoryTest {
  @Test fun downloadRequestKeepsConstrainedM4aOptionsAndDisablesAutomaticFixups() {
    val url = "https://www.youtube.com/watch?v=abcdefghijk"
    val outputTemplate = "/app/cache/soundboard-youtube-prototype/123e4567-e89b-12d3-a456-426614174000.%(ext)s"
    val request = PrototypeYoutubeRequestFactory.download(url, outputTemplate)

    assertEquals("bestaudio[ext=m4a][protocol=https]", request.getOption("-f"))
    assertEquals("32M", request.getOption("--max-filesize"))
    assertEquals(outputTemplate, request.getOption("-o"))
    assertTrue(request.hasOption("--no-part"))
    assertEquals("never", request.getOption("--fixup"))
    assertTrue(request.buildCommand().contains(url))
  }

  @Test fun metadataRequestDoesNotUseDownloadOnlyOptionsOrFixupPolicy() {
    val request = PrototypeYoutubeRequestFactory.metadata("https://www.youtube.com/watch?v=abcdefghijk")

    assertTrue(request.hasOption("--dump-single-json"))
    assertTrue(request.hasOption("--skip-download"))
    assertNull(request.getOption("-f"))
    assertNull(request.getOption("--fixup"))
    assertFalse(request.hasOption("--no-part"))
  }
}
