# Landscape gameplay interaction reference

The user's screenshot establishes spatial priorities: horizontal table dominates landscape, power pull is left, small cue/spin affordances sit right, status and player racks stay away from the felt. We reproduce the **interaction principles** using original Ghost Ball visuals and code, not proprietary artwork or exact visual assets.

## First-party research

- Miniclip, [Basic Controls: Improving Your Skills](https://support.miniclip.com/hc/en-us/articles/35451942766865-Basic-Controls-Improving-your-skills-8-Ball-Pool): mobile cue drag or fine aim wheel; downward power pull; web click-drag and release; optional spin.
- Miniclip, [How to Aim with the Cue](https://support.miniclip.com/hc/en-us/articles/203747546-How-to-Aim-with-the-Cue-8-Ball-Pool): left power, right wheel and on-device adaptations.
- Miniclip, [How to Move the Cue Ball](https://support.miniclip.com/hc/en-us/articles/203747476-How-to-Move-the-Cue-Ball-8-Ball-Pool): cue drag at break line or after opponent foul.
- Miniclip, [Advanced Plays: Spins](https://support.miniclip.com/hc/en-us/articles/35451960569361-Advanced-Plays-Spins-8-Ball-Pool): off-center cue contact and optional top, bottom and side spin.
- Miniclip, [Settings Guideline](https://support.miniclip.com/hc/en-us/articles/6630561650833--Settings-Guideline): custom sensitivity, wheel presence, left/right or vertical/horizontal power-bar layout. We have **not** yet implemented the complete range of settings.

## Implemented choices and known gaps

| Interaction | Ghost Ball v0.4 | Remaining |
|---|---|---|
| Table gesture | Absolute aim by drag over felt; same pointer events on mouse/touch | Occlusion tests and configurable drag sensitivity |
| Fine aim wheel | Incremental vertical drag and keyboard arrows | Acceleration and haptic ticks |
| Power | Pull down from handle; travel threshold and pointer capture; release by default | Power-side toggle; portrait usability |
| Spin | Circular 2-axis selection, center reset | Realistic rolling and spin transfer calibration |
| Cue ball placement | Drag after foul; pre-break head-only move | Tournament-specific break area rules |
| Views | Default flat 2D, optional elevated and WebGL2 | Hardware WebGL certification |
| HUD | Compact two-player labels and pocketed-ball marker slots | Complete rules-driven group display |

Visual QA is required beyond functional tests. Do not reproduce Miniclip's avatars, currency systems, branded menus, icon art, textures or screenshots as shipping assets.
