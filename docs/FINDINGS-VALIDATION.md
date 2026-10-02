# Ghost Ball: findings validation and execution plan
_Reviewed 2026-10-02 against main tree `a269d1824db690e63ff8f7cda0c2e5e07a980298`. The initial implementation was merged to `main` in [PR #12](https://github.com/builtbysai/Ghost-Ball/pull/12)._

## Evidence quality
The supplied audit contains a claimed 101-shot browser match. That observation and its numerical details are **reported**, not independently reproduced in this code review. Source-level defects below were checked directly against the matching commit. PR #12 passed JavaScript syntax, unit, responsive browser screenshot and HTTP-module checks before merging; the subsequent main checks and Pages build also succeeded. Physical Android testing and a completion-screen device review remain release gates.

## Confirmed source defects
| Priority | Finding | Evidence at reviewed commit | Implementation on this branch |
| --- | --- | --- | --- |
| P0 | Shot clock was purely decorative | `src/main.js:updateClocks` floors a UI-only number at zero; `Game` had no time rule | Enforced inside `Game.update` with timed-out turn foul, recorded event, ball in hand and focused tests |
| P0 | Practice HUD shows a phantom rival | `turnUI` renders the generic opponent card for every mode | Hide rival and irrelevant groups; display shots and pocketed count |
| P0 | Browser favicon / app icon missing | No icon files and `manifest.webmanifest` lacks `icons` | Original SVG/favicon and PNG 192 fallback referenced by manifest |
| P0 | Completion header can truncate, no direct rematch | Responsive HUD uses text ellipsis; completion guide requires pause | Short 'FINISHED' title and compact completion sheet with replay/menu buttons |
| P0 | Audio lifecycle lacks suspend on tab hide | `Audio` had unlock but no suspend/resume cleanup | Explicit pagehide/visibility suspend and safe resume |
| P1 | Aim assist offers no calculated object path | `drawAim` extrapolated a small canvas-space line rather than ball contact geometry | Pure first-contact geometric projection with cushion/obstruction limits and tests |
| P1 | Spin cannot be seen on the actual cue ball | Only spin sheet and preview icon show selected strike point | Render contact mark over cue ball during aiming |
| P1 | Pull gesture not taught on first break | No onboarding overlay in match entry | One-time nonblocking first-break hint |

## Corrections to the supplied audit
- Existing pocket effects are **not absent**: `animatePocket` already animates a collected ball over 600 ms, and `Game.fx` emits a canvas ring. Improve the *in-pocket shrink, sound and tactile response*, not replace working effects.
- Ball rotation, surface shading, cushion sights, touch capture and recoil already exist. Treat extra trails, chalk, decorative lighting and stronger haptics as device-measured refinements rather than proven defects.
- The supplied report's full-rack/browser/101-shot success is its own observation, not a guarantee about every device or game state.
- Physics includes deterministic fixed-step approximations, not full physical squirt/throw or referee-grade tournament logic. Keep 'casual 8-ball' truthful.
- No online networking, persistent stats or extra cameras are present. These are scope gaps, not regressions.
- Additional table-specific cloth-speed changes would affect balance, tutorials, replay and multiplayer parity. Defer until the baseline is stable.

## Roadmap (dependency ordered)

### P0: Reliability + shortest playable loop (current branch)
- [x] Timeouts transfer turn as a casual-mode foul with ball in hand, with tests for stationary/play/placement.
- [x] Remove solo-play phantom opponent and misleading group slots.
- [x] Provide favicon and manifest icon references (SVG + 192px PNG; assess 512px PNG on device).
- [x] Make result header fit and provide direct rematch and quit.
- [x] Suspend audio on tab hide; resume only an already-started enabled context.
- [x] Add calculated first-contact guidance, visual spin strike-point cue, first-break help.
- [x] Pass PR syntax, unit and responsive browser checks; inspect the generated screenshot set (1280×720, 844×390, 568×320, and 390×844).
- [ ] Verify on physical Android in landscape and in physically portrait orientation using the rotated landscape UI.

**Exit:** Entire match can begin, pause, time out, foul, finish, rematch and quit, all through touch and mouse, without dead controls or clipping.

### P1: Input/feel benchmark + shot readability
_Incremental browser-facing control pass in `dev/p1-control-feel-placement-feedback`: code landed on a branch; acceptance depends on PR checks and visual review._
- [x] Cancel pointer-captured power gestures released outside the rail; retain inward recovery and keyboard shooting.
- [x] Add a forgiving, bounded **visible** nearby legal snap while retaining exact legal tap placement and the break head-zone restriction. Do not teleport illegal drops.
- [x] Suppress cue aiming while ball-in-hand, block human placement during AI's turn, and give the AI deterministic fallback spots.
- [x] Double-tap the fine aim wheel (or press Home/Backspace with the wheel focused) to recall the current player's previous shot direction.
- [x] Add structured foul/turn feedback with restrained audio and a short in-pocket visual gulp. Respect mute and reduced-motion preferences.
- [ ] Verify real pointer safety, placement previews, UI responsiveness and timing using new CI browser fixtures and exported screenshots.
- [ ] Benchmark touch on real Android hardware, especially short landscape height, physically portrait rotation and haptic intensity.

- Instrument shot pull, aim wheel, rear-shaft pointer capture, pointercancel, handedness, haptics, and touch occlusion on short and wide phones. Test low frame-rate.
- Use repeatable scenarios for straight/cut shots, spin, scratches and ball-in-hand. Keep aim assist short and honest: first contact only, not guaranteed cue/object trajectories.
- Add legal placement preview zones and optional aim recenter; don't clutter the HUD. Improve in-pocket ball disappearance and subtly reinforce turns/fouls.
- Prioritize visual test artifacts and real-device play over decorative effects.

**Exit:** A player can aim and power shots consistently without accidental firing and can understand why a shot travelled as it did.

### P2: Rules and opponent confidence
- Keep casual rules as default. Implement an *explicit* tournament ruleset instead of silently changing casual matches: open-table assignment, break legality, called 8 pocket, scratches, illegal contacts and ending conditions.
- Break rule state into a rules module. Test every finish path and ball-in-hand permission. Verify pass-and-play prompts for a single shared phone.
- Profile AI shot legality and shot selection with seeded tables. Differentiate Rookie and Club Pro through shot planning, not hidden physics.

**Exit:** Rules, visible turn ownership and the AI agree across full-rack simulations and edge-case fixtures.

### P3: Polished club identity
- Turn/foul event presentation, calmer exhibition discoverability, finished room lighting and carefully measured shot/pocket audio, with reduced-motion and muted equivalents.
- Local-first match ledger: record/win-loss, longest run, fastest clear and optional member identity, with versioned persistence and reset/privacy controls.
- Circuit and drills may use this ledger, but cannot ship as fake disabled navigation.

### P4: Online multiplayer architecture
- Design authoritative shot/event sync around deterministic fixed-step simulation, including authoritative shot clocks, input validation, lag compensation, reconnect and resync.
- Evaluate reusing Atelier's direct WebRTC with TURN fallback, but don't transplant its continuous high-frequency air-hockey protocol unchanged into a turn-based pool game.
- Implement private-room two-player matches first, then matchmaking, spectators, replay and safe host migration. Test desync, timeout and resumed sessions.

### P5: Additional content and cameras
- 9-ball after reusable rule state, then straight pool and drills. Add cue locker/rewards after reliable local stats.
- Keep top-down 2D as the only selectable match camera until the user's Atelier 2.5D reference and performance review. Masse/jump and cloth variations are optional later projects.

## Engineering guardrails
- Simulation/rule state is authoritative; never tie outcome or shot clocks to rendering cadence or CSS.
- Fixed-step deterministic physics must remain unchanged by guides, audio, effects or networking.
- Keep assets original and controls familiar; do not copy third-party artwork or branding.
- A PR requires green CI, manual short-viewport screenshots and a full match exercise. Code review alone does not count as browser validation.
