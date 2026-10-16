package dev.sarunas.soundboard.youtube

import com.yausername.youtubedl_android.YoutubeDLRequest

/** Keeps the actual metadata/download argument sets independently testable. */
internal object PrototypeYoutubeRequestFactory {
  fun metadata(url: String) = base(url).apply {
    addOption("--dump-single-json")
    addOption("--skip-download")
    addOption("--no-warnings")
    addOption("--no-progress")
  }

  fun download(url: String, outputTemplate: String) = base(url).apply {
    addOption("-f", "bestaudio[ext=m4a][protocol=https]")
    addOption("--max-filesize", "32M")
    addOption("-o", outputTemplate)
    addOption("--no-part")
    // Skip yt-dlp's automatic M4A-DASH repair; this prototype ships no FFmpeg executable.
    addOption("--fixup", "never")
  }

  private fun base(url: String) = YoutubeDLRequest(url).apply {
    addOption("--no-playlist")
    addOption("--ignore-config")
    addOption("--no-cache-dir")
    addOption("--no-mtime")
    addOption("--no-warnings")
    addOption("--socket-timeout", "15")
    addOption("--retries", "0")
    addOption("--extractor-retries", "0")
    addOption("--fragment-retries", "0")
  }
}
