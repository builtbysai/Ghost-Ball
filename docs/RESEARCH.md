# Ghost Ball: Research

Research done 2026-09-28 before any code. Sources are linked inline; anything I could not verify is marked as such.

## 1. The field: what exists and what each one teaches

| Game | What it does well | What players complain about | Lesson for us |
|---|---|---|---|
| **Pure Pool / Pure Pool Pro** (Ripstone) | Ultra-realistic ball roll; left-stick aim, right-stick stroke where pull/push sets power; precise spin control; difficulty scales the guide lines down to none ([Pure Pool Pro review](https://www.useapotion.com/2026/02/pure-pool-pro-review-right-on-cue/), [Gamecritics](https://gamecritics.com/stevegillham2gc/pure-pool-review/)) | Camera locks tight to the cue ball and cannot be adjusted mid-shot, so it is hard to read the layout | Keep the whole table visible and let the camera help, never trap the player in a close-up |
| **Pool Nation** | Best "fun": trick shots, jump/swerve/backspin tutorial, close-up replays ([Metacritic](https://www.metacritic.com/game/pool-nation/), [SelectButton](https://selectbutton.com/reviews/pool-nation-review)) | Exaggerated physics in places | Replays and trick-shot content are what make people share and come back |
| **Cue Club 2** | Deepest ruleset: 8/9/10/6/7-ball, snooker, speed pool, killer; tournaments, bar challenges, up to 4 players; cue elevation drives swerve ([Metacritic](https://www.metacritic.com/game/cue-club-2/), [Steam discussion](https://steamcommunity.com/app/366690/discussions/0/1738882678191122635/)) | Bugs where the AI gets stuck when snookered; spin escapes that are unrealistically easy | AI must never stall; every state needs a legal fallback move |
| **Virtual Pool** | Breadth (27 games), tutorials, career, trick shots ([alternativeto](https://alternativeto.net/software/virtual-pool)) | Dated presentation | Teaching the player is a feature |
| **8 Ball Pool** (Miniclip) | Dead-simple mobile controls: drag to aim, pull power, tap a cue-ball icon for spin; guideline length is the main skill knob ([Miniclip support](https://support.miniclip.com/hc/en-us/articles/203747546-How-to-Aim-with-the-Cue-8-Ball-Pool), [spins](https://support.miniclip.com/hc/en-us/articles/35451960569361-Advanced-Plays-Spins-8-Ball-Pool)) | Pay-to-win cues, "rigged" matchmaking, aim-line hacks and cheaters ([Trustpilot](https://ca.trustpilot.com/review/www.miniclip.com), [forum](https://miniclipforum.com/forum/multiplayer-communities/-8-ball-pool/432320-programmed-and-rigged)) | Nothing is for sale; the sim is deterministic and fair; no hidden hand on the scale |
| **tailuge/billiards** (open source, browser) | Physics from Han 2005 + Mathavan 2010 + Alciatore throw; nine-ball, snooker, three-cushion; deterministic; replays ([repo](https://github.com/tailuge/billiards)) | Basic presentation, WebGL 3D only | Proof the academic model runs fine in a browser. Deterministic sim unlocks replays, AI lookahead and cheap netcode |
| **Pool 1.5, classic browser pool** | Instant load | Shallow | Load time is a feature; we ship static files, no framework |
| **PickPocket** (Univ. of Alberta, won the Computer Olympiad 8-ball) | Search over sampled shot outcomes with noise; falls back to safeties when best shot scores low ([Smith 2007](http://webdocs.cs.ualberta.ca/~jonathan/PREVIOUS/Grad/Papers/pickpocket.pdf)) | n/a (research) | Our AI: enumerate geometric candidates, run the real sim with execution noise, score the leave, fall back to safeties |

### What every good pool game agrees on
1. **Physics is the game.** Roll, spin, throw and rail behavior have to be right; everything else is decoration.
2. **Aiming must be effortless on the first shot and deep on the thousandth.** Assist level is a dial, not a cliff.
3. **Sound carries the feel.** "Crisp, satisfying" ball clacks and chalk-dust puffs are named in every review ([AZBilliards overview](https://www.azbilliards.com/from-mobile-to-pc-the-most-successful-billiards-video-games-of-all-time/)).
4. **Atmosphere sells it.** Dim lighting, rich wood, cloth wear, and cue/cloth customization matter.
5. **Fair beats flashy.** The loudest complaints across the genre are cheating, rigging and monetization, not graphics.

## 2. Physics model (the part that decides if it plays well)

### Table and ball, regulation numbers
From the [WPA equipment specifications](https://wpapool.com/wp-content/uploads/2024/01/RECOMMENDED-EQUIPMENT-SPECIFICATIONS.pdf) and summaries:
- 9-foot table playing surface **100 x 50 in (2.54 x 1.27 m)**, exact 2:1.
- Ball **2.25 in (57.15 mm)**, 5.5-6 oz (~170 g).
- Pocket mouth: corner **4.5-4.625 in**, side **5-5.125 in** (side is ~0.5 in wider).
- Cushion nose height **63.5% of ball diameter** (about 1.27 R) above the bed. [Dr. Dave explains why](https://drdavepoolinfo.com/faq/table/cushion-nose-height/): higher nose slows rebounds and lengthens banks; lower speeds them up. This height is what makes rail behavior (spin, hop, angle) come out right, so I model it explicitly.

### Ball motion states
Per [Pooltool's algorithm write-up](https://ekiefl.github.io/2020/12/20/pooltool-alg/) and Leckie & Greenspan 2006 (event-based simulation): a ball is **stationary, spinning, rolling or sliding**. This is the core of draw/follow/stun:
- **Slip velocity** at the contact point: `u = v + w x r`, with `r` pointing down. While `|u| > 0` the ball slides; friction decelerates `v` and spins up/down `w` until `u = 0` (rolling). Slide-to-roll time is `(2/7)|u0| / (mu_s g)`.
- Rolling: only rolling resistance `mu_r` slows the ball.
- Vertical spin (side spin) decays on its own.

Default parameters I will start from ([Pooltool defaults](https://raw.githubusercontent.com/ekiefl/pooltool/main/pooltool/objects/ball/params.py)):
`mu_slide 0.2`, `mu_roll 0.01`, `mu_ball-ball 0.05`, `e_ball-ball 0.95`, `e_cushion 0.85`, `mu_cushion 0.2`, mass 0.170 kg, R 0.028575 m, g 9.81. Ball-ball restitution 0.89 appears in the Mathavan-based collision code, so I will tune between 0.89 and 0.95 by feel and check against known results (below).

### Collisions
- **Ball-ball (throw):** [Alciatore](https://drdavepoolinfo.com/physics_articles/Alciatore_pool_physics_article.pdf) and [Mathavan 2014](https://raw.githubusercontent.com/ekiefl/pooltool/main/pooltool/physics/resolve/ball_ball/frictional_mathavan/__init__.py): normal impulse with restitution plus a tangential friction impulse driven by slip at the contact point (cut angle plus side spin). That gives cut-induced throw and spin-induced throw, and transfers side spin between balls. Friction coefficient falls as slip speed rises (Alciatore's `mu = a + b e^(-c v)` form).
- **Ball-cushion:** frictional impact at the cushion nose height, not at ball center. Han 2005 and Mathavan 2010 ([paper](https://drdavepoolinfo.com/physics_articles/Mathavan_IMechE_2010.pdf)) predict e ~0.98 with sliding friction ~0.14 at low speed. Because contact is above center, side spin, top/back spin and speed all change the rebound angle, the "running english" and "reverse english" every player knows.
- **Pockets:** [Pooltool](https://ekiefl.github.io/2020/12/20/pooltool-alg/) treats pockets as circles with a drop-height check; jaws/knuckles are fixed rounded points that produce the real "rattle" and "lip-out" behavior.

### Cue strike
- Impulse at tip offset `(a, b)` (in ball radii): `v = J/m`, `w_z ~ 2.5 a v / R`, and top/back `w = 2.5 b v / R`. **`b = 0.4` gives instant rolling** (contact at 7R/5), a good sanity check.
- **Squirt** (cue-ball deflection away from the offset side) depends on offset and shaft, not speed ([Dr. Dave](https://drdavepoolinfo.com/faq/squirt/cause/)). **Swerve** is the curve after leaving the tip and needs cue elevation. Elevation, jump and massé are a later phase; v1 ships flat cue with squirt.
- Miscue when tip offset exceeds about half a radius. I will cap offset just under that, with an optional miscue setting.

### Sanity checks (these become the real tests)
- Stun shot straight on: cue ball stops dead, object ball takes the speed (minus restitution).
- Follow/draw: top/back spin carries the cue ball forward/backward after contact.
- **30-degree rule:** stun cue ball goes ~90 degrees off the object ball path on a cut.
- Throw: object ball leaves slightly off the line-of-centers, more with slow speed and side spin.
- Energy never increases; ball counts and positions stay deterministic run to run.

### Engine choice
Two options: exact event-based (Pooltool style, closed-form quartic collision times, fastest) or fixed small time-step with rewind-to-impact. Event-based is elegant but a lot of machinery (quartic solver, per-state trajectories) for 16 balls. **Decision: adaptive small-step integration with analytic per-step friction and rewind-to-impact for ball-ball and cushion hits.** It is deterministic, easy to reason about, easy to run headless for AI and for previews, and 16 balls is well within budget (estimated 5-15 ms per full shot simulation).

## 3. What makes it fun (design conclusions)

1. **Aim guide from the real engine.** The preview line is produced by simulating the shot until first contact, so it always matches the outcome. Assist levels: *Off / Line / Full path* (like Pure Pool's difficulty scaling), and the guide includes squirt so spin is honest.
2. **One gesture model that works on mouse and touch:** aim with pointer position (mouse) or a leverage drag (touch: farther from the cue ball = finer angle control), pull back to set power, release to shoot. Fine-aim modifier for precision. Power drawn on the cue itself, not a separate slider you have to look at.
3. **Cue-ball spin selector** as a draggable dot on a ball icon, with the miscue zone visible.
4. **Balls that visibly roll.** The ball renderer keeps a full 3D orientation per ball and shades stripes/numbers accordingly; you can see backspin, follow and side spin. This is the one thing that will make it look unlike every basic canvas pool clone.
5. **Sound as instrument.** Procedural Web Audio: clack pitch/volume from impact speed, cushion thump, pocket drop plus trough rattle, cue tick, chalk. No sample files, tiny download, matches the air hockey approach.
6. **Readable rules, honest referee.** Every foul is announced with the reason ("Cue ball hit the 9 before the 3"). Ball-in-hand with clean placement UI.
7. **Pace.** Auto fast-forward the tail of a shot when everything is crawling; an unskippable 8 s of balls creeping is the top way a pool game feels sluggish.
8. **Replay** last shot (free because the sim is deterministic: store the shot params).
9. **AI that plays like a person, not a robot.** Distinct tiers, visible aim/pull-back animation, thinking time, and human-scale error; never stalls.

## 4. Rules to implement

- **8-ball:** [BCA/WPA rules](https://www.cuesight.com/wpa/8-ball-rules/): open table until a legal pocket after the break; hit your group first; a legal shot pockets a ball or drives a ball to a rail after contact; fouls give ball-in-hand; losing conditions on the 8 (early, scratch with it, wrong pocket). 8-ball needs a called pocket.
- **9-ball:** [WPA rules](https://www.cuesight.com/wpa/9-ball-rules/): lowest ball first; 4 balls to a rail on the break or a pocket; 9 on the break wins; 9 pocketed on a foul is re-spotted; ball-in-hand on any foul. Push-out and the three-foul rule are documented but deferred.
- **Practice:** free table with rack chooser, ball-in-hand, undo/reset.
- **Later:** straight pool (14.1), one-pocket, bank pool, snooker, three-cushion, trick-shot challenges ([Wikipedia overview of variants](https://en.wikipedia.org/wiki/Comparison_of_cue_sports)).

## 5. Fit with the existing project
Atelier Air Hockey is vanilla JS on a single canvas, procedural audio, art-directed "rooms", static hosting on GitHub Pages, tests via `node --test`, WebRTC online play. Ghost Ball follows the same rules: no framework, no build step beyond copying, rooms as art direction, static deploy. Deterministic physics later gives cheap online play: send shot parameters, both sides simulate, host reconciles final state.

## 6. What this research did not cover
I did not measure real cloth/cushion data myself; the physics constants are literature defaults that will be tuned by playtesting and the sanity checks above. Online play, elevation/massé, snooker and three-cushion are scoped out of v1 deliberately (see PLAN.md).
