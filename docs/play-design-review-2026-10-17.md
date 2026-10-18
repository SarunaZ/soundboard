# Play app compared with the reviewed design — 2026-10-17

The installed Play app follows the proposed colors and basic navigation, but its
layout and creation screens are still substantially different from the handoff.
The most urgent visual defects are the Board grid, misleading tab emphasis and
broken Fine tune labels. This review changes no application code.

## Evidence and scope

Inspected `dev.sarunas.soundboard.play` 1.0.0/code 1 on the connected Samsung
SM-S928B. Captures are 1080 × 2340 pixels, with Android density override 420 and
the user's existing font scale 1.15. These settings were not changed.

Compared the actual Board, board selector, Quick add, Editor, empty Library,
Trim, expanded Fine tune, Customize with keyboard, and light Board against the
[reviewed specification](design/reviewed-2026-10-17/ASTRA_HANDOFF.md), its
[prototype](design/reviewed-2026-10-17/design/prototype.html) and previews.
Code inspection supplements the device observations where noted below.

An original, generated eight-second WAV was used to reach Trim and Customize.
No clip was saved. The draft was explicitly discarded, the temporary phone file
was removed, and System theme was restored and verified. Dev's installed version
and last-update time remained unchanged. Populated Library, assigned-pad menus,
playback, rotation, and other devices/font scales were not exercised here.

## Findings

| Priority | Area | Design | Actual app and implication |
| --- | --- | --- | --- |
| High | Board grid | Compact four-column board on a sufficiently wide phone; responsive when needed | Only three tiles fit across this approximately 411 dp phone. Nine complete tiles are visible, with the next row cut by the scrolling viewport. Four-column sizing uses 23.5% widths plus three 12 dp gaps: approximately 393 dp is required inside 379 dp. This is a layout calculation defect, not a reason to reduce the user's font scale. |
| High | Fine tune | Readable Start/End rows with precision controls; explicitly no awkward vertical wrapping | Start renders as “St / art” and End as “En / d” at the existing 1.15 font scale. The buttons leave too little width for the row labels. |
| High | Navigation | Selected destination receives consistent accent/underline treatment | Editor has a permanently filled purple background even while Board or Library is selected. The selected page also receives its own text/icon treatment, leaving conflicting emphasis. The floating rounded navigation container also differs from the edge-to-edge reference bar. |
| Medium | Board hierarchy | Compact colored Stimmyz wordmark; board dropdown beside Edit board; then search | Large white wordmark, tagline, second large Main heading/subtitle, detached dropdown, and Quick add/Stop row push the grid far down. Edit board is absent. The Aa appearance button occupies prominent header space instead of the proposed preferences location. |
| Medium | Pads and menus | Compact playful pads with balanced art/name and unobtrusive overflow | Tall narrow empty tiles show plus, Pad number, EMPTY and a large bordered menu button. The visible 48 dp menu occupies over half the approximately 89 dp tile width and crowds the plus. Preserve accessible hit areas while making the visible control smaller. |
| Incomplete | Quick add | Empty-slot tile with visible preference control and remembered default action | Separate header button always opens a chooser with File/Library. There is no preference control or Record action. Confirmed on device and in source. |
| Incomplete | Source and progress | Full-screen Source choice with File and Record cards; numbered connected progress steps | Creation immediately opens Android's audio picker. The designed Source choice is skipped. A text breadcrumb and fraction replace the progress circles/connectors. Recording and video are absent; the Editor explicitly states recording is unavailable. |
| Medium | Trim composition | Distinct source summary, waveform with obvious purple handles, preview, optional Fine tune and lower Continue action | The large card combines title, waveform and several buttons. Handles appear as thin cyan edge lines when the entire file is selected. Choose another file takes another row. Continue scrolls with content instead of using the reference footer treatment. The low waveform amplitude in these captures comes from the generated test tone and is not evidence of a decoder defect. |
| Incomplete | Customize | Large live square pad preview, name, optional Default/Gallery artwork and prominent Save footer | No live pad preview or gallery/crop choice. There are six monochrome glyph choices and color swatches. Name autofocus opens the keyboard immediately; Save and colors fall below it and require dismissal/scrolling. Save is a small inline action beside Back rather than the reference's full-width lower CTA. Online artwork remains legitimately deferred. |
| Incomplete | Library | Page-specific title, full-width creation CTA, search plus sort, illustrated rows and appearance entry | Empty-state screen is readable but repeats the global brand header and places Add sound beside the title. Sort and the Library appearance entry are absent. Populated rows were not tested; source inspection also shows Change artwork and explicit Play menu actions are missing. |

