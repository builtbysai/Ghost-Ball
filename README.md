# Ghost Ball — Clubhouse rebuild

An independent, lightweight browser pool game. The Clubhouse rebuild follows the supplied **Clubhouse v3** direction and has a live exhibition playing on the lobby table rather than static decoration.

**Status:** v0.5 interaction and presentation pass. Top-down 2D is the only playable view; the live lobby table rotates and its balls assemble into the match rack. Full WPA tournament rules, other cameras and online play are still planned.

## Available now

- Responsive Clubhouse inspired by the provided mockup: three tables, working room controls, live AI exhibition, Watch, playable Quick Match vs Rookie or Club Pro, local pass-and-play, and free Practice.
- One active gameplay camera: top-down 2D. The live perspective lobby exhibition becomes that same physical table in a seamless rotation/zoom/rack-assembly transition. The layout works in both device orientations without blocking play.
- Fixed-step simulation (240 Hz) with independent ball positions, bounded equal-and-opposite collision impulses, a simplified sliding-to-rolling transition, pocket mouths and jaw guards, side spin, approximate follow/draw, event-based audio and impact rings.
- Landscape-first match screen with two-player HUD, remaining-ball markers, full-length cue and collision guideline. Grab and rotate the **shaft behind the cue ball**, not the guide in front; use the separate fine-aim wheel, two-axis spin and safe pull-down power bar. Cue-ball placement is unchanged.
- Explicit seeds for reproducible rack / opponent test cases, independent deep-copied simulation snapshots and a minimal committed shot / cue-placement history. Full cinematic replay has not shipped.
- Arcade 8-ball rules (no called shots). Deliberately disabled unfinished modes; no cosmetic matchmaking or fictional unlocks.
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
- `src/game.js`: match ownership, transitions, basic geometric AI.
- `src/render.js`: 2D table and balls, continuous perspective-to-overhead interpolation for the animated entrance.
- `src/audio.js`: gesture-unlocked synthesized sounds.
- `src/main.js`: app wiring, responsive controls, lifecycle.
- `src/touch-controls.js`: tested rear-shaft hit testing, pointer pull, wheel aim and spin-contact math.
- `src/table-transition.js`: live-to-play table motion and deterministic rack assembly.
- `src/landscape.css`: isolated pool gameplay layout.
- `src/style.css`: viewport-contained presentation; design tokens.

See [roadmap](docs/ROADMAP.md) and [research](docs/RESEARCH.md). The 37 Node regression tests cover camera/GPU projection agreement, physical invariants, repeated break settlement, pocket mouths / jaws, seed repeatability and 2D / 2.5D projection inverses. Do not bolt future game modes into `main.js`: extract state machines and provide explicit tests.

## Recovery

The previous main is preserved on GitHub as `archive/pre-clubhouse-rebuild-2026-10-01`. The rebuild is intentionally a new tree, not modifications to the previous engine. On GitHub Pages use relative asset paths so `/Ghost-Ball/` loads correctly. Avoid caching stale scripts until a versioned service-worker update flow is implemented.

## v0.3 graphics validation

## Current view policy

Gameplay ships only with the 2D top-down renderer. The lobby retains a lightweight live perspective 2D scene so it can rotate/morph into the playing table. Old WebGL experiments and invalid smoke checks were removed; any future 2.5D implementation will be designed against the Atelier Air Hockey reference supplied later. The current preferences show future choices as disabled, not simulated features.

## v0.5 input and presentation validation

Gameplay uses separate coarse shaft dragging and fine aim. Node tests cover rear-only cue acquisition, shot-power safety, physics and animated rack positions. The optional browser smoke checks cover portrait and landscape fit and core shot interactions, but physical Android touch and visual timing still require device review. The orientation blocker and legacy view switcher are no longer part of the interface.

See [interaction research and copy boundaries](docs/REFERENCE-CONTROLS.md). Keep the **original** Ghost Ball identity. Similarity is about discoverable mechanics and touch ergonomics, not copying Miniclip's protected graphics, avatars, icons or monetization.
