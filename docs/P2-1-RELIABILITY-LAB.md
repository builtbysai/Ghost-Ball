# P2.1: Full-rack reliability and CPU planning lab

**Scope:** repeatable fixed-step browser-free match simulation, CPU legal
placement and shot selection, and evidence-driven performance remediation.
Live touch/haptic/frame-time certification on a physical Android device is
**not** covered by CI and remains a separate acceptance gate.

## What the first benchmark exposed

[Initial GitHub Actions run 37084473826](https://github.com/builtbysai/Ghost-Ball/actions/runs/37084473826) used
production `Game`, production deterministic physics and the then-current
`chooseShot` algorithm, both sides played with seed-derived Rookie/Club Pro
decisions. Two racks reached the 96-shot ceiling **without finishing**.

| Baseline seed | Shots | Finished | Object balls remaining | Potted ordinary balls | Fouls |
| --- | ---: | --- | ---: | ---: | ---: |
| 17 | 96 | No | 5 | 10 | 27 |
| 41 | 96 | No | 6 | 9 | 23 |

This was a genuine practical risk to enjoyment: repeated legal contacts did
not consistently become made balls as the layout emptied. It was not
evidence of a physics crash, and it was not an Android performance test.

## Implemented P2.1 response

- The referee records the actual first cue/object contact, rail-after-contact,
  exact pocket numbers and simulated time in each completed ruling. The
  benchmark cross-checks turn, groups, every physical settlement and winner.
- A shared legal ball-in-hand planner looks for practical unblocked
  target-to-pocket approaches rather than putting the CPU at a fixed generic
  head-of-table location. Live CPU and the lab call exactly the same chooser
  and the same authoritative `Game.placeCue`. It does not teleport into an
  occupied position or amend collision outcomes.
- Club Pro now scores a small real-physics prediction shortlist using **legal
  first contact, planned pocket, scratches and early 8-ball penalties**. A
  pure geometry-based Rookie remains more imprecise. Both play identical
  simulation constants; neither gets impossible shot outcomes or invisible
  assists.
- Club Pro's predictive search can be advanced in fixed 240-simulation-step
  slices each animation frame. The same generator is synchronously drained
  during batch benchmarks; seeded equivalence tests prohibit different
  decisions resulting from frame cadence. A slow device may display the
  opponent aiming longer, but no individual frame must execute all eight
  previews in one continuous blocking call.
- The lab keeps completion separate from legality: a win from a legal,
  previously-cleared group pocketing the 8 gets an explicit
  `legalEightFinish` flag, and any supposed legal win while the winner's
  group still has balls is a test failure. Early 8-ball and scratch endings
  remain distinguishable.

## Intermediate observed improvement (before frame-slicing)

[Revised GitHub Actions run 37084764566](https://github.com/builtbysai/Ghost-Ball/actions/runs/37084764566)
tested the updated CPU and legal placement; both fixtures reached an end
within the original ceiling. The original summary did not yet export the
terminal ruling; subsequent runs must prove that these were legitimate
8-ball clearances, not merely illegal 8-ball endings.

| Revised seed | Shots | Finished | Object balls remaining | Ordinary balls potted | Fouls |
| --- | ---: | --- | ---: | ---: | ---: |
| 17 | 71 | Yes | 3 | 11 | 13 |
| 41 | 50 | Yes | 2 | 12 | 7 |

The stronger opponent was the winner in these **two** fixtures, but two
simulations cannot establish a skill-balanced win rate or human fun.
Headless runner decision-latency means/p95/worst were 12.92/42.45/126.09 ms
for seed 17, and 9.37/36.24/61.48 ms for seed 41. These numbers motivated
cooperative search; do not present GitHub CI timings as an Android FPS result.
After the generator refactor, measure real Android frame pacing separately.

## Expanded deterministic match evidence

[Expanded six-seed + three reversed-seat run 37085168133](https://github.com/builtbysai/Ghost-Ball/actions/runs/37085168133)
ran **nine independent CPU-vs-CPU matches** with production 240 Hz physics
and authoritative casual rulings. All nine terminated with a
`terminalReason: "eight-cleared"` and `winnerGroupRemaining: 0`, rather
than an early 8-ball foul. The workflow also replayed all nine seeds with
the same seat allocations, confirming identical shot/ruling histories
and final ball snapshots. This is a bounded deterministic regression
sample, **not** proof that arbitrary seeds or human matches always finish.

| Rack seed | Seat order (P1 / P2) | Shots to legal finish | Fouls |
| --- | --- | ---: | ---: |
| 17 | Rookie / Club | 71 | 13 |
| 41 | Rookie / Club | 50 | 7 |
| 73 | Rookie / Club | 37 | 6 |
| 109 | Rookie / Club | 55 | 7 |
| 211 | Rookie / Club | 55 | 8 |
| 337 | Rookie / Club | 78 | 8 |
| 17 | Club / Rookie | 31 | 6 |
| 41 | Club / Rookie | 63 | 8 |
| 73 | Club / Rookie | 70 | 14 |

The original CI milestone required **all nine** to finish legally and replay identically. The follow-up below raises the merged gate to all 12.
A deliberately restricted headless runner cannot establish Android
frame time or device ergonomics. The frame-sliced live planner and
provisional visible-cue animation are checked separately with seeded
parity, full browser interaction and viewport tests.

## Follow-up: expanded 12-rack and safety-shot regression (October 2)

[PR #20's passing run 37086315463](https://github.com/builtbysai/Ghost-Ball/actions/runs/37086315463)
ran eight original/exploratory seed fixtures (17, 41, 73, 109, 211, 337, 439, 541)
plus four reversed-seat variants (17, 41, 73, 109). All **12/12**
finished through a legitimate `eight-cleared` ruling with no winner group
balls remaining, and repeat runs generated identical histories and final
physical snapshots. This is bounded CPU-vs-CPU evidence only.

The added seeds diagnosed a specific weak path: when no direct pocket lane
exists, Club Pro previously fired an unassessed straight contact that
could accidentally pocket the eight. Club Pro now frame-slices up to six
low-power, **real-physics** fallback previews, scoring legal first contact
and penalizing early-eight and scratch risk. Rookie still makes ordinary
geometry-based mistakes, but the wider layout distribution in this
particular sample finished legally. The new CI gate requires all 12
legal clearances. None of these measurements certifies real Android
frame pacing, all possible table layouts, or real-player enjoyment.

## Run and inspect

```sh
npm test
node scripts/full-rack-lab.mjs
GHOST_SEEDS=17,41 GHOST_MAX_SHOTS=96 node scripts/full-rack-lab.mjs
GHOST_SEEDS=17,41,73,109,211,337,439,541 GHOST_SEAT_FLIP_SEEDS=17,41,73,109 GHOST_MAX_SHOTS=120 GHOST_REPLAY=1 GHOST_MIN_LEGAL_FINISHES=12 node scripts/full-rack-lab.mjs
```

Output summarizes shots, legitimate/illegal termination, each opponent's
legal first contacts, attempts/pots, scratch/fouls, required legal
ball-in-hand placements, recurrent unchanged layouts, total physical steps
and headless planning-time distribution. The optional replay check repeats
the *same* seeded match and asserts identical committed history and final
ball snapshot. CI archives the JSON artifact from each PR benchmark run.

**Limitations:** CPU-vs-CPU does not test real players' cue ergonomics,
human strategy, actual browser frame pacing, physical Android device
cutouts, haptic feedback or meaningful retention. Distinguish planned
target pocket from total ordinary pot count: a planned 8-ball can raise
the former without affecting the latter.

## Next exit gates

1. **Done for the initial regression suite:** six fixed seeds plus three
   reversed-seat matches finish legally and replay identically. Expand
   beyond these 12 fixtures with human-like defensive plans, fresh
   seeds and deliberately awkward blocked/final-8 layouts before
   inferring broader population performance.
2. Add regression fixtures for blocked direct lanes, a final-group ball,
   an already-clear 8-ball, illegal-first contacts, a table almost empty,
   simultaneous group-plus-8 and a stuck cue. Compare scripted
   full-rack history and actual physical settled events.
3. Profile planning *per frame* and total frame time on a real low/mid
   Android phone. Compare against the uninterrupted prediction before
   claiming that the 240-step work budget eliminates visible stutter.
4. Perform the owner/device checklist at 1280×720, 844×390, 568×320 and
   rotated 390×844: hold/release full power against the screen edge,
   touch/system cancellations, fine aim, rear cue acquisition, foul
   ghost placement, pass-and-play turn handoff, break clock, finish sheet,
   pause/resume and rematch. Preserve screenshots and concrete defects.
5. Only after this gate move substantial development capacity to
   P3 visual shot feel, P4 skill-earned cues and authored mastery for the now-playable new venues.

The [active roadmap](ROADMAP.md) remains the priority authority. The
[engagement research](ENGAGEMENT-RESEARCH.md) explains why earning equipment
and new rooms should follow convincing gameplay rather than mask its gaps.
