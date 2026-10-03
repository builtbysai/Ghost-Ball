# Ghost Ball rebuild roadmap

> **Current scope (October 2):** The only playable camera is top-down 2D. The live perspective exhibition table rotates into this view, with balls gathering into the rack. Aim by dragging the visible shaft behind the cue ball, not by touching the guideline in front. The orientation blocker and live view switcher are removed. Future camera/orientation choices are disabled in Preferences. The old experimental WebGL source and its smoke harness were deleted; future 2.5D will use the user's forthcoming Atelier reference.


Status: 2026-10-02 · v0.6 table materials, staged entrance and tactile power loading. Historical experimental 3D milestones below are superseded; see the current-scope note first.

## Active delivery roadmap

See [validated findings and prioritized exit criteria](FINDINGS-VALIDATION.md). This document retains earlier build history, including superseded experimental milestones. **Active order: P0 gameplay reliability (shipped in #12) → P1.1 off-screen shots and ball-in-hand (shipped in #14; real Android edge-gesture validation pending) → P2 casual referee and seeded CPU planning (shipped in #15; full-rack/device benchmarks and separate tournament mode next) → P3 polish/local progression → P4 online → P5 extra modes and cameras.** Do not treat unchecked historical items below as higher priority than the current phases.

## Product principles

1. One deterministic gameplay simulation shared by every renderer and mode. UI never owns ball positions.
2. No dead controls, fake unlocks, mandatory ads, currency, pay-to-win or unnecessary vertical scroll.
3. First-class touch, keyboard, desktop and accessibility. Stable aim and shot force matter more than effects.
4. Separate simulation, rules, rendering, AI, audio, input, mode state and persistence as the project expands.
5. Top-down 2D must stay fast and legible. Any future camera is a separate planned milestone, not currently selectable.

## Current direction: 8 Ball Pool-style gameplay foundation

For now, prioritize a familiar, touch- and mouse-first landscape playing experience inspired by Miniclip's publicly documented control model and the user-provided reference screenshot. Retain Ghost Ball's own assets and identity. **Do not** expand monetization, social menus, progression systems or unrelated game modes until the core match plays beautifully.

Shipped in v0.4:

- [x] Landscape-first game view with centered horizontal table, compact dual-player HUD and remaining-ball indicators, pull bar left, fine aim and spin on the right, bottom status. No bottom tray obstructing the felt.
- [x] Top-down 2D only in matches. Unreleased elevated/surface camera and orientation choices live in Preferences as disabled placeholders. No rotate-device blocker.
- [x] Pointer-captured drag-to-aim and pure pointer-relative fine aiming wheel, both mouse and touch compatible. Right wheel supports keyboard arrows.
- [x] Pull downward **then release** to shoot by default; min travel, pointercancel protection, shot-state gate, explicit Shoot button and optional release-off preference.
- [x] Tap spin icon for 2-axis contact selection. Side spin uses existing physics, vertical follow/draw is clearly documented as an approximate first pass.
- [x] Move cue ball behind the break line before the first shot. Ball-in-hand drag/invalid-placement preview retained.
- [x] Existing landscape viewport and pointer controls had browser smoke coverage. The new entrance and rear-cue interactions now have unit coverage; physical-device and new visual smoke verification remain release checks.

v0.6 refinements:
- [x] Three differentiated original table finishes: detailed cushions, polished rails, grain/inlay, pocket rims and cloth lighting.
- [x] Cache static board surfaces so per-frame physics and animated ball drawing do not redraw the full room.
- [x] Sharpen and stage the menu-to-match flight, rolling ball gather and final seamless handoff. Preserve the reduced-motion fast path.
- [x] Show a substantial physical cue retreat while pulling, a charged power rail, short tension ticks when enabled and a quick impact stroke.
- [ ] Physical Android testing for cue visibility, pull latency and haptic intensity, and visual review of the recorded responsive screenshot artifacts.

v0.7 responsive HUD and visual roll (October 2):
- [x] One four-column landscape HUD with separated pause control, countdown badges, player cards and responsive numbered ball slots. Unassigned groups display dim preview examples, never falsely claiming ownership.
- [x] Rolling ball orientation tracks physical displacement, with moving stripes, number discs, and cue-ball markers. Snapshots deep-copy orientation; no collision calculation depends on graphics.
- [x] Compact, non-scrolling landscape pause dialog and rebuilt game preferences with working left/right power bar, sound and impact switches. Only the available 2D/landscape options are shown.
- [ ] Verify final composition on actual Android phones, including browser safe areas, very short viewports and sustained frame timing.

Next, in this order:

1. **Control feel benchmark on real phones:** tap/drag thresholds, sensitivity presets, aiming-wheel acceleration, touch occlusion, thumb reach, handedness/power-side switch, proper shot cancel and two-finger protection. Measure input latency before adding extra animations.
2. **Complete shot affordances:** cue-angle control; ball/ghost-ball contact guide accuracy, target trajectory and scratch-risk preview bounded by ability; clearer spin previews, smart shot sound and pocket effects; compare exact timings with personal screenshots/video rather than copying artwork.
3. **Match rules and HUD reliability:** separate official 8-ball rules from Casual. Complete WPA break rules, open table, group assignment, fouls, called 8 pocket, legal game endings and ball-in-hand exceptions. Display pocketed balls and active turn accurately.
4. **Opponent experience:** smarter legal shot planning, sensible rookie/pro tiers, defensive decisions and natural turn pace. Never modify physics in secret to favor opponents.
5. **QA:** full-rack device sessions in multiple orientations; real WebGL/shader validation and fallback; keyboard and assistive-mode checks; replay logs for misfires.

References: `docs/REFERENCE-CONTROLS.md`.

## Phase 0 — Established in this rebuild

- [x] Preserve previous repository on a recovery branch.
- [x] Recreate the furnished Clubhouse v3 design as modular static web app.
- [x] Live animated lobby table with AI exhibition rather than fixed decorative balls.
- [x] Playable practice, casual 8-ball vs CPU and pass-and-play, with rack reset and ball in hand.
- [x] Top-down 2D and projected elevated 2.5D using identical simulation state.
- [x] Fixed-step engine, symmetric collisions, pockets, first-contact events, basic cue spin and audio events.
- [x] Mobile/desktop controls: grab rear cue to aim, precision wheel, power pull, separate shoot and spin.
- [x] Real feature gates; no fake online matchmaking.
- [x] Small meaningful unit suite on simulation and basic AI/mode state.

## Phase 1 — Shot feel and rules fidelity (in progress)

Shipped in v0.2:

- [x] Simplified sliding-to-rolling transition; bounded symmetric ball contact impulses; cushion spin effect; jaw guards, real pocket openings and deterministic fixed-step snapshots. These remain **gameplay-tuned approximations**, not complete scientific ball throw / cushion-nose models.
- [x] Seeded rack and CPU shot selection with reproducible fixtures, rather than `Math.random()` in simulation / opponent decisions. Basic committed shot / placement history exists; complete replay needs explicit initial state and event timestamps.
- [x] Safe, opt-in power release; power adjustment is non-firing by default. Ball-in-hand placement now previews validity and commits on release. In-match settings are accessible.
- [x] Auto-upright pool table on tall phones, matching screen-to-world input in both 2D and projected 2.5D, with round-trip projection tests.
- [x] 26 focused Node tests and isolated Chromium interaction / layout smoke at 320×568, 390×844, 844×390 and 1280×720. These browser runs are **not** physical-device performance or touch-usability certification.

Remaining work:


- [ ] Instrument 120/60/30 fps and sub-30 ms input responsiveness on low-end Android. Add visual comparisons for 320x568, 390x844, landscape phone, tablet and desktop.
- [ ] Measure and tune pocket shelf/jaw positions, sliding friction and rail nose by repeatable real-table video fixtures; model airborne balls, side throw and off-axis spin more faithfully. Add complete event-timed replay/seeded session restore.
- [ ] Split `src/game.js` into independent explicit rulesets with shot event ledger, open-table choice, called-ball/pocket or safety, fouls, spotted 8 on break, illegal breaks and rack end exactly per current WPA rules. Distinguish casual/official clearly.
- [ ] Improve computer opponent with unobstructed ghost-ball routes, defensive play, position planning and tested personalities; avoid manufactured cheating or impossible spin.
- [ ] Run physical-device blind playtesting of release-to-shoot versus explicit release, thumb-side preferences, pointer occlusion, shot cancel, cue placement, aiming-wheel acceleration. Collect gamepad and keyboard findings.
- [ ] Refine cue sound sampling, ball numbering and rotation, correct spin model, cushion audio, hit-stop micro-timing and graded pocket effects. Make haptics contextual.

## Phase 2 — Table presentation and quality

- [ ] Future cameras (2.5D elevated/surface) will be designed from the user's Atelier reference. Old experimental WebGL implementation has been removed to keep v0 focused.
- [ ] Visual timing and responsive QA for the new live-to-rack transition, including real Android and reduced-motion review.
- [ ] Only implement new camera projection/unprojection together with a reviewed interaction model, rather than reviving the removed experiment.
- [ ] Collect the Atelier 2.5D reference and scope separate graphics tests before making camera options interactive.
- [ ] Responsive layout validation on devices with large safe-area insets, foldables, landscape and reduced-motion modes; automated screenshot comparisons.
- [ ] Accessible labels, contrast, keyboard-only e2e, gamepad, screen-reader game status, focus trap/restore for dialogs.
- [ ] Consolidate audio preferences with intentional global mute, separate effects and music when music exists, lifecycle and no autoplay.

## Phase 3 — Skill, social and game depth

- [ ] 9-ball and straight pool **only after** properly tested independent rulesets; one-pocket later.
- [ ] Meaningful Daily Run, trick-shot Workshop, multi-table Circuit and skill-based unlocks tied to mastery rather than grind.
- [ ] Practice tools: target routes, repeat previous setup, bank-shot drills, ghost-ball trainer, shot feedback, recording and replay.
- [ ] Two-player online with authoritative turn validation, efficient snapshot or shot-event sync, reconnection and spectators. Learn from Atelier's recovery and network testing, but don't transport 240-Hz state if shot-event replication suffices.
- [ ] PWA update UX, optional local saves, finite-size replay logs, user-consented analytics of misfires and early quits.

## Release gates

Never ship incomplete modes as functional buttons. Before merge: JavaScript syntax, Node tests, viewport-fit browser smoke, simulated-rack continuity, and no JavaScript errors. Physical Android feel and new transition visuals remain manual review items.