## Elements that already align

- Dark navy/lavender surfaces, muted text, violet actions and cyan accents use the
  supplied semantic palette. Light mode also has the intended pale canvas.
- Board / Editor / Library destinations exist. Creation hides bottom navigation.
- Status-bar content and app content do not overlap in the captured states.
- Trim precedes Customize; Fine tune starts collapsed; start/end precision
  adjustments are available. Discard confirmation is present.
- Empty Play content is intentional. The demo's named sounds and illustrative
  character art should not be copied into the app just to make screenshots match.

## Recommended order

1. Correct grid sizing and Fine tune labels; make navigation selection unambiguous.
2. Recompose the Board header, selector/Edit controls and pad proportions to match
   the reference, retaining accessible touch targets and system text scaling.
3. Build the actual Source choice and progress indicator, then integrate planned
   recording/video sources through the existing flow.
4. Add the live Customize preview, gallery artwork and clear lower Save action.
5. Complete Quick add preferences and Library sort/menu/appearance behavior.

Repeat this visual comparison with original test clips assigned to pads, a populated
Library, compact screens and larger font scales before calling the design complete.

## Captures

| Screen | Installed app | Design reference |
| --- | --- | --- |
| Board, dark | [Phone capture](../data/design-comparison-2026-10-17/01-board.png) | [Design](design/reviewed-2026-10-17/design/previews/01-board-dark.png) |
| Board selector | [Phone capture](../data/design-comparison-2026-10-17/02-board-selector.png) | [Interactive prototype](design/reviewed-2026-10-17/design/prototype.html) |
| Editor | [Phone capture](../data/design-comparison-2026-10-17/03-editor.png) | [Source design](design/reviewed-2026-10-17/design/previews/03-create-source.png) and specification §3.1 |
| Library, empty | [Phone capture](../data/design-comparison-2026-10-17/04-library.png) | [Populated reference](design/reviewed-2026-10-17/design/previews/07-library-menu.png); content states differ |
| Trim | [Phone capture](../data/design-comparison-2026-10-17/05-trim.png) | [Trim design](design/reviewed-2026-10-17/design/previews/04-create-trim-fine-tune.png) |
| Fine tune | [Phone capture](../data/design-comparison-2026-10-17/06-trim-fine-tune.png) | [Design](design/reviewed-2026-10-17/design/previews/04-create-trim-fine-tune.png) |
| Customize, keyboard | [Phone capture](../data/design-comparison-2026-10-17/07-customize-keyboard.png) | [Customize design](design/reviewed-2026-10-17/design/previews/05-create-customize.png) |
| Customize | [Phone capture](../data/design-comparison-2026-10-17/08-customize.png) | [Design](design/reviewed-2026-10-17/design/previews/05-create-customize.png) |
| Board, light | [Phone capture](../data/design-comparison-2026-10-17/09-board-light.png) | [Design](design/reviewed-2026-10-17/design/previews/08-board-light.png) |
| Quick add | [Phone capture](../data/design-comparison-2026-10-17/10-quick-add.png) | [Interactive prototype](design/reviewed-2026-10-17/design/prototype.html) |

Phone captures are local review artifacts under ignored `data/`; retain them with
this report when sharing it. No app rebuild or installation was performed for this review.
