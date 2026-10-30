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

## UI / design audit (2026-10-30, Hans's direction: full overhaul)

Hans's verdict: the current UI and menus look horrible and need a full
overhaul. Screen-by-screen audit below (13 screens/dialogs visited). Note: the
audit agent could not save screenshot PNGs (no screenshot-to-file tooling in
its environment), so critiques are descriptive, no image attachments.

### Per-screen notes

- **Lobby:** strongest screen. Deep-green wallpaper, walnut floor/rails, brass
  lamp, framed portraits, live AI exhibition as ambient decoration. Serif
  wordmark ("GHOST BALL" with 8-ball O), tracked small caps. Weak: lower half
  is lopsided — big empty floor bottom-left, mode panel floats bottom-right;
  that panel (tabs + cards + WATCH pill) is the most generic-game-UI corner;
  wall portraits illegible at scale.
- **Table selector:** tasteful. Eyebrow, big serif room name, one-line
  materials copy; each room re-themes (Observatory goes midnight-blue). Mastery
  box text cramped; stepper arrows generic.
- **New Match dialog:** best dialog. Consistent shell (dark green card, serif
  title, gold pill Done). Segmented pills everywhere, but styled as a system
  (dark track, gold active). Excellent opponent microcopy.
- **Match HUD:** good density, themed power rail. Worst offenders live here:
  pause/mute are flat generic gray rounded squares clashing with the
  wood-and-brass theme; the FINE AIM −/wheel/+ stack looks like a default
  widget; spin button is a murky gray circle.
- **Pause dialog:** consistent, nothing to fault.
- **Clubhouse menu:** standard settings-list pattern, but executed in the
  game's type system. Clean.
- **Skill drills:** most generic screen. Uniform dark cards, ragged row heights
  from uneven copy lengths, dimmed lobby doing all the atmosphere work.
- **Daily Rack:** consistent with match HUD.
- **Online Beta:** clean, honest copy. The big "Host a table" button is the
  flattest, most saturated, most stock-looking button in the game — clashes
  with the muted brass used elsewhere.
- **How to play:** dense but readable, kbd chips, well-written copy. One of the
  best screens.
- **Preferences:** hairline rules, gold small-caps labels, segmented pills.
  iOS-style toggles are the most off-the-shelf element in the dialogs. "My
  Club" pill in the footer is a strange home for it.
- **Watch exhibition:** disabled-state communication handled well (dimmed
  controls, banner). Spectate-only reads at a glance.
- **Circuit tab:** consistent with the lobby panel, no new issues.

### Ranked worst elements (overhaul targets)

1. Match HUD pause/mute buttons — generic gray squares, biggest clash with the
   art direction.
2. Skill drills card grid — most generic screen, ragged rows.
3. Fine-aim wheel panel — default-widget look, least designed HUD element.
4. Lobby lower-half composition — dead floor space, floating panel.
5. "Host a table" button — flat saturated gold, clashes with muted brass.
6. iOS-style toggles in Preferences — off-the-shelf.
7. Illegible mini room portraits on the lobby wall.

### Visual bug (new)

After quitting a match back to the lobby, the canvas briefly keeps rendering
the old match table behind the lobby UI before the lobby scene takes over.

### Identity note

The game has a real point of view (Victorian members' billiard hall:
deep-green, walnut, brass, serif + tracked small caps, voiced microcopy) and
mostly avoids generic AI-game clichés (no glassmorphism, no purple gradients,
no emoji icons, no filler copy). The overhaul should keep the identity and the
type system, and replace the scattered default-shelf components (pause/mute,
fine-aim wheel, toggles, Host button), the drills grid, and the lobby
composition.

A polished, complete-feeling pool game with strictly enforced, well-explained
casual 8-ball rules. The dead Mastery button is the most user-visible defect.
Next highest value: drive the full win/rematch flow, and test the portrait
phone layout on a real device.
