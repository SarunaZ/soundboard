# Play Choose file fix — 2026-10-18

Play 1.0.10/code 11 uses `expo-document-picker` for system audio selection and
copies selected audio into an explicit private editor file before decoding.
The former file-system picker returned cancellation for all native failures;
the Source button was reproduced returning without opening DocumentsUI. Also,
Expo Android's copy-to-directory path resolves the source as a Java file,
which is incompatible with SAF `content://` selections. Explicit destination
files use the supported provider-stream copy path.

DocumentPicker returns the original name/MIME and an app cache copy. Play
preserves that metadata, stages `source.<validated extension>`, then removes
only the canonical direct returned file under its `cache/DocumentPicker/`
directory. Cancellation, failure and abort-after-selection keep existing drafts
and user files intact. Picker launch failures now propagate instead of being
silently treated as cancellation. No storage permission was added.

Validation passed:

- Play TypeScript and 27 relevant media/recording tests, including content URI
  staging, MIME-backed opaque names, picker cancellation/errors, returned-cache
  ownership and abort cleanup. Existing recording behavior passed regression checks.
- ARM64+x86_64 APK/AAB build and Play package/exclusion audits. Testing APK passed
  v2/v3 signature and ZIP alignment checks, then updated only simulator Play
  with `install -r`; no uninstall or data reset.
- Editor's direct Choose file opened Android DocumentsUI. Selecting the existing
  `soundboard-import-test.mp3` entered Trim with its filename, a real waveform
  and 0.36-second duration.
- Returning to Source and canceling another picker preserved that draft.
  Selecting the invalid MP3 displayed an audio-read error and retained the draft.
- The historical `soundboard-too-long-test.mp3` fixture is actually 61.07 seconds
  and is valid under the current five-minute source limit. It correctly opened
  with a 60-second initial trim. This is not a native over-five-minute rejection
  claim; that limit remains covered by media tests.
- Quick add opened its existing Source route; Choose file from that route also
  opened DocumentsUI. Canceling left its target pad empty and the saved Imgflip
  demo intact. All QA drafts were discarded without saving any new clip.
- The original MP3's SHA-256 remained
  `2b9bf3ea698081409cd9f297eac04d8948dbd74c5b1ad9162bb7f053b00b9dfd`.
  The simulator is left on Editor. Existing saved clips, boards, larger logo and
  artwork remain; Dev source is unchanged.

Evidence: [working system picker](../data/emulator-review-2026-10-18/choose-file-fixed-picker.png),
[imported waveform](../data/emulator-review-2026-10-18/choose-file-imported-trim.png),
[canceled picker/draft retained](../data/emulator-review-2026-10-18/choose-file-cancel-preserved.png),
[invalid audio](../data/emulator-review-2026-10-18/choose-file-invalid-result.png),
[preserved board](../data/emulator-review-2026-10-18/choose-file-board-preserved.png).

[Signed testing APK](../data/play-build-20261018-154845-347-795e2f98/artifacts/soundboard-play-testing.apk)
SHA-256: `f995ac81499489a32e3ac00f16e52f2ead36e66e026d9397438d3cfad246a01e`.
Unsigned APK/AAB and audit metadata are in the same artifact directory.
No physical phone update, commit, push or store publication occurred.
