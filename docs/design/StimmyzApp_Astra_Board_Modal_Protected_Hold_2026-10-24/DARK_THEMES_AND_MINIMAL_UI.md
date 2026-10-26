# Design guidance — minimalist surfaces and four dark themes

## Screen hierarchy

**Board:** approved transparent logo + app overflow, `Soundboard` section title, board selector/edit button, search, colorful pad grid and contextual pagination/scroll controls. Keep it unchanged except menu shortcut removal and pad color policy.

**Editor:** logo + overflow then device-audio hero card; do not show the previously duplicated `Make a sound` title or subtitle. Keep one prominent **Record device audio** CTA and secondary voice/file controls. Contextual headings inside capture/trim/details are fine.

**Library:** logo + overflow then search/sort, count and clip rows. No page heading, intro paragraph or recording/add buttons. Users create via Board Quick Add or Editor. Library ⋮ actions remain.

**Appearance ownership:** exclusively global Settings → Appearance; no `Appearance` or `Choose theme` in the Board selector, app overflow or clip menus.

## Palette specifications

The prototype's actual CSS is the exact visual reference. Themes and key colors:

| Theme | Surface style | Background | Card | Accent |
| --- | --- | --- | --- | --- |
| Vanilla | light warm cream | `#FFF8EC` | `#FFFDFA` | `#8B5CF6` |
| Peach | light blush | `#FFEAE6` | `#FFF6F2` | `#A855F7` |
| Mint | light sage | `#EAFBF0` | `#F6FFFA` | `#8B5CF6` |
| Snow | nearly white | `#F8FAFC` | `#FFFFFF` | `#8B5CF6` |
| Ice | cool light blue | `#E7F4FF` | `#F7FBFF` | `#8B5CF6` |
| Chocolate | deep cocoa, formerly Coffee | `#1F1B18` | `#302620` | `#C084FC` |
| Grape | dark aubergine | `#21182A` | `#302239` | `#D29BFF` |
| Nut | warm walnut / hazelnut | `#25201C` | `#372C25` | `#E0A971` |
| Blackberry | midnight berry-charcoal | `#151824` | `#242638` | `#B6A2FF` |

Legacy preference migration: `Coffee` → **Chocolate**. Do not reset unrelated per-board or per-sound state. The original stored Coffee color values are retained under the new display name.

Theme application should not recolor existing sound pad identity. The logo remains the supplied mint asset across all themes. Check text contrast, navigation bar, soft-button states, input borders, dividers, overlays, safe-area insets and TalkBack focus.

## Screenshot references

`previews/00-latest-overview.png` is constructed from actual browser captures. Individual mobile screenshots are available for Vanilla, Chocolate, Grape, Nut, Blackberry, Editor and Library. `references/user-requested-ui-cleanup.png` indicates the removed elements, while `references/approved-three-screen-concept.png` is marketing inspiration only.
