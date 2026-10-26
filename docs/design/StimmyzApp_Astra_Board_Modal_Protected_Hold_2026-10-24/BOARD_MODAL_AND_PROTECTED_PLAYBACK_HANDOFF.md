# Astra implementation handoff — Board settings modal and protected long press

**Revision:** 2026-10-24. This document supersedes older requirements where `Edit board` revealed a tall inline settings panel. Earlier product requirements otherwise remain in force.

## A. Edit Board opens a modal

1. Tapping **Edit board** enters Edit Board mode and presents a modal / bottom-sheet-style dialog, not an inline panel that pushes pads down.
2. Modal contains **Grid size** (3 × 4 or 4 × 4), **More sounds** (Pages or Scroll/lazy loading), and **Allow overlapping sounds** (board-local). Keep existing choices and data storage. No duplicate settings in global Settings.
3. Dialog offers Done/close, closes on Back, and supports accessibility semantics. Closing it **keeps Edit Board mode active** so the user can edit pad options; tapping **Done editing** exits Edit Board mode and hides the pad `⋮` controls. Provide a small contextual **Board settings** affordance while editing so the dialog can be reopened.
4. Keep Quick Add first. Quick Add arrow and all other pad `⋮` controls remain edit-only. Persist board choices across sessions and backup/restore. Only the UI presentation changes; no board data loss or reordering.

## B. Pad press animation

1. Ordinary tap has brief tactile compress/rebound and a short bright highlight, reminiscent of pressing a rhythm-game tile. Approx. 0.2–0.3 seconds, hardware accelerated (transform and opacity). Preserve instant audio response and prevent layout shifts; do not couple sound start to end of animation. Provide optional lightweight haptic feedback if platform conventions allow; don't rely on haptics.
2. On touch/press hold, draw a perimeter ring from 0 to 360 degrees over **exactly 2 seconds**. Cancel on release before threshold, pointer cancellation, movement/scroll, or departure from the control. Do not trigger protected mode accidentally during scroll, repeated accessibility click, or pad edit operations.
3. On release before threshold, treat as a normal tap and play once using the existing clip-specific repeat mode; do not additionally perform long-press action. On completion of the hold, start exactly one protected playback session, immediately show a protected/locked visual state and a separate **Stop** control. Do not also fire the short-tap action when the user releases after completion.
4. In the prototype the audio engine is **simulated**. Production must use actual native playback timing and completion callbacks, not a browser countdown for audio lifecycle.

## C. Protected playback semantics (semi-overlap, independent of board toggle)

- Default single-sound board: a normal pad tap replaces only other **unprotected** sessions. **Protected** sessions must continue. Example: protect A with a 2s hold; tapping B starts B while A continues; then tapping C replaces B but **A keeps playing**. Multiple different sounds may be protected at once.
- Board overlap ON: normal taps may overlap as previously specified; protected sessions still cannot be retriggered or interrupted by subsequent taps.
- Do not allow repeated triggering on a protected pad. Its main play hit target is temporarily disabled and visibly locked. A separate Stop control on that pad (and existing **Stop all**) must cancel and unlock it. Provide accessible labels and adequate targets.
- Repeat semantics are exact: `once` finishes naturally and unlocks; `three` plays the sound three total times then naturally unlocks; `loop` stays protected until Stop or Stop all. Per-clip gain (0–200%) applies on each repetition with safe limiting/mixing.
- Natural completion (including after exactly 3 repeats) must immediately remove protected state, hide Stop/lock controls, and restore normal tap behavior. Stop all likewise clears **all** sessions and locks. Never persist runtime lock flags across app relaunch; do persist each clip's repeat/gain settings.
- Do not kill protected sessions merely because the user taps a different pad, changes board page, toggles overlap, or scrolls the board. Follow app background policy if leaving the app. Removing/deleting a sound, losing audio focus, an unrecoverable decoder error, and app lifecycle shutdown should release sessions and locks safely.
- Enforce maximum simultaneous voices, gain summation and limiter to avoid clipping/overloading Android playback. Protected sessions still count toward resources; surface a graceful limit rather than silently stealing protected voices.

## D. Accessibility, implementation and edge cases

- A 2-second touch-and-hold **must not be the only means** of enabling protected mode. Expose the same `Protect playback` action via an accessible pad action (e.g., Android TalkBack custom action / contextual non-edit-mode action). In the HTML prototype, **Shift+Enter** on a focused pad activates protected mode, because users with motor impairments or keyboard/assistive tech cannot always hold. This accessibility action is **not** an extra global Setting.
- Screen readers announce whether the pad is playing and protected, and can invoke Stop. Consider an optional spoken announcement only on state change, not each progress-frame update.
- Cancel charge on vertical swipe so scrolling still works in both grid modes. No text selection/context menu interference. Honor Reduce Motion where applicable while keeping a visible, nonanimated charging progress alternative.
- Fast double taps, an already locked pad, offscreen virtualized pads, modal open/close, board switch, playback finishing during gesture, and Android lifecycle transitions must not create duplicate voices or stale locks.
- Distinguish audio *focus* changes from user-started sounds: a protected session is immune to **Stimmyz's normal replacement policy**, not OS interruptions such as phone calls/audio-focus loss.

## E. Acceptance tests

1. Click Edit Board: modal appears above pads; contains 3×4/4×4, Pages/Scroll and overlap, no duplicate inline controls. Close modal, edit-only `⋮` appears; Done editing hides it.
2. Save board settings in modal, reopen and switch board: settings are independent and persist.
3. Brief tap: pad depresses and rebounds; begins ordinary playback; no hold lock.
4. Hold 1.5 seconds then release: charge cancels, ordinary playback triggers once, no protected lock. Scroll/pointer cancellation cancels without playback.
5. Hold for at least 2 seconds: ring completes 360°, pad locks and becomes unretriggerable; Stop control appears; protected playback starts once.
6. With overlap OFF protect A, tap B, tap C: A plays continuously; B is replaced by C. Additional protected D coexists.
7. With A repeat=three, hold A: each round completes, then A unlocks automatically after the third; stop before third unlocks immediately. With repeat=loop, only Stop or Stop all unlocks.
8. Restart-on-tap, per-clip volume/amplification, normal pad progress, modal settings, pagination/scroll, nine themes, and gallery-only artwork remain operational.
9. Verify TalkBack accessible alternative to long press and per-pad Stop. Run on a physical Android device.

## Design reference

Use `prototype/standalone.html` or `StimmyzApp_Interactive_Prototype.html`. The prototype simulates sound playback and the 2-second timing; actual Android audio engine behavior requires native implementation. See `previews/board-settings-modal-vanilla.png`, `previews/board-hold-charging-vanilla.png`, and `previews/board-protected-grape.png`.
