# Ghost Ball P2: Rules and opponent architecture

**Status:** Casual 8-ball remains the only selectable match ruleset. This pass
separates and tests casual rulings and differentiates the opponents through
planning. Tournament rules must ship as an explicit choice only when their
complete shot-calling and break-choice interfaces are ready.

## What this pass delivers

- `src/casual-rules.js` resolves shot results without UI or simulation writes.
  The Game owns the 240 Hz ball physics, shot clock, player state and event log.
  `Game.beginShot` snapshots the current **group before any balls move**;
  this prevents same-shot final-group-plus-8 pockets from counting as a win.
- Fouls have stable machine-readable reasons: scratch, no contact,
  wrong first ball, and no rail after contact. The screen and accessibility
  announcement explain the cause. Group assignment, turn retention, a legally
  cleared eight and break-eight re-spot have separate regression cases.
- Every shot now records the first contact, pocket IDs and pocket indices,
  and distinct break object balls striking rails. Serializable ruling history
  records group assignments, offender, reason, winner and incoming player.
- `src/ai.js` generates geometry-filtered candidate shots with a ghost-ball
  point and a clear path. Rookie uses short heuristic planning with broader
  imperfect aim and power variation. Club Pro predicts a **bounded**
  shortlist (up to three candidate targets/pockets times two strengths)
  through the exact same simulation, ranking planned pockets and scratch
  risk. No altered physics, hidden ball corrections or main-thread exhaustive
  search. Both remain deterministic given a match seed.

## Deliberate casual rules

- No mandatory calls, safety declaration or tournament break choices.
- No contact is a foul, including a complete break miss; a casual break
  pocket or an eight-ball re-spot retains the existing fast gameplay flow.
- After the break, the first legally pocketed ordinary ball assigns groups.
  Contact the current group's ball first, then pocket something or reach a
  rail. A miss without a foul gives up the turn. Fouls grant ball in hand.
- The 8 is playable only when the shooter was already on the 8 **before**
  beginning the stroke. Pocketing it early, or while scratching, loses.
- A 45-second casual clock remains optional to this game mode's design,
  **not** a claim of official WPA compliance.

## Next: separately selectable tournament rules

The authoritative source is the
[World Pool Association rules of play, official 8-ball sections 4.1–4.9](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf)
(PDF labels the text effective September 15, 2025).

Build these as a second, explicit rules module and UI flow, not extra
conditionals mixed into the default casual game:

1. **Break:** validate a pocket or four distinct object balls to cushions.
   Model illegal-break decisions (accept the result, rerack with the incoming
   breaker, or rerack for the original breaker). Treat breaker scratch,
   an eight-ball on the break and driven-off-table outcomes separately.
   Enforce a head-string placement region when required.
2. **Calls:** a compact pre-shot ball-and-pocket selection, with a visible
   target marker. Support declared safeties and the rule's exceptions for
   obvious shots; don't make an unfinished call widget a selectable mode.
3. **Open table:** the group goes to the legally called ball, not simply the
   first one appearing in the pocket event list. Validate the exceptional
   empty-group on-eight scenario before defining the call UI.
4. **Fouls and finishes:** enforce wrong first ball, post-contact cushion or
   pocket, break specifics, called eight pocket, scratching and invalid
   eight-ball outcomes. Ensure the simulation can actually detect every
   enforced rule; never claim to referee undetectable push/double hits.
5. **UI/AI/online:** both opponents declare valid calls, pass-and-play clearly
   names the acting player, all options fit short landscape without scrolling,
   and the decision state can be serialized for deterministic remote replays.

## Acceptance gates

- Pure rules decision-matrix tests cover every outcome without rendering.
- Two independent seeds complete entire casual racks without contradictory
  UI/history/physics state; completion/replay and fouls get visual snapshots.
- AI profiling uses seeded full tables, blocked layouts and on-eight layouts.
  Cap rollout work on actual Android hardware and compare CPU difficulty by
  observed legal-contact and pocket rates, not by a hidden handicap.
- Separate tournament mode remains disabled until an end-to-end match,
  player-choice break prompts, called pockets and device screenshots are
  verified. Physical touch review and the prior P1 edge-gesture test remain open.
