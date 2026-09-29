# Ghost Ball: Plan

## Goals
A pool game that is clearly better than the air hockey game in depth and polish: real spin physics, effortless-but-deep aiming, a renderer where you can see the balls roll, procedural sound, art-directed rooms, and an AI that plays like a person. Same house style: vanilla JS, canvas, static site, no framework, no monetization.

## Milestones

**M1: Engine (headless, tested)**
`src/physics.js`: SI units, ball states (slide/roll/spin), ball-ball with throw, cushion at nose height, knuckles, pockets, rewind-to-impact, event log, deterministic. `src/table.js` geometry. Behavioral tests for the sanity checks in RESEARCH.md.

**M2: Rules**
`src/rules.js`: referee for 8-ball, 9-ball, practice. Pure function from (rule state, shot events) to (fouls, turn, winner, ball-in-hand). Tests for the fouls that are easy to get wrong.

**M3: Renderer**
Top-down canvas, 3D-orientation ball shader, cue, guides, pocket animation, cloth and rails per room, table fits landscape and portrait.

**M4: Input and HUD**
Aim, pull-back power, spin selector, fine aim, ball-in-hand placement, pocket call for the 8, foul banners, ball trays, pause.

**M5: Audio and rooms**
Procedural clacks, thumps, pocket drops, cue tick, rolling bed, ambience; five rooms.

**M6: AI**
Candidate enumeration by geometry, verify with the real sim under noise, score the leave, safeties; three tiers.

**M7: Verify in the browser**
Play whole games in the preview, fix what feels wrong, check phone-sized viewport.

**Later (not in v1):** online play via deterministic shot sync, cue elevation/jump/massé, straight pool, one-pocket, bank pool, snooker, three-cushion, trick-shot challenges, replay UI.

## Architecture
```
index.html
src/physics.js   pure sim, no DOM
src/table.js     geometry: cushions, knuckles, pockets
src/rules.js     referee
src/ai.js        shot search using physics.js
src/rooms.js     art direction per room
src/ballshader.js  3D-oriented ball rendering
src/render.js    table, balls, cue, guides
src/audio.js     Web Audio synthesis
src/main.js      state machine, input, UI
tests/*.test.mjs behavior tests (node --test)
```

## Key decisions
- **Deterministic fixed-rule stepping** so previews, AI lookahead, replays and future netcode all use one code path.
- **Guide lines come from the real sim**, not a separate approximation.
- **Physics constants are shared by all rooms.** Rooms change look and sound, not fairness. A separate "cloth speed" setting exists.
- **Portrait phones:** the table rotates so its long axis runs vertically; input goes through the same view transform.
- **Scope honesty:** no elevation, no online in v1.
