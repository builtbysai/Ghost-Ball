# Ghost Ball — Clubhouse rebuild

An independent, lightweight browser pool game. The Clubhouse rebuild follows the supplied **Clubhouse v3** direction and has a live exhibition playing on the lobby table rather than static decoration.

**Status:** P2.1 deterministic full-rack reliability and fair opponent-planning pass. Top-down 2D is the only playable view; the live lobby table rotates and its balls assemble into the match rack. Full WPA tournament rules, other cameras and online play are still planned.

## Available now

- Responsive Clubhouse inspired by the provided mockup: five playable tables, working room controls, live AI exhibition, Watch, playable Quick Match vs Rookie or Club Pro, local pass-and-play, and free Practice.
- One active gameplay camera: top-down 2D. The live perspective lobby exhibition becomes that same physical table in a seamless rotation/zoom/rack-assembly transition. The layout works in both device orientations without blocking play.
- Fixed-step simulation (240 Hz) with independent ball positions, bounded equal-and-opposite collision impulses, a simplified sliding-to-rolling transition, pocket mouths and jaw guards, side spin, approximate follow/draw, event-based audio and impact rings.
- Landscape-first match screen with two-player HUD, remaining-ball markers, full-length cue and collision guideline. Grab and rotate the **shaft behind the cue ball**, not the guide in front; use the separate fine-aim wheel, two-axis spin and safe pull-down power bar. Ball-in-hand offers a visible ghost cue ball, tap/confirm or drag placement and keyboard nudging.
- Explicit seeds for reproducible rack / opponent test cases, deep-copied simulation snapshots, separated casual rulings and append-only shot / placement / ruling history. Full cinematic replay has not shipped.
- **Casual** 8-ball rules (no called shots) with explainable fouls, snapshotted pre-shot group ownership and protected 8-ball outcomes. Rookie uses geometric selection; Club Pro evaluates a bounded set of full-physics predictions. Tournament rules and unfinished modes remain disabled.
- Distinctive walnut/sage, smoked oak/blue, dark ash/olive, pale oak/jade and black lacquer/mulberry tables with detailed six-pocket rendering, rail sights, cushion seams, subtly textured cloth and cached static surfaces.
- Camera-lift entrance with a crisp high-resolution board, curved live-ball gathering and moving spotlight; reduced-motion bypass remains available.
- Highly visible cue recoil during power pull, tension stages and optional brief vibration ticks. The spring-loaded control and power-aware layered contact audio provide shot feedback without screen shake.
- Reduced-motion-aware table entrance, sound and tactile preferences, viewport-fit mobile and landscape layouts. Elevated/surface cameras and orientation selection are visible but disabled as coming soon.

## Development

Requires a static web server; bare `file:` URLs block ES modules in some browsers.

```sh
npm test
npm run serve
# http://localhost:8124/
```

No dependencies or build step. Code is grouped by responsibility:

- `src/physics.js`: fixed-step simulation, snapshots and event stream, no browser APIs.
- `src/random.js`: small seeded PRNG shared by repeatable racks and CPU shot selection.
- `src/game.js`: match ownership, 45-second casual shot clock, rulings and replayable event metadata.
- `src/casual-rules.js`: browser-free casual referee; a separate tournament referee is a future milestone.
- `src/ai.js`: seedable geometric Rookie and bounded full-physics predictive Club Pro.
- `src/render.js`: overhead/pitched 2D table, cached surfaces, aiming and cue animation.
- `src/table-finishes.js`: shared table construction plus hall-specific materials (visual only; physics unchanged).
- `src/cue-feel.js`: pure cue travel, contact stroke timing and tactile stage math.
- `src/audio.js`: gesture-unlocked physical impact and restrained result sounds.
- `src/player-progress.js`: versioned offline match, room choice, equipment and favorites ledger.
- `src/skill-drills.js` and `src/skill-drills.css`: three fixed-layout original physics-scored pocketing challenges and compact keyboard/touch picker.
- `src/record-summary.js` and `src/local-record.css`: compact private stats and recent results, JSON export and guarded local-only reset via Preferences.
- `src/cue-catalog.js`: six original purely cosmetic cues, exact milestone unlocks and shared preview appearance.
- `src/cue-locker.css`: viewport-fitted 3×2 equipment browsing in landscape and portrait.
- `src/main.js`: app wiring, responsive controls, lifecycle.
- `src/touch-controls.js`: tested rear-shaft hit testing, pointer pull, wheel aim and spin-contact math.
- `src/table-transition.js`: live-to-play table motion and deterministic rack assembly.
- `src/landscape.css`: isolated pool gameplay layout.
- `src/feel.css`: responsive, motion-aware power rail feedback.
- `src/style.css`: viewport-contained presentation; design tokens.

