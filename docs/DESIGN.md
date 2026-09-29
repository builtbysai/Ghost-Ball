# Ghost Ball: Design (v2)

Second research pass, done 2026-09-28 after the engine shipped. Sources inline.

## 1. What the history says about a pool game's soul

- Billiards grew out of European lawn games; Louis XI of France is credited with the first waist-high table in 1469, the cue arrived in the late 1600s, and chalk in the 18th century ([Sawyer Twain](https://www.sawyertwain.com/blog/the-fascinating-history-of-billiards-and-pool-revealed/), [Cornilleau](https://us.cornilleau.com/content/52-the-history-of-billiards)).
- Pool rooms spread through 19th-century America near transport hubs; the mid-century hall was dim, smoky and social, full of hustlers ([EBSCO](https://www.ebsco.com/research-starters/sports-and-leisure/pool-and-billiards/), [Wikipedia: Mosconi](https://en.wikipedia.org/wiki/Willie_Mosconi)).
- **Straight pool** (Mosconi's 526-ball run in 1954) and **one-pocket** (Minnesota Fats' game) are the two great "style" games: one is precision and rhythm, the other is strategy and patience. **9-ball** is the modern television game; **8-ball** is the bar game ([comparison of cue sports](https://en.wikipedia.org/wiki/Comparison_of_cue_sports)).
- Design lineage matters visually: Brunswick's 1937 Art Deco Paramount and the 1961 aluminum-trimmed Gold Crown, neon beer signs and low lamps, and the modern **Simonis 860 tournament blue** cloth that makes a table pop on camera ([Off The Wall Antiques](https://offthewallantiques.com/product/1937-art-deco-brunswick-paramount-pool-table/), [Brunswick evolution](https://pooltablesutah.com/the-evolution-of-brunswick-iconic-designs-through-the-years/), [Simonis 860](https://www.simoniscloth.com/product/simonis-860/)).

**Decision:** halls are *places from pool's history* (a parlor, a 1961 hustler hall, a tournament stage, a corner bar, a rooftop), not design movements. That gives pool its own identity and stops it borrowing air hockey's "one room per art movement" concept. The one-pocket and straight-pool lineage informs the game modes.

## 2. What makes it fun and hard to put down

From the casual-loop research ([Gametion](https://blog.gametion.com/2024/10/creating-addictive-game-loops-for-engaging-gaming-experiences/), [GDevelop](https://gdevelop.io/blog/casual-game-loops), [Game Wisdom](https://game-wisdom.com/general/design-wisdom-behind-slots-rewards-casual-game-loops)) and Pool Nation's star system ([trophy guide](https://www.playstationtrophies.org/game/pool-nation/guide/)):

1. **A tight loop:** play, win, get rewarded immediately, go again. Rematch is one tap.
2. **Short-term goals inside every match:** stars for side objectives (win clean, run 4 balls, no fouls), plus callouts for skilled shots. Pool Nation's 3 stars per match is the template.
3. **Long-term progression, earned only:** a Chalk (XP) level that unlocks cues, chalks and ball sets. Nothing is sold, nothing is randomized, no energy timers. This is the direct opposite of the 8 Ball Pool complaints.
4. **A ladder, not a menu:** a Circuit through five halls, three rivals each, so there is always a next opponent.
5. **Variety in kind, not just difficulty:** trick-shot challenges (kick, combo, bank, draw, English, following Pool Nation's shot types) and a **Daily Run** (same seeded rack for everyone, best score kept locally, streak shown but never punishing).
6. **Visible progress:** meters that fill, counters that tick up, a level bar on the results screen.

## 3. Juice, with restraint

From [Juice It or Lose It](https://www.indiehackers.com/post/juice-it-or-lose-it-adding-game-feel-to-your-thing-cfb6f494e3) (Jonasson and Purho, 2012), Vlambeer's "The Art of Screenshake" talk (Nijman, 2013; I did not fetch the talk itself, only summaries of it) and [Game Developer's juice article](https://www.gamedeveloper.com/design/squeezing-more-juice-out-of-your-game-design-): juice must *echo the core mechanic*, gameplay feedback comes before decoration, sound carries the most weight, over-juicing annoys, and trails can slow perceived motion.

For pool the core mechanic is **precision and impact**, so:

| Moment | Treatment |
|---|---|
| Cue strike | Stick recoil, tip flash, chalk puff, camera kick scaled by power, layered tick + thump |
| First hard impact | 40-60 ms hit-stop (simulation freezes, effects keep playing) only above a speed threshold, plus a ring and spark burst |
| Break | Bigger kick and longer stop, ball sparks |
| Pocket | Rim flash, ball spins down the hole, drop thunk pitched by speed, ball then *flies to your tray chip* |
| Skilled shots | Callouts: BANK, KICK, COMBO, SCREW BACK, RUN OF N, PERFECT LEAVE |
| Deciding ball | Slow-motion and a camera push toward the pocket |
| Aiming | Gentle push-in while you pull back, cue-ball tension ring rising with power, cue vibration at the top of the range |
| Victory | Results tally with counting XP and a filling level bar |
| Ambience | Per-hall room tone, light shafts, dust motes, string-light bokeh: slow, never competing with the balls |

No motion trails on balls. Screen shake has a setting and honors reduced-motion.

## 4. New visual identity (no borrowing from air hockey)

Air hockey uses serif type, brass hairline borders, dark glass cards and "room per art movement". Pool goes the other way:

- **Type:** a condensed, heavy, uppercase display face with tabular figures (DIN-style system stack), plus a clean sans for body. No serif anywhere.
- **Shape:** flat chips with cut corners and thick accent bars instead of rounded glass panels with hairlines. Ball colors are the secondary palette (the UI literally uses solids and stripes as motifs).
- **Layout:** full-bleed table with a live AI-vs-AI match behind the menu (attract mode), a left-aligned big-type menu instead of a centered card, HUD as scoreboard tags at the top corners.
- **Color:** one accent per hall (lamp amber, smoke teal, stage blue, bar red, rooftop coral) that recolors the UI.

### The five halls
| Hall | Place | Felt | Rails | Mood |
|---|---|---|---|---|
| The Parlor, 1893 | gas-lit club | warm sage baize | dark walnut, bone diamonds | damask wall, sconces |
| Hall 1961 | hustler hall | classic green | aluminum-trimmed grey wood | hanging lamp cone, smoke shafts |
| The Stage | tournament arena | Simonis-style tournament blue | black with LED edge | spotlights, dark crowd |
| Last Call | corner bar | graphite | red formica and chrome | neon signs, jukebox glow |
| The Rooftop | dusk terrace | eucalyptus | pale ash, teal inlay | string lights, skyline |

## 5. Game modes to add
- **8-Ball, 9-Ball, Practice** (done).
- **One-Pocket** (Fats' game): each player owns one foot-rail pocket, pot 8 balls in yours. Strategy, safeties, patience.
- **Circuit:** the ladder with stars.
- **Trick Shots:** hand-built setups solved with cue-ball control; three stars each.
- **Daily Run:** seeded 9-ball run-out, score by balls and speed.

## 6. UX fixes noted from the first playtest
- Coach marks on the first match: aim, pull back, spin. Dismissed forever.
- Touch fine-aim nudge buttons next to the spin ball.
- Settings: screen-shake amount, haptics, aim assist, reduced motion honored.
- Results screen with stars, XP, level bar, rematch as the default action.

## 7. What shipped from this pass
Halls (five places), the new interface language, attract-mode menu, Circuit (15 rivals, stars), 12 trick shots (each verified solvable by a test), Daily Run (seeded pre-broken layout, streak), One-Pocket, Chalk levels with earned cues, chalks and ball sets, the juice layer (hit-stop, recoil, aim push-in, deciding-ball slow motion, sparks, pocket flashes, callouts, balls that fly to your tray), and shot analysis for BANK, KICK, COMBO, DRAW, FOLLOW, LONG, DOUBLE, RUN and GOLDEN break callouts.

Third pass added: five guided lessons, jump shots (the engine now has vertical motion, sphere collisions between airborne and resting balls, and a landing bounce), achievements and a Profile screen, AI bank shots, an installable offline app, and a fix for older saved profiles.

Not done yet: straight pool (14.1), masse, online play, AI kicks and jumps.
