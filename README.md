# Ghost Ball

A browser pool game built around feel: you stroke the cue with mouse, finger or controller stick, and the speed of your stroke is the speed of the shot. Real spin, throw and cushion physics, five halls from pool's history, a career Circuit, trick shots, a daily run, and balls you can watch roll. Vanilla JavaScript on a canvas: no framework, no build step, no accounts. Nothing is for sale and nothing is on a timer; everything you unlock, you earn by playing.

## Run it

It uses ES modules, so serve the folder over HTTP (opening `index.html` from disk will not work):

```bash
python -m http.server 8124
```

Open http://localhost:8124. Deep links: `?play&game=nine&rival=2&hall=stage`, `?trick=c04`, `?daily`, `?screen=circuit`, `?join=ABC234` (join an online table), `?net=local` (online over two tabs of one browser, no internet needed) (games `eight|nine|straight|onepocket|practice`, rivals `0|1|2|2p|demo`, halls `parlor|hall61|stage|lastcall|rooftop`).

## What is in it

| | |
|---|---|
| **Play Online** | Host a table and share a six-character code (or a link); the friend joins from any browser. 8-Ball, 9-Ball, Straight Pool or One-Pocket, any hall, optional 30/60 s shot clock, emotes, rematch with the break swapped, reconnect if a connection drops. Peer to peer over WebRTC: no server, no account |
| **Quick Match** | 8-Ball, 9-Ball, Straight Pool or One-Pocket against Rookie, Club Pro or Champion, a friend on the same screen, or an AI-vs-AI exhibition |
| **The Circuit** | Fifteen named rivals across five halls. A win is one star; two side goals (no fouls, run four, sink a bank...) make it three. Beat a hall's three rivals to open the next |
| **Lessons** | Five guided lessons (aim, power, cutting, draw, English) with coaching text on every attempt. Your first stop |
| **Trick Shots** | Sixteen hand-built setups: bank, kick, combo, draw, follow, English, double, cluster, long pot, jump shots and massé curves. Solve first try for three stars. Every challenge and lesson is verified solvable by a test |
| **Daily Run** | Same pre-broken nine-ball table for everyone each day. Clear the rack; the first miss ends the run. Best score and a streak that never punishes you |
| **Blitz** | Sixty seconds on a fresh rack. 100 a ball times a streak multiplier (up to x5), extra for multi-ball shots, a scratch costs 300 points and 3 seconds, clearing the rack pays 500 and adds 8 seconds. Personal best kept |
| **Practice** | A free table with re-rack |
| **Chalk** | XP for wins, stars and skilled shots. Levels unlock cues, chalks and ball sets in the Locker |
| **Achievements** | 23 long-term goals (bank ten shots, run eight balls, clear a hall, land five jump shots, a golden break...) on the Profile screen, each worth Chalk once |
| **Installable** | A web manifest and a network-first service worker: add it to your home screen, and it opens offline after the first visit |

### The halls
The Parlor (1893, gas-lit club), Hall 1961 (smoke and one lamp), The Stage (tournament blue under spotlights), Last Call (corner bar, neon), The Rooftop (dusk, string lights). Each has its own felt, rails, lamp, wall art, sound and interface accent. Physics is the same in all of them.

## Controls

| Input | Does |
|---|---|
| Mouse move | Aim. `Shift`, the wheel, the arrow keys or the on-screen arrows fine-tune |
| Press, pull back, push forward | **The stroke.** The cue follows your hand and fires when it returns to the ball, at the speed of your push. Release without pushing and the shot uses the draw distance instead. A click alone never fires |
| Power strip | The same stroke on a track: pull down, then push or flick up |
| Touch drag on the table | Rotates the aim about the cue ball; farther from the ball is finer, and a magnifier shows the contact point above your finger |
| Gamepad | Left stick aims (`LT` for fine aim). **Right stick is the cue**: pull down, push up. `RB` + right stick moves the spin. `A` fires or confirms, `B` cancels, `X` cycles jump, `Y` replay, `Start` pause. D-pad and `A`/`B` drive the menus |
| Spin ball (bottom left) | Drag the dot: top follows, bottom draws, sides bend off cushions. Double-click resets |
| JUMP button, `J` | Cycle the cue elevation: three jump heights hop over a blocker, and three steeper angles with side spin throw a **massé** curve. Resets after every shot |
| `W` `A` `S` `D` / `C` | Move the spin dot / centre it |
| `F` | Fullscreen (also locks landscape and keeps the screen awake where supported) |
| `Space` | Fire at the strip's power (`Up`/`Down` change it) |
| Ball in hand | Move the cue ball and click, or press **Place** |
| `P` `M` `R` | Pause, mute, replay your last shot |

Aim assist (Settings): **Full path** simulates your shot with the real engine and draws the ghost ball and both balls' paths after contact; **Guide line**; or **None**.

