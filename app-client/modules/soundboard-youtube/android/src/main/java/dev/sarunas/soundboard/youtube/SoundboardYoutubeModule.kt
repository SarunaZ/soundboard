package dev.sarunas.soundboard.youtube

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Normal builds expose the same API but never contain the downloader runtime. */
class SoundboardYoutubeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SoundboardYoutube")

    Constant("enabled") { false }
    Constant("privateRelease") { false }

    AsyncFunction("extract") { _: String, _: String ->
      unavailable()
    }

    AsyncFunction("cancel") { _: String -> }
    AsyncFunction("release") { _: String -> }
  }

  private fun unavailable(): Map<String, Any> {
    throw IllegalStateException("On-device YouTube extraction is unavailable in this build.")
  }
}
