# Ghost Ball rebuild roadmap

Status: 2026-10-01 · v0.1 Clubhouse vertical slice. This document describes current implementation versus planned work; it is not a promise that future features already exist.

## Product principles

1. One deterministic gameplay simulation shared by every renderer and mode. UI never owns ball positions.
2. No dead controls, fake unlocks, mandatory ads, currency, pay-to-win or unnecessary vertical scroll.
3. First-class touch, keyboard, desktop and accessibility. Stable aim and shot force matter more than effects.
4. Separate simulation, rules, rendering, AI, audio, input, mode state and persistence as the project expands.
5. 2D must stay fast and legible; elevated perspective optional; true 3D should implement the same view and input contract.

## Phase 0 — Established in this rebuild

- [x] Preserve previous repository on a recovery branch.
- [x] Recreate the furnished Clubhouse v3 design as modular static web app.
- [x] Live animated lobby table with AI exhibition rather than fixed decorative balls.
- [x] Playable practice, casual 8-ball vs CPU and pass-and-play, with rack reset and ball in hand.
- [x] Top-down 2D and projected elevated 2.5D using identical simulation state.
- [x] Fixed-step engine, symmetric collisions, pockets, first-contact events, basic cue spin and audio events.
- [x] Mobile/desktop controls: direct aim, precision, power pull, separate shoot and spin.
- [x] Real feature gates; no fake online matchmaking.
- [x] Small meaningful unit suite on simulation and basic AI/mode state.

## Phase 1 — Shot feel and rules fidelity (next)

- [ ] Instrument 120/60/30 fps and sub-30 ms input responsiveness on low-end Android. Add visual comparisons for 320x568, 390x844, landscape phone, tablet and desktop.
- [ ] Replace simplified friction/rail/pocket circles with real jaw geometry, rail nose, ball throw, sliding-to-rolling transition and measured tuning fixtures. Add deterministic replay/seed control; avoid `Math.random()` in simulation and AI decisions.
- [ ] Split `src/game.js` into independent explicit rulesets with shot event ledger, open-table choice, called-ball/pocket or safety, fouls, spotted 8 on break, illegal breaks and rack end exactly per current WPA rules. Distinguish casual/official clearly.
- [ ] Improve computer opponent with unobstructed ghost-ball routes, defensive play, position planning and tested personalities; avoid manufactured cheating or impossible spin.
- [ ] Run real-device blind playtesting of pull-to-shoot versus explicit release, thumb-side preferences, pointer occlusion, shot cancel, cue placement, aiming-wheel acceleration.
- [ ] Refine cue sound sampling, ball numbering and rotation, correct spin model, cushion audio, hit-stop micro-timing and graded pocket effects. Make haptics contextual.

## Phase 2 — Table presentation and quality

- [ ] True WebGL 3D renderer (prefer lazily loaded Three.js) that uses *exactly the same* `Simulation` world, with pre-rendered textures, shadows, camera presets, context-loss fallback and GPU budget.
- [ ] Proper camera unprojection for true 3D ray-to-table input and overhead quick-toggle; side-by-side collision parity tests.
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

Never ship incomplete modes as functional buttons. Before merge: Node tests, real browser smoke test, portrait and landscape viewport overflow review, mobile touch test, 2D/2.5D shot parity, reduced-motion, proper Pages asset base, no browser console errors and manually observed complete rack and scratch flows. Production publish only after the branch meets those gates.
