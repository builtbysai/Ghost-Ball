# Ghost Ball playtest findings — 2026-10-30

Full hands-on playtest of the live site (https://builtbysai.com/Ghost-Ball/):
lobby, all 5 tables, New Match dialog, pass-and-play multiplayer (2 players,
casual 8-ball, 45s clock), Quick Match vs Rookie and vs Dex, Practice, Watch
exhibition, Skill drills list, Daily Rack, Clubhouse menu, How to play,
Preferences, Pause dialog, Online Beta dialog. Deliberate fouls tested
(scratch, no-contact, wrong-group-first, no-rail, shot-clock expiry x3),
ball-in-hand placement, group assignment, 8-ball protection. Code cross-checked
for the numbered bugs below.

## Bugs

1. **MASTERY button does nothing on the lobby.** Clicking
   "MASTERY 0 / 3 — NEXT · COMPLETE CENTER DROP" (left panel under the room
   name) produces no dialog, no navigation, no response. Code note: the click
   handler IS wired (main.js:1216 → starts the drill or a match), but the live
   exhibition canvas overlaps the button and swallows pointer events. Fix is a
   layering fix (z-index / pointer-events), not a missing handler.
2. **The Parlor's materials line changes across reloads.** Fresh load shows
   "Walnut rails · sage baize · classic pockets"; after cycling tables it shows
   "Walnut rails · sage baize · leather pockets". Code note: index.html:11
   hardcodes the stale default "classic pockets"; the real data is
   halls[0].detail = "Walnut rails · sage baize · leather pockets"
   (render.js). The default text is never correct. Fix: set the real detail on
   load.
3. **Fine-aim "+" button lies about its step.** index.html:298: aria-label
   says "Aim clockwise half a degree (Shift for 0.1)" but the title and actual
   behavior are "Nudge 0.1° · Shift: 0.02°". The "−" button's label is correct.
   Fix: change the aria-label to match ("Aim clockwise a tenth of a degree
   (Shift for 0.02)").
4. **Match timer flashes the previous game's time.** Quit a long game, start a
   new Quick Match: the HUD timer briefly shows the old elapsed time (e.g.
   20:31) before resetting to 00:00. Cosmetic, self-corrects. Fix: reset the
   timer display at match setup, not after first render.

## Slop / design issues

1. Tap-to-aim is imprecise at distance (about ±20px), and soft shots under ~1/4
   power risk a "no rail after contact" foul — frustrating for precise play.
2. The hamburger (Clubhouse) menu did nothing on first load; worked after a
   reload. Smells like a first-load init race — worth reproducing on a cold
   cache.
3. Shot-clock readout during ball-in-hand was inconsistent: once it showed the
   fouling player's leftover time, another time a fresh 45s. Should be one rule,
   stated in the rules text.
4. Transient render/DOM desync seen once (a "P2 TURN" pill visible while the
   DOM had already moved to "PLACING"). Cosmetic, self-corrects.
5. Positive: no lorem ipsum, no placeholder text, no broken images, no text
   overlap, no misaligned UI. Animation smooth; mute toggle works and reflects
   state; table selection persists across reload.

## Missing functionality / opportunities

1. **End-of-match flow unverified.** A full rack via careful browser aiming
   takes 20+ minutes, so the win banner, win/lose screen, and rematch flow were
   never reached. This is the highest-value untested surface.
2. **Mobile layout untested.** No viewport/touch control in the test
   environment. The match HUD is a dense landscape arrangement (left power
   rail, right fine-aim panel); portrait usability is unknown and should be
   driven on a real phone before any claim.
3. No jump or masse shots (spin is the contact-point dialog only).
4. "My Club" (record/crests) and "Cue locker" (equipment) exist in the menu but
   were not examined — progression depth unknown.
5. Online is device-to-device beta with a six-letter code, explicitly "not yet
   tested across real networks". No matchmaking, no ranked ladder.
6. No shot statistics beyond Practice's SHOTS/POCKETED counter; no surfaced
   match history.

## Rules verification (casual 8-ball, 45s clock) — all passed

- Shot clock appears, counts down, keeps running during ball motion; expiry x3
  gave "Player N's shot clock expired." + ball in hand to the opponent.
- Fouls explained on screen with exact text: scratch ("cue ball potted"),
  no-contact ("no ball hit"), wrong-group-first ("wrong ball first"), no-rail
  ("no rail after contact") — each followed by the plain-English consequence
  ("Opponent has ball in hand") and a turn pill like
  "PLAYER N'S TURN · SCRATCH · BALL IN HAND".
- Ball-in-hand: visible ghost cue ball with green circle, "TAP TO PREVIEW ·
  DRAG TO PLACE", dashed boundary, PLACE/RESET controls; drag auto-confirms
  ("CUE BALL SET"). Potted balls stay potted after a later scratch.
- 8-ball protection: attempting the 8 early is rejected as "wrong ball first"
  before it can drop; rules text confirms early drop / scratch / wrong-first
  loses, and the 8 is re-spotted on the break.
- Group assignment works ("Player 1 potted the 1. Player 1 has solids.",
  "Player 1 keeps the table.").
- AI personas behave as described: Rookie aims visibly and misses honestly
  ("Rookie missed. Your turn."); in the Ace-vs-Dex exhibition even Ace missed
  after the break.

## Screens visited

Lobby (live AI exhibition) · table selector (all 5: Parlor, Observatory,
Foundry, Wintergarden, Afterhours) · New Match dialog (game/opponent/clock/
rules) · pass-and-play match HUD (power rail, fine-aim wheel, spin, hints,
replay-last-shot) · Quick Match vs Rookie · Quick Match vs Dex · Practice ·
Watch exhibition · Skill drills (10 listed) · Daily Rack · Clubhouse menu ·
How to play (Controls/Rules tabs) · Preferences (Controls/Display/Sound) ·
Pause dialog · Online Beta dialog (host/join, six-letter code).

## Verdict

A polished, complete-feeling pool game with strictly enforced, well-explained
casual 8-ball rules. The dead Mastery button is the most user-visible defect.
Next highest value: drive the full win/rematch flow, and test the portrait
phone layout on a real device.
