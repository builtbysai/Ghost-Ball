# Ghost Ball — Clubhouse rebuild

An independent, lightweight browser pool game. The Clubhouse rebuild follows the supplied **Clubhouse v3** direction and has a live exhibition playing on the lobby table rather than static decoration.

**Status:** P2 casual referee and opponent-planning pass. Top-down 2D is the only playable view; the live lobby table rotates and its balls assemble into the match rack. Full WPA tournament rules, other cameras and online play are still planned.

## Available now

- Responsive Clubhouse inspired by the provided mockup: three tables, working room controls, live AI exhibition, Watch, playable Quick Match vs Rookie or Club Pro, local pass-and-play, and free Practice.
- One active gameplay camera: top-down 2D. The live perspective lobby exhibition becomes that same physical table in a seamless rotation/zoom/rack-assembly transition. The layout works in both device orientations without blocking play.
- Fixed-step simulation (240 Hz) with independent ball positions, bounded equal-and-opposite collision impulses, a simplified sliding-to-rolling transition, pocket mouths and jaw guards, side spin, approximate follow/draw, event-based audio and impact rings.
- Landscape-first match screen with two-player HUD, remaining-ball markers, full-length cue and collision guideline. Grab and rotate the **shaft behind the cue ball**, not the guide in front; use the separate fine-aim wheel, two-axis spin and safe pull-down power bar. Ball-in-hand offers a visible ghost cue ball, tap/confirm or drag placement and keyboard nudging.
- Explicit seeds for reproducible rack / opponent test cases, deep-copied simulation snapshots, separated casual rulings and append-only shot / placement / ruling history. Full cinematic replay has not shipped.
- **Casual** 8-ball rules (no called shots) with explainable fouls, snapshotted pre-shot group ownership and protected 8-ball outcomes. Rookie uses geometric selection; Club Pro evaluates a bounded set of full-physics predictions. Tournament rules and unfinished modes remain disabled.
- Distinctive walnut/sage, smoked oak/blue and dark ash/olive tables with detailed six-pocket rendering, rail sights, cushion seams, subtly textured cloth and cached static surfaces.
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
- `src/audio.js`: gesture-unlocked synthesized sounds.
- `src/main.js`: app wiring, responsive controls, lifecycle.
- `src/touch-controls.js`: tested rear-shaft hit testing, pointer pull, wheel aim and spin-contact math.
- `src/table-transition.js`: live-to-play table motion and deterministic rack assembly.
- `src/landscape.css`: isolated pool gameplay layout.
- `src/feel.css`: responsive, motion-aware power rail feedback.
- `src/style.css`: viewport-contained presentation; design tokens.

See [roadmap](docs/ROADMAP.md), [P2 rules architecture](docs/P2-RULES-ARCHITECTURE.md) and [research](docs/RESEARCH.md). Focused Node regression tests cover input geometry, cue loading and collision physics; Playwright browser smoke checks the live entrance, all three hall palettes, and responsive mouse/touch input. Do not bolt future game modes into `main.js`: extract state machines and provide explicit tests.

## Recovery

The previous main is preserved on GitHub as `archive/pre-clubhouse-rebuild-2026-10-01`. The rebuild is intentionally a new tree, not modifications to the previous engine. On GitHub Pages use relative asset paths so `/Ghost-Ball/` loads correctly. Avoid caching stale scripts until a versioned service-worker update flow is implemented.

## Current view policy

Gameplay ships only with the 2D top-down renderer. The lobby retains a lightweight live perspective 2D scene so it can rotate/morph into the playing table. Old WebGL experiments and invalid smoke checks were removed; any future 2.5D implementation will be designed against the Atelier Air Hockey reference supplied later. The current preferences show future choices as disabled, not simulated features.

## v0.6 input and presentation validation

Gameplay uses separate coarse shaft dragging and fine aim. Node tests cover rear-only cue acquisition, shot-power safety, physics and animated rack positions. The optional browser smoke checks cover portrait and landscape fit and core shot interactions, but physical Android touch and visual timing still require device review. The orientation blocker and legacy view switcher are no longer part of the interface.

See [interaction research and copy boundaries](docs/REFERENCE-CONTROLS.md). Keep the **original** Ghost Ball identity. Similarity is about discoverable mechanics and touch ergonomics, not copying Miniclip's protected graphics, avatars, icons or monetization.
