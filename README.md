# Ghost Ball — Clubhouse rebuild

An independent, lightweight browser pool game. The Clubhouse rebuild follows the supplied **Clubhouse v3** direction and has a live exhibition playing on the lobby table rather than static decoration.

**Status:** v0.3 optional 3D presentation pass. Playable, but **not** a complete simulation of official WPA rules or online multiplayer. **True WebGL2 3D is opt-in** and requires a capable browser; 2D and 2.5D remain supported and are the automatic fallback. The current coefficients are gameplay-tuned starting values, not experimentally calibrated tournament specifications.

## Available now

- Responsive Clubhouse inspired by the provided mockup: three tables, working room controls, live AI exhibition, Watch, playable Quick Match vs Rookie or Club Pro, local pass-and-play, and free Practice.
- Three views using the **same simulation**: top-down 2D, elevated 2.5D, and on-demand WebGL2 3D. On tall phones, the game table stands upright to increase playable area; both renderers support reversible input projection.
- Fixed-step simulation (240 Hz) with independent ball positions, bounded equal-and-opposite collision impulses, a simplified sliding-to-rolling transition, pocket mouths and jaw guards, side spin, event-based audio and impact rings.
- On-screen aim, fine aim, spin, power and explicit Take Shot. Releasing power to shoot is opt-in under in-game Preferences, so normal slider adjustment never fires accidentally. Drag then release to confirm ball-in-hand placement, with an invalid-placement preview.
- Explicit seeds for reproducible rack / opponent test cases, independent deep-copied simulation snapshots and a minimal committed shot / cue-placement history. Full cinematic replay has not shipped.
- Arcade 8-ball rules (no called shots). Deliberately disabled unfinished modes; no cosmetic matchmaking or fictional unlocks.
- Reduced-motion preference support, audio controls, viewport-fit mobile and landscape layouts. True 3D loads only when chosen, caps pixel resolution, retains screen-space aiming guidance, and switches to 2.5D when the WebGL context is unavailable or lost.

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
- `src/render.js`: shared 2D and 2.5D canvas rendering, plus the guide overlay for 3D.
- `src/camera3d.js`: DOM-free 3D camera, portrait placement and exact ray-to-felt unprojection.
- `src/render3d.js`: optional dependency-free WebGL2 meshes, material shaders and per-ball textures. No second physics engine.
- `src/audio.js`: gesture-unlocked synthesized sounds.
- `src/main.js`: app wiring, responsive controls, lifecycle.
- `src/style.css`: viewport-contained presentation; design tokens.

See [roadmap](docs/ROADMAP.md) and [research](docs/RESEARCH.md). The 32 Node regression tests cover camera/GPU projection agreement, physical invariants, repeated break settlement, pocket mouths / jaws, seed repeatability and 2D / 2.5D projection inverses. Do not bolt future game modes into `main.js`: extract state machines and provide explicit tests.

## Recovery

The previous main is preserved on GitHub as `archive/pre-clubhouse-rebuild-2026-10-01`. The rebuild is intentionally a new tree, not modifications to the previous engine. On GitHub Pages use relative asset paths so `/Ghost-Ball/` loads correctly. Avoid caching stale scripts until a versioned service-worker update flow is implemented.

## v0.3 graphics validation

The 3D renderer uses geometric balls, a dimensional rail/apron/leg assembly, numbered ball textures and per-fragment lighting. A thin transparent 2D canvas stays above it for legible aiming and touch capture. Only gameplay enables WebGL; the lobby retains its lightweight animated 2.5D exhibition.

CI covers deterministic camera coordinate round-trips and matrix/projection agreement. Automated browser smoke uses a **mock WebGL2 interface** to check renderer wiring, resource creation, viewport behavior, power safety and context-loss fallback. Browser environments available during this development blocked genuine GPU contexts, so **real GPU pixels, WebGL shader compilation, performance and physical Android touch still need validation**. Do not claim WebGL hardware certification from mocked testing.
