# Gesture feedback and scroll rail follow-up — October 24

The owner confirmed that playback protection works but its visual charging cue
was insufficient. Their latest instructions override the handoff's two-second
duration: charge for **one second**, show the pad as **disabled** instead of
displaying a padlock, and allow **left/right rail placement** in each board's
settings. Immediate playback on touch remains required.

The later Stop all/rail follow-up is tracked in
[the overlay regression record](play-stop-overlay-2026-10-24.md).
The October 25 refinement replaces the reduced-motion countdown described below
with the same essential perimeter progress used in normal motion mode.

## Findings and changes

The prior rail was incorrectly gated on Scroll mode and more sounds than a page
could hold. It could therefore disappear while a Pages grid, or a smaller Scroll
grid, still overflowed vertically. Visibility now follows measured native content
overflow and unloaded Scroll content. Its reservation is latched within the
current view to avoid oscillation when its width changes the grid layout.

The original three-dp white charging segments were faint on bright pads. The
updated interaction shows a dark perimeter track immediately on press, followed
by a thicker clockwise white fill. Press compression/flash and rebound are more
visible. The fill completes after one second, and protected playback changes the
main target to a muted disabled appearance. The separate Stop target remains
usable. Reduce Motion retains a nonanimated countdown alternative.

Each board saves its rail side independently, defaults legacy boards to Right,
and includes the setting in backup/restore. Changing sides does not reorder pads.
The Board selector's lingering Appearance shortcut is removed; theme selection
remains in Settings.

Implementation is delegated to the existing `gpt-6-luna` Board worker at high
reasoning effort. Production changes are limited to the Board UI/helpers/model,
tests, and local testing version metadata. Native testing uses generated sine
WAVs in an emulator-only Gesture QA board; existing emulator data is retained.

## Native verification

The owner explicitly authorized Android ADB gesture commands after the Windows
desktop controller could not hold a touch down. The final build is
**1.0.23/code 24**. Earlier two-second captures and intermediate 1.0.22 builds
are diagnostic history, not evidence for the final one-second interaction.

Passed on the Android API 36 emulator with 24 generated four-second PCM16 WAVs:

- The one-second hold visibly advances around the perimeter, then changes the
  pad to muted disabled styling without a padlock. See the
  [six-second video](../data/play-gesture-regression-20261024/one-second-demo.mp4),
  [early charge](../data/play-gesture-regression-20261024/one-second-early.png), and
  [disabled state](../data/play-gesture-regression-20261024/one-second-disabled.png).
- A 600 ms hold releases without protection. The normal sound continues and
  the charging perimeter clears.
- Tapping a disabled pad's body leaves protected playback active. Its separate
  Stop control re-enables only that pad; Stop all clears all active playback.
- With overlap off, protected A remains while B is replaced by C. The
  [protected/ordinary state](../data/play-gesture-regression-20261024/final-main-retap.png)
  and [per-pad Stop result](../data/play-gesture-regression-20261024/final-pad-stopped.png)
  show A and C together, then C continuing after A stops.
- Once and Three repeat modes re-enable their pads on natural completion.
  Idle hierarchy dumps confirm enabled controls and no lingering Stop all.
- Rail-only drags scroll overflowing Pages grids and load/reach all 24 sounds
  in Scroll mode without starting playback. Idle hierarchy dumps confirm no
  Stop all control after the rail gestures.
- Both side choices place the rail on the selected edge without reordering
  pads. Left remains selected after force-stop/relaunch; reopening settings
  confirms it. Switching back to Right places the rail on the right.

Screenshots, UI hierarchies, video, generated fixtures and logs are under
[`data/play-gesture-regression-20261024/`](../data/play-gesture-regression-20261024/).
This is native UI/playback-state evidence, not an acoustic latency, loudness,
gapless repeat or physical touch/scroll measurement. Full TalkBack and the
owner's physical listening/gesture acceptance remain open.

## Automated checks and delivery

- **173/173 Play tests**, **11/11 packaging tests**, strict TypeScript and
  `git diff --check` pass.
- ARM64 + x86_64 release-mode APK and AAB builds and package, signature,
  alignment, permissions and native autolinking audits pass.
- All **92 staged inputs match the current source** by SHA-256. Dev source
  remains unchanged. Final artifacts are in **`one-second-delivery/`**;
  `native-build/` and `delivery/` are intermediate two-second builds.
- The existing local-testing certificate is retained. No commit, push or
  publication was performed.

[Signed testing APK](../data/play-gesture-regression-20261024/one-second-delivery/artifacts/stimmyz-1.0.23-testing-signed.apk),
67,142,201 bytes; SHA-256
`e34f4a202a25815c8bb5235253d61d20b4459e20c89e1307ba8f8abfbd065c90`.

On the owner's request to fix the installed app, `adb install -r --user 0`
succeeded on the **Galaxy S24 Ultra (SM-S928B)**, updating it from 1.0.21/code 22
to **1.0.23/code 24**. Its UID remains `10492` and first-install timestamp is
unchanged. No uninstall, app-data clear, or fixture import was performed on the
phone. Emulator test fixtures remain confined to the emulator. The phone was
not driven through the gesture matrix; the verified install is separate from
the emulator interaction evidence above.