## Rules
- **8-Ball:** open table, solids vs stripes, the 8 last. The 8 needs a called pocket: tap a glowing pocket, or leave it and the game calls the pocket your shot is headed for.
- **9-Ball:** lowest ball first; the 9 on any legal shot wins, on the break included. A 9 potted on a foul is respotted.
- **One-Pocket:** each player owns one foot-rail corner. Only balls in your pocket count; balls in the wrong pocket come back; first to eight wins. A foul gives ball in hand and returns one of your balls.
- **Fouls:** cue ball pocketed, nothing hit, wrong ball first, or no ball reaching a rail or pocket after contact. Any foul gives the opponent ball in hand.
- **Straight Pool (14.1):** any ball, any pocket, one point per ball; the rack re-forms when one ball is left; a foul costs a point (break foul two); three fouls in a row cost fifteen; first to 30.
- Not implemented: push-out, the three-foul rule in the other games.

## The feel layer
Restraint over volume (see `docs/DESIGN.md`). Hit-stop appears only on hard impacts and lasts 40-75 ms. The camera recoils from the cue and pushes in as you draw back. The deciding ball slows the world and pulls the camera toward the pocket. Pockets flash and throw sparks, and the ball flies to your tray. Skilled shots earn callouts (BANK, KICK, COMBO, DRAW, FOLLOW, LONG, DOUBLE, RUN OF N, GOLDEN BREAK) and Chalk. Screen shake has a setting and honors reduced-motion. There are no motion trails on the balls.

## How it works

`docs/RESEARCH.md` (physics and the field), `docs/DESIGN.md` (history, fun, juice, identity), `docs/CONTROLS.md` (input research and the control design), `docs/PLAN.md`.

- **`physics.js`**: deterministic SI-unit engine. Balls slide then roll (draw, follow and stun fall out of that), ball-ball collisions carry friction (cut throw, spin transfer), cushions are frictional impacts at the real nose height, pockets are capture circles behind rounded jaws. Depends only on its input state, so previews, AI lookahead and replays share one code path.
- **`table.js`**: WPA 9-foot table, 2.25 in balls, regulation pockets, rack generators.
- **`rules.js`**: the referee for every game, pure functions from a shot's event log to the next state.
- **`game.js`**: match controller and per-player stats. **`shotinfo.js`**: detects the callouts.
- **`ai.js`**: PickPocket-style planner: geometric candidates (banks at the top level; kick shots for Pro and Champion and jump shots for Champion when snookered) verified in the real sim under execution noise, scored on the leave, with safeties at the top level.
- **`online.js`**, **`sync.js`**, **`transports.js`**: the online layer. Both players simulate every shot from the same seed and the shooter's plan; the host then sends a snapshot and the guest snaps to it if the two ever differ by more than 2 mm. Every inbound message is validated and clamped, floods are rate limited, and the shot clock is host authoritative. Transport is Trystero (WebRTC, Nostr relays for signalling, public TURN as a fallback), loaded only when you go online.
- **`blitz.js`**: Blitz scoring (pure, tested).
- **`circuit.js`**, **`challenges.js`**, **`daily.js`**, **`profile.js`**, **`achievements.js`**, **`gear.js`**: progression and content.
- **`render.js`**, **`ballshader.js`**, **`halls.js`**: canvas renderer, per-pixel sphere shader with a real 3D orientation per ball, and the five halls.
- **`juice.js`**, **`audio.js`**: the feel layer and fully procedural sound (no samples).
- **`stroke.js`**, **`gamepad.js`**: the cue stroke (one state machine shared by mouse, touch strip and controller) and the standard-mapping gamepad layer.
- **`ui.js`**, **`main.js`**, **`styles.css`**: interface and orchestration.

## Tests

```bash
node --test tests/*.test.mjs
```

68 behavior tests: follow/draw and throw geometry, English on a cushion, energy never rising through a break, determinism, pocketing vs jaw rattle, every game's fouls and win/loss edge cases, AI finishing whole games without stalling, exact shot replay, each trick shot solvable by its shipped solution, the callout detector, the stroke state machine (slow pushes, flicks, jitter, stale motion) and the gamepad layer (deadzone, edges, aim response), Chalk levels and unlocks, older saved profiles gaining new fields, achievements unlocking exactly once, jump-shot physics, Circuit progression, the Daily Run's shared layout and streak, the online protocol (validation, two simulations staying in sync shot after shot, resync and resume, the shot-clock penalty), and a regression test for shots being cut short in long matches. Helpful scripts: `node scripts/autoplay.mjs eight 2 0 4` plays AI-vs-AI headless; `node scripts/stress.mjs 18` plays many games checking for NaNs, stray balls and stalls; `node scripts/compare.mjs 10` pits two AI configurations against each other; `node scripts/solve-challenges.mjs c04` searches for a trick shot's solution with the real engine.

## Roadmap
Spectators, a trick-shot editor with shareable setups, snooker, three-cushion, ranked ladders (needs a server).