See the [active roadmap](docs/ROADMAP.md), [measured full-rack reliability results](docs/P2-1-RELIABILITY-LAB.md), [pool-game engagement research](docs/ENGAGEMENT-RESEARCH.md), [P2 rules architecture](docs/P2-RULES-ARCHITECTURE.md) and [physics/visual research](docs/RESEARCH.md). Focused Node regression tests cover input geometry, cue loading and collision physics; Playwright browser smoke checks the live entrance, all five hall palettes, and responsive mouse/touch input. Do not bolt future game modes into `main.js`: extract state machines and provide explicit tests.

## P3: Physical impact and match finish polish

Real ball contacts and solid cushion rebounds now create brief, capped visual impact glints without changing physics. Completed casual matches display the actual referee-recorded decisive shot, never an invented eight-ball pot. A legally pocketed eight receives a subtle warm light at its real destination; Rematch receives keyboard focus, and Change Table returns to the Clubhouse. Reduced-motion preferences remain respected. A complete replay recorder is still on the roadmap.

## P2.1 progress and device limits

Full-rack tests now include 12 repeatable CPU matches, reversed seats,
legal 8-ball completions and exact replay/history comparisons. Club Pro plans
in bounded batches across animation frames and keeps its cue visible while
aiming. Those are automated, non-rendered results; physical Android control
comfort, screen-edge gestures and real phone frame timing are still open.

## Earned equipment and upcoming room mastery

The October 2 research pass moved **original cue choices/unlocks** and **two genuinely new room designs** earlier in the development order, following complete-match/real-device verification and shot feel. All five rooms are playable. The real **Cue Locker** has two starter cues and four original permanently unlockable cosmetics, automatically earned from adjudicated casual match milestones. Preview, favorite and equip them; the visible shaft/tip/wrap changes in the lobby and during shots without altering shot physics. Persistent local favorites and selected cue require available browser storage. **Authored challenges and room locks are not shipped yet.** See [research notes](docs/ENGAGEMENT-RESEARCH.md) and the [reordered roadmap](docs/ROADMAP.md).

## Playable skill challenges

Open **Menu → Skill Drills** for *Center Drop*, *Corner Line* and *Rail Return*. All three use the same real shot physics and rear-cue controls as a casual match. Sink the named target into its designated pocket within **two shots without scratching**. Rail Return additionally requires a genuine non-jaw target-ball cushion rebound before the top-middle pot; the score comes from settled physics events, not the ball's final position or a button click. Real completions earn permanent local marks and personal bests. Existing halls remain selectable; positional drills and room mastery locks await real-device review.

## Earned founder-room mastery

The Parlor, Observatory and Foundry now offer three **real** permanent local mastery steps each: complete that room's authored physics-scored drill, finish a genuine CPU match in the room, and win a legal eight-ball game against either rival there. The room selector shows current status and the next missing step. Existing local v1 match and drill records count immediately; new durable receipts persist even after old recent-match entries age out. Wintergarden and Afterhours are still playable but have no falsely advertised mastery until their distinct challenges are built. No hall or cue is locked by mastery yet.

## Your local record

Open **Menu → Settings → Local Record** to see your completed-match totals and recent verified results. **Export your record** saves a private JSON file to your device. **Reset local record** requires confirmation and removes match/cue unlock progress, favorites and chosen room from this browser, but keeps audio and control preferences. Data never leaves the browser unless you explicitly export it; no account synchronization is offered. If saved progress is unreadable or from a newer version, Ghost Ball will not overwrite or delete it automatically.

## Recovery

The previous main is preserved on GitHub as `archive/pre-clubhouse-rebuild-2026-10-01`. The rebuild is intentionally a new tree, not modifications to the previous engine. On GitHub Pages use relative asset paths so `/Ghost-Ball/` loads correctly. Avoid caching stale scripts until a versioned service-worker update flow is implemented.

## Current view policy

Gameplay ships only with the 2D top-down renderer. The lobby retains a lightweight live perspective 2D scene so it can rotate/morph into the playing table. Old WebGL experiments and invalid smoke checks were removed; any future 2.5D implementation will be designed against the Atelier Air Hockey reference supplied later. The current preferences show future choices as disabled, not simulated features.

## v0.6 input and presentation validation

Gameplay uses separate coarse shaft dragging and fine aim. Node tests cover rear-only cue acquisition, shot-power safety, physics and animated rack positions. The optional browser smoke checks cover portrait and landscape fit and core shot interactions, but physical Android touch and visual timing still require device review. The orientation blocker and legacy view switcher are no longer part of the interface.

See [interaction research and copy boundaries](docs/REFERENCE-CONTROLS.md). Keep the **original** Ghost Ball identity. Similarity is about discoverable mechanics and touch ergonomics, not copying Miniclip's protected graphics, avatars, icons or monetization.
