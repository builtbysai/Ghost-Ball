# Ghost Ball — Clubhouse rebuild

An independent, lightweight browser pool game. This fresh v0.1 starts from the supplied **Clubhouse v3** direction and features an actual animated billiards exhibition on the lobby table rather than static decoration.

**Status:** Playable first foundation, **not** a complete simulation of official WPA rules, a WebGL renderer, or online multiplayer. The currently implemented elevated table is **2.5D canvas perspective**; true 3D is an explicit future milestone.

## Available now

- Responsive Clubhouse inspired by the provided mockup: three tables, working room controls, live AI exhibition, Watch, playable Quick Match vs Rookie or Club Pro, local pass-and-play, and free Practice.
- Two views using the **same simulation**: top-down 2D and elevated 2.5D. Screen-to-table inverse mapping makes touch aiming work in both.
- Fixed-step simulation (240 Hz) with independent ball positions and symmetric collisions, pockets, restitution, rudimentary spin, rolling drag, event-based audio and impact rings.
- On-screen aim, fine aim, spin, power pull/release or Take Shot, scratch/ball-in-hand placement, keyboard and pointer controls.
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

- `src/physics.js`: fixed-step simulation and event stream, no browser APIs.
- `src/game.js`: match ownership, transitions, basic geometric AI.
- `src/render.js`: common table renderer with 2D and 2.5D projections.
- `src/audio.js`: gesture-unlocked synthesized sounds.
- `src/main.js`: app wiring, responsive controls, lifecycle.
- `src/style.css`: viewport-contained presentation; design tokens.

See [roadmap](docs/ROADMAP.md) and [research](docs/RESEARCH.md). Do not bolt future game modes into `main.js`: extract state machines and provide explicit tests.

## Recovery

The previous main is preserved on GitHub as `archive/pre-clubhouse-rebuild-2026-10-01`. The rebuild is intentionally a new tree, not modifications to the previous engine. On GitHub Pages use relative asset paths so `/Ghost-Ball/` loads correctly. Avoid caching stale scripts until a versioned service-worker update flow is implemented.
