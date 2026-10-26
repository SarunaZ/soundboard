# Simplified playback and settings contract

Global Settings has only **Playback (master volume; background playback only when really supported)**, **Appearance**, **Backup & restore**, and **About**. The current nine themes are controlled ONLY by Settings → Appearance. No top-right overflow theme shortcut, no per-board theme menu.

Baseline: playing pads display their progress automatically (no toggle); tapping an active pad restarts it; finished sounds reset to the beginning; pads are playable offline; normal boards have no edit controls; Stop all appears during playback and stops all active loops; labels/artwork are readable without extra toggles.

Board-local in Edit Board: allow simultaneous playback, choose 3×4 or 4×4 grid, choose Pages or Scroll. Each board preserves choices, even across app restart and backup/restore.

Clip-local via pad ⋮ **in edit mode** or Library ⋮: gain 0–200%, 100% original, values >100% amplify with output limiting/peak protection; repeat once/loop/three times. Native tests must verify real output using quiet/clipped sources and overlapping clips; 200% is ~+6dB digital gain, not 2× speaker loudness. Clip settings persist across board moves and backups.

Don't add settings for progress, reset, default repeat, global overlapping, tap behavior, separate Stop button or image label contrast. Those are automatic/board/clip behavior, not global preferences.


## NEWEST UPDATE — 2026-10-24: Board modal and protected 2-second hold

**Read `BOARD_MODAL_AND_PROTECTED_PLAYBACK_HANDOFF.md` first.** `Edit board` now enters edit mode and opens its settings in a dialog rather than expanding an inline panel; the existing controls and their persistence remain. Pads have quick press/rebound feedback and a 2-second charging perimeter on hold. A completed hold starts a protected playback session that cannot be interrupted by other pad taps, regardless of the board-wide overlap toggle. Clip-specific repeat (once/three/loop), stop controls, per-clip gain, accessibility alternatives, and native audio resource limits are mandatory. The browser prototype simulates audio and must not be presented as a production audio engine.
