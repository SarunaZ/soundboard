# Stop all and scroll rail follow-up — October 24

The owner reported that Stop all moved the scrollbar when playback started and
asked to remove the visible DRAG label.

Stop all previously participated in the shell's flex layout. Adding its 48dp
button and 14dp gap shortened the board by 62dp (155 physical pixels on the test
emulator), changing the rail and thumb dimensions.

Stop all now floats centered above bottom navigation. A constant 62dp strip
keeps page controls, the Scroll count and other page content clear of the button
in both idle and playing states. Its wrapper passes through touches outside the
button, and the button clears either rail edge. Settings also uses a fixed inset.
The rail keeps its arrows, grip and introductory animation, with no visible DRAG
text. Thumb sizing and drag mapping use the track's measured native height.

Implementation was delegated to the existing gpt-6-luna Board worker at high
reasoning effort and reviewed by the primary agent. Existing playback behavior,
one-second protection and per-board rail-side preferences remain in effect.

The October 25 follow-up removes the numeric hold badge. Previously, React Native's
reduced-motion state selected that badge instead of the perimeter. After USB
reconnection, the S24 reported `transition_animation_scale=0.0` while its animator
duration and window scales were 1.0. The installed React Native Android
AccessibilityInfo module reads the transition scale for reduced motion, confirming
the cause. No phone settings were changed. Essential one-second perimeter
progress now remains visible in either mode; optional bounce and rail motion
continue to respect reduced motion.

## Verification

Strict Play TypeScript, all 174 Play tests, all 11 packaging tests and the diff
whitespace check passed for the final source. All 92 staged source hashes match.
The final **1.0.25/code 26** ARM64/x86_64 APK and AAB passed the isolated native
build and packaging audits. The testing APK's existing certificate, v2/v3
signatures and 16KiB alignment were verified.

Passed on the API 36 emulator using the owner's authorized ADB touch commands:

- With transition-animation scale 0.0, successive hold captures show clockwise
  perimeter progress and then the protected disabled state, without a numeric
  badge. Normal scale 1.0 also shows the perimeter and reaches protection.
  The emulator's original transition scale was restored to 1.0 afterward.
- In 4x4 Scroll mode with the right rail, the rail's full 120x1066 physical-pixel
  rectangle is identical before and during protected playback. It is also
  identical at the scrolled position before and after Stop all: zero changed
  pixels in both comparisons.
- In 3x4 Pages mode with the left rail, the same two comparisons also have zero
  changed rail pixels. Prev/Next and the page count remain above the Stop all
  strip; the rail spans [58,749] to [178,1815]. The right rail spans [903,749]
  to [1023,1815].
- Both rails accept drags during protected playback, including gestures starting
  near their lower end. The right rail reaches QA 24 after loading all sounds;
  the left rail scrolls to QA 11 within its page. Stop all remains usable, and
  idle hierarchy dumps contain neither an active Stop all nor a visible DRAG label.

Native screenshots, hierarchy dumps and `rail-comparison.json` are under
`data/play-hold-feedback-20261025/`. Earlier baseline screenshots and intermediate
1.0.24/code 25 artifacts are in `data/play-stop-overlay-20261024/`.

The same signed APK was installed with `adb install -r --user 0` on the Galaxy
S24 Ultra (SM-S928B). It reports 1.0.25/code 26, retains app ID/UID 10492 and the
October 17 first-install timestamp, and still reports transition scale 0.0.
No uninstall, app-data clear, phone setting change or phone fixture import was
performed. Phone gestures were not automated; interaction evidence is from the
emulator reproducing the phone's reduced-motion condition.

Signed APK SHA-256:
`95bb9e5fdf5f775e6d22b666e2800f45b1f1f5074ee77229669375db327e25ce`.

## Half-width rail refinement — October 25

The owner's next request halves the visible body from 48dp to 24dp, track from
12dp to 6dp, and thumb from 28dp to 14dp. Arrows and grip also use smaller glyphs.
A centered visual body remains inside the existing 48dp dedicated gesture and
accessibility area, preserving the separation between rail gestures and pads.

The gpt-6-luna Board worker implemented the style change. Primary review, strict
TypeScript, the 12 existing hold/rail tests and diff-check passed. No style-only
tests were added. The isolated ARM64/x86_64 APK/AAB build and packaging audits
passed; all 92 source hashes match the build stage.

Native emulator measurements confirm 120 physical pixels before and 60 afterward
on either side. The accessibility/gesture target remains 120 pixels wide. Drags
at x=915 on the right and x=70 on the left, outside the visible body but inside
its target, scroll to QA 11 without starting pads. Rail pixels remain identical
before, during and after protected playback. Evidence is under
`data/play-slim-rail-20261025/`, including `native-measurements.json`.

The same signed **1.0.26/code 27** APK is installed on the S24 Ultra. App ID/UID
10492 and the October 17 first-install timestamp are unchanged. No app data or
phone settings were cleared. Its SHA-256 is
`b4c2aff5359fc99616917d0a030a3f43729f9afa0dad574261a6759d92b6aebf`.

## Navigation breathing room — October 25

This interpretation was superseded by the owner's screenshot clarification below.

The owner requested top spacing for navigation. The bottom bar now includes a
12dp top inset and grows from 78dp to 90dp, retaining the prior navigation-button
area. Its shared height also positions Stop all and Settings consistently; the
fixed 62dp content clearance remains independent of playback.

The gpt-6-luna Board worker implemented the change. Primary review, strict
TypeScript, seven existing rail/layout tests and diff-check passed. The isolated
ARM64/x86_64 APK/AAB build and native packaging audits passed; all 92 stage source
hashes match. Emulator screenshots confirm the divider moves upward by 30 physical
pixels (12dp), while all three navigation-button bounds remain unchanged. Board,
Editor and Library taps select the expected pages. The rail rectangle is identical
before/during/after protected playback, and Stop all works at its new position.
Evidence is in `data/play-navigation-spacing-20261025/`.

The signed **1.0.27/code 28** APK is installed on the S24 Ultra, retaining UID
10492 and the original first-install timestamp. No app data was cleared.
SHA-256: `d6bf1de10a598e6ee093e4302918a6c56f0b70121544acd70110f98958bb8cf3`.

## Corrected pagination gap — October 25

The owner's annotated screenshot clarified that navigation meant the Board's
Prev/Page/Next controls directly below the pad grid. The previous bottom-tab
inset was a misinterpretation and is reverted: bottom navigation is again 78dp,
with dock bottom 92dp and Settings inset 140dp. A 12dp top margin on the pagination
row creates the requested gap. Fixed content clearance and slim rail stay intact.

The gpt-6-luna Board worker implemented this correction. Primary review, strict
TypeScript, seven existing layout/rail tests and diff-check passed. The isolated
ARM64/x86_64 APK/AAB build and native audits passed, with all 92 stage hashes
matching current inputs.

Native emulator hierarchy measurements show the pad viewport ending at y=1665
and Next beginning at y=1695: a 30px/12dp gap, compared with zero before. Visual
inspection confirms the empty space shown by the owner's arrows. Next reaches
Page 2 of 3 and Prev returns to Page 1. Protected playback and Stop all work,
with zero changed pixels in the rail before/during/after playback. Captures and
`native-measurements.json` are in `data/play-pagination-gap-20261025/`.

The signed **1.0.28/code 29** APK is installed on the S24 Ultra. UID 10492 and the
October 17 first-install timestamp remain unchanged; no app data was cleared.
SHA-256: `f2fcba74027e43c4789c6a70159a491dffb218e4065797fddee859dc799d6eb9`.
