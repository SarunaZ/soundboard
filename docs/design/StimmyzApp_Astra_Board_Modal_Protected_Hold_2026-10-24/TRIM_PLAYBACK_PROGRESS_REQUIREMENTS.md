# Trim Preview Playback Progress — Astra handoff update

**Date:** 2026-10-20  
**Scope:** The existing **Trim** step only. Keep the device-audio-first Source flow, selected-range trimming, Fine tune, customization, navigation, themes, board actions and data model intact.

## Goal

Make listening to a selected soundbite visually understandable: the user should see **which part of the selected clip is currently playing** while previewing it. Users trim short memorable moments, so they need immediate feedback about timing without losing the precise selection controls.

## UX specification

- The waveform continues to show the original source's absolute timeline and **two independently draggable selection handles**.
- On **Play preview**, play **only** `[selectionStart, selectionEnd]`, using the existing native audio player. The moving playhead begins at `selectionStart`, advances along the waveform with actual audible playback, and never advances past `selectionEnd`.
- Inside the selected waveform range, color the **already played portion** with a brighter accent. Preserve clear visual distinction between unselected source, selected source, played portion, playhead and both drag handles. The played overlay must not intercept drag gestures.
- Directly below the waveform, show **Play / Pause**, a thin filled **progress bar**, and **elapsed / selected-duration** display (e.g., `00:00.84 / 00:02.47`). These are *clip-relative* times, while selection start/end remain *source-relative* times (e.g., `00:02.52 → 00:05.00`).
- **Pause** freezes progress at the last audible position. **Resume** continues from that position. At the selection end, playback stops, progress remains at 100%, and the next Play begins from the selection start.
- An optional **Loop** control may replay the selected segment. In the supplied interactive prototype it is present; enable it only if the native player can repeat without noticeable gaps. It defaults **off** and must be visibly toggled.
- If either trim handle moves or Fine tune changes start/end during playback: pause immediately, update the range and reset clip-relative preview progress to `00:00.00` at the new start. Display fresh duration. Avoid negative or out-of-range progress.
- Any time the user closes Trim, advances to Customize, replaces the audio source, cancels the draft, or loses the audio playback session/audio focus, stop or pause playback safely; no audio may continue invisibly after leaving Trim.
- **Accessibility:** accessible transport names and playback state, contrast in all nine themes, non-color time/progress cues, and touch targets at least 48dp. The playhead and overlay must not obscure handles or text.

### Important implementation distinction

`prototype/standalone.html` contains a **timed visual simulation only**. It has no playable audio and uses a local browser timer to demonstrate layout and interaction. **Do not implement elapsed playback from an independent UI timer in Android**; subscribe to actual player position (including pause, buffering, seeks and completion). Align the displayed playhead to the player's current source position, then compute clip-relative elapsed time as `clamp(currentSourcePosition - selectionStart, 0, selectedDuration)`. Prefer player playback callbacks and progress updates at smooth but reasonable intervals (e.g., ~30–60ms while actively playing), and cancel observers on teardown.

## Acceptance criteria (P0)

- **TP-01 — Selection-limited playback:** After choosing a nonzero selection, Play starts at exactly the selected start and stops at the selected end. No audio before or after the selection is audible (allow a small implementation-appropriate codec/seek tolerance; document it).
- **TP-02 — Live progress:** While audible playback proceeds, the waveform playhead, played tint, progress bar and elapsed label all advance coherently. No imaginary movement while paused, buffering or audio has stopped.
- **TP-03 — Time semantics:** Elapsed begins at `00:00.00` for each fresh preview. Total equals `end - start`, and both labels reflect the same selected range displayed on the waveform. Source-absolute bounds remain available separately.
- **TP-04 — Pause/resume:** Pause freezes the visible position and audio; Resume continues from the paused position without jumping to the source start.
- **TP-05 — End / replay:** End-of-range stops sound, sets progress to 100%, and a new Play starts at the chosen selection start.
- **TP-06 — Editing selection:** Moving either handle or using Fine tune while preview is playing stops/pauses preview and resets progress to the adjusted start. Changing the selection never produces negative, >100%, or out-of-range progress.
- **TP-07 — Lifecycle:** Leaving Trim, switching files, replacing a recording, or destroying the route never leaves an orphaned audio stream or progress observer. Handle audio focus/interruption and temporary source errors visibly.
- **TP-08 — Theme & touch:** Playback UI is legible in Peach, Mint, Snow, Ice, Vanilla and Chocolate themes, remains usable at narrow widths and larger font settings, and keeps both waveform handles fully draggable.
- **TP-09 — No regressions:** Existing Trim save/render, 60-second selection limit, three input methods, fixed first Quick Add tile and menus continue working.

## Optional acceptance criteria (P1)

- **TP-10 — Loop:** Loop off is the default. With Loop on, the selected segment repeats and the visual progress wraps back to zero exactly when the native player repeats. Loop off returns to single-pass behavior.
- **TP-11 — Seek/scrub:** If enabled later, tapping or dragging inside the selected waveform seeks within selection bounds, updating both player and UI position atomically. Do not let seek conflict with trim-handle gestures.

## Test matrix for Astra

Use source files of ~1s, 10s, 60s and >60s, plus a source with a clearly audible spoken/synthetic marker immediately before and after the selected range. Verify full selection, narrow selection (~0.5s), changed handles while playing, repeated play/pause, finish/replay, interruptions, app background, and waveform trim after returning from device recording. Test physical Android audio playback on the owner's S24 Ultra and at least one emulator; manual listening is necessary because a moving bar alone does not prove correct clipping.

## Do not change

Do not redesign the Board or Library; do not change pad order, Quick Add's edit-only arrow, content licensing behavior, device recording permissions, source preference defaults or the six-theme palette. Do not add an external audio dependency unless a repo audit shows it is necessary.
