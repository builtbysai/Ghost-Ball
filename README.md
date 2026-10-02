# Ghost Ball — Clubhouse rebuild

An independent, lightweight browser pool game. The Clubhouse rebuild follows the supplied **Clubhouse v3** direction and has a live exhibition playing on the lobby table rather than static decoration.

**Status:** v0.2 shot-feel pass. Playable, but **not** a complete simulation of official WPA rules, a WebGL renderer, or online multiplayer. The elevated table remains **2.5D canvas perspective**; true 3D is a future milestone. The current coefficients are gameplay-tuned starting values, not experimentally calibrated tournament specifications.

## Available now

- Responsive Clubhouse inspired by the provided mockup: three tables, working room controls, live AI exhibition, Watch, playable Quick Match vs Rookie or Club Pro, local pass-and-play, and free Practice.
- Two views using the **same simulation**: top-down 2D and elevated 2.5D. On tall phones, the game table stands upright to increase playable area; both renderers support reversible input projection.
- Fixed-step simulation (240 Hz) with independent ball positions, bounded equal-and-opposite collision impulses, a simplified sliding-to-rolling transition, pocket mouths and jaw guards, side spin, event-based audio and impact rings.
- On-screen aim, fine aim, spin, power and explicit Take Shot. Releasing power to shoot is opt-in under in-game Preferences, so normal slider adjustment never fires accidentally. Drag then release to confirm ball-in-hand placement, with an invalid-placement preview.
- Explicit seeds for reproducible rack / opponent test cases, independent deep-copied simulation snapshots and a minimal committed shot / cue-placement history. Full cinematic replay has not shipped.
- Arcade 8-ball rules (no called shots). Deliberately disabled unfinished modes; no cosmetic matchmaking or fictional unlocks.
- Reduced-motion preference support, audio controls, viewport-fit mobile and landscape layouts.

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
- `src/game.js`: match ownership, transitions, basic geometric AI.
- `src/render.js`: common table renderer with 2D and 2.5D projections.
- `src/audio.js`: gesture-unlocked synthesized sounds.
- `src/main.js`: app wiring, responsive controls, lifecycle.
- `src/style.css`: viewport-contained presentation; design tokens.

See [roadmap](docs/ROADMAP.md) and [research](docs/RESEARCH.md). The 26 Node regression tests cover physical invariants, repeated break settlement, pocket mouths / jaws, seed repeatability and 2D / 2.5D projection inverses. Do not bolt future game modes into `main.js`: extract state machines and provide explicit tests.

## Recovery

The previous main is preserved on GitHub as `archive/pre-clubhouse-rebuild-2026-10-01`. The rebuild is intentionally a new tree, not modifications to the previous engine. On GitHub Pages use relative asset paths so `/Ghost-Ball/` loads correctly. Avoid caching stale scripts until a versioned service-worker update flow is implemented.
