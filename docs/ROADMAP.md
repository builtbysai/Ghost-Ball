# Ghost Ball: active development roadmap

**Updated October 3, 2026 following the third authored drill pass.** This is the authoritative **future delivery order**. For why, competitor features, source links, cue designs and room unlock proposals see [ENGAGEMENT-RESEARCH.md](ENGAGEMENT-RESEARCH.md). Completed technical work and unresolved defects are recorded in [FINDINGS-VALIDATION.md](FINDINGS-VALIDATION.md). The [previous roadmap is archived](ROADMAP-ARCHIVE-2026-10-02.md) to prevent its obsolete unchecked items and removed 2.5D code from masquerading as active tasks.

**Direction:** Make Ghost Ball an exceptionally tactile, fair, replayable pool game with its own clubhouse identity. **A satisfying shot and a completed match come before reward systems.** Then let players earn genuinely desirable cues and venues through skill, practice, fair rivalry and social matches, without an advertising/currency treadmill. Miniclip-style familiarity is a control/flow reference, not a license to copy its assets or every monetization system.

## What is already shipped

- [x] P0: Independent fixed-step top-down 2D game; live AI lobby exhibition and camera-flight/rack-assembly entrance; three original table finishes; casual 8-ball against CPU and local pass-and-play; Practice.
- [x] P0–P1: Landscape touch/mouse layout, rear-shaft aiming, fine wheel, power pull, spin, shot clock, result/rematch, explicit preferences; realistic animated rolling and staged cue recoil.
- [x] P1.1: Off-screen 100%-power auto-fire guard; deliberate ball-in-hand ghost/nearby snap, PLACE/RESET and keyboard placement. [PR #14](https://github.com/builtbysai/Ghost-Ball/pull/14).
- [x] P2 foundation: Pure casual referee and specific foul reasons; shot-start group fixes; serializable rulings; geometry Rookie versus bounded predictive Club Pro; clearer P1/P2 HUD. [PR #15](https://github.com/builtbysai/Ghost-Ball/pull/15).
- [x] Research: reviewed six successful pool-game designs, fair skill-earned cosmetic cues and distinctive venues. Five rooms and the first genuine Cue Locker now exist; authored mastery and private multiplayer remain future work.
- [x] P2.1 expanded CPU reliability ([PR #17](https://github.com/builtbysai/Ghost-Ball/pull/17), [PR #20](https://github.com/builtbysai/Ghost-Ball/pull/20)): 12/12 seeded full-physics matches, including four seat reversals, finish with legal eight clearances and byte-identical replay histories. Club Pro now uses frame-sliced direct-pocket prediction and real-physics safety alternatives. Real phone feel and latency remain unverified.

- [x] P3 first audio feedback pass ([PR #19](https://github.com/builtbysai/Ghost-Ball/pull/19)): velocity-aware contact, rail and pocket timbres, safe transient clustering and brief win/loss cues. First P3 factual finish and impulse glints are implemented. Further tuning awaits touch feedback.
- [x] P4 five playable halls ([PR #21](https://github.com/builtbysai/Ghost-Ball/pull/21)), trustworthy local progression ([PR #22](https://github.com/builtbysai/Ghost-Ball/pull/22)) and six original previewable/equippable cosmetic cues ([PR #23](https://github.com/builtbysai/Ghost-Ball/pull/23)). Authoring real room mastery/drills and real-device certification remain.

**Currently playable:** only overhead **2D** gameplay. The live lobby has a decorative perspective rendering. Do not revive discarded experimental elevated/3D views or make their settings clickable before new working implementations exist.

## Active order: dependencies and acceptance

### P2.1 — Close gameplay reliability and verify fun at the table
**Next engineering milestone; blocks progression and online release.**

- [ ] Run **real Android and desktop touch/mouse playtests** for the rear-cue, aiming wheel, spin, full-power screen-edge gestures (including display cutouts), foul-placement and portrait-rotated/568x320 UI. Test pause, shot clock, result, rematch and two players sharing one device. Treat emulated Chromium success as useful but not physical-device proof.
- [x] Validate **12 fixed-step full-rack** CPU matches: eight seeds and four reversed-seat fixtures legally complete with identical replay histories, rulings, and ball snapshots. CI now requires 12 legal finishes. See [reliability lab](P2-1-RELIABILITY-LAB.md).
- [x] Correct observed slow/unfinished CPU games with legal shot assessment, strategic ball-in-hand placement and frame-sliced Club Pro planning, without changing competition physics. Preserve the visible opponent cue as plans complete.
- [ ] Expand fixture diversity further and repeat true complete matches with **real human input**. Check result/rematch, difficult late layouts and safety-shot clarity, rather than generalizing from 12 scripted CPU games.
- [ ] Benchmark **actual per-frame** CPU planning, animation and touch latency on modest Android hardware. Headless CI runtime is not a phone-performance measurement.
- [ ] Resolve serious gameplay/input/rendering defects discovered by the measurements before adding new modes. Validate all shipped match overlays on 1280x720, 844x390, 568x320 and physically portrait 390x844.

**Exit:** humans can reliably finish, understand, and replay matches on real hardware; both opponent tiers create meaningfully different *fair* play and do not stall the browser.

### P3 — Shot satisfaction and short-session replayability
**Prioritize before expanding content; can be tuned concurrently with P2.1 findings.**

- [ ] Polish contact timing, cue recoil/resistance at partial and max charge, actual visible cue tip, ball roll/deceleration, clean numbered balls, pocket collection, cushion/contact sounds, concise turn/foul feedback and subtle optional haptics. Respect global mute, reduced motion and tab lifecycle.
- [ ] Make first-break and first-foul guidance learnable without modal clutter; refine optional first-contact aid, separate fine adjustment from the primary touch area, handedness and aim controls using real playtest observations. Never promise a physically impossible target path.
- [ ] Improve result/celebration **tastefully**: winning hit, opponent reaction, brief camera/light treatment, visible last/decisive shot and immediate Play Again / Change Table. Keep all game HUD, pause/preferences and results inside short viewports, with keyboard focus and touch reach.
- [ ] Add a minimal **last-shot replay / saveable deterministic match record** only after event timestamps, initial seed and input validation are sufficient; the replay must be visibly distinguishable from live play and cost-bounded on mobile.
- [ ] Test the direct loop: open → match → satisfying first pot/foul explanation → result/rematch, with no forced navigation or fictional feature buttons.

**Exit:** real players intentionally choose another match because shots, strategy and rematches feel good, not because a reward popup blocks them.

### P4 — Clubhouse ownership: earnable Cue Locker + more tables
**Moved forward from the old late-content backlog by owner request and research. Build a small complete vertical slice rather than a fake unlock menu.**

- [x] P4 local ledger foundation ([PR #22](https://github.com/builtbysai/Ghost-Ball/pull/22)): save real adjudicated live matches, player-vs-CPU record, legal best run, original selected cue field, selected room, genuine first-match/clean-eight/rival milestones and bounded recent match IDs. Exclude exhibitions, drills, aborted games and replays. Recover safely if localStorage is blocked or incompatible.
- [x] Add Preferences → **Local Record** ([PR #24](https://github.com/builtbysai/Ghost-Ball/pull/24)): private lifetime counts and last three genuine results, browser-only JSON export, explicitly confirmed record/equipment reset that leaves audio and controls alone; safe blocked/future/corrupt storage states. Four-viewport browser coverage and real downloaded/reload-reset tests.
- [x] Genuine local skill receipts ([PR #25](https://github.com/builtbysai/Ghost-Ball/pull/25)): award a permanent drill mark and best shots only from live **settled** target-ball/pocket physics, with bounded receipt deduplication and compatible v1 storage. Do not grant achievements for free Practice, exhibition, screen transitions or fake taps.
- [x] Original **Cue Locker** ([PR #23](https://github.com/builtbysai/Ghost-Ball/pull/23)): House Maple and Smoke are immediately playable; Copperline, Juniper, Slate and Nightfall unlock permanently for first finished match, beating Rookie, a legal eight win and beating Club Pro. Each has full cue/shaft/grip/tip preview, owned/locked/equipped states, exact skill criteria, favorites, keyboard and touch access, actual in-game/clubhouse appearance and persistent selection.
- [x] **Fair equipment policy for current play:** all six cues are visual only. Shared fixed-seed normal shot physics, power, aim, spin and shot clocks do not depend on equipment; unit tests enforce this. Never tie longer aim lines, extra time, spin or force to an unlock. No recharge, currency or random boxes. Any future alternate mechanical equipment must be an explicitly separate unranked mode.
- [ ] Carry identical cosmetic-only semantics into eventual online play; validate per-player cue display with the host-authoritative protocol. Do not tie longer aim lines, extra shot time, more spin or superior force to premium/unlocked cosmetics. No recharge, duplicate fragments, random loot boxes, paywalls or grind-for-equivalent-stats. Any future alternate mechanical equipment must be a clearly separated **unranked** mode with rules disclosed.
- [x] Add **Wintergarden** and **Afterhours**, two distinct original playable rooms ([PR #21](https://github.com/builtbysai/Ghost-Ball/pull/21)). Pale-oak/brass-disc versus lacquer/silver-bar materials share unchanged shot physics and existing entrance. All five remain freely selectable until authored room mastery exists.
- [ ] Physically verify all five venues' ball-number contrast, touch fit and entrance on real Android devices.
- [ ] Start **room mastery** with just 2–3 authored challenges tied to meaningful achievements. Unlock additional halls and cues via disclosed skill milestones (example: a bank-shot drill, beat Rookie, complete a room challenge); give players attainable early rewards. Do not lock core Practice or the starter table.
- [x] Completed matches can append a restrained earned-cue count to the result copy, never a blocking reward popup. The Locker is secondary to Play, not a separate storefront.
- [ ] Add one tasteful equipment-focused first-unlock treatment after real-device review and avoid interfering with rematch.

**Exit:** a new player can earn, select and actually see a different cue and a different room in one/two short sessions; normal tables and cosmetics produce **identical deterministic shot physics**; equipped state and achievements persist; no overlap or scroll traps.

### P5 — Practice Lab, skill mastery and meaningful replay goals
**Build on the P4 ledger and authored challenge foundation. Can overlap networking planning once P2.1 is green.**

- [x] First **Practice Lab** slice ([PR #25](https://github.com/builtbysai/Ghost-Ball/pull/25)): two genuine settled-physics skills, Center Drop and Corner Line, with two attempts, permanent local personal best and responsive picker.
- [x] Third **Rail Return** authored drill ([PR #26](https://github.com/builtbysai/Ghost-Ball/pull/26)): bank the 3 off the bottom cushion into top middle. Target-ball non-jaw cushion proof is required; no false completion from a direct pot or incidental pocket-jaw impact. Real physics produced solved 40% and keyboard 53% reference strokes. Normal rack physics is unchanged.
- [ ] Physically validate all three authored skills with players on real Android touch devices, then expand with cue-ball position, safety/defense, repeat-shot seed, ghost-ball teaching and spin experiments. Require physically solvable fixtures and real player review before release.
- [ ] Offer an optional 3-stage per-room **table mastery** challenge with understandable criteria and tracked progression. Expand Circuit/Workshop only when real drill and milestone state exists. Use curated challenges, then bounded procedural variation if playtests justify it.
- [ ] Add optional achievements/crests and a private local match ledger (streak is descriptive only, never an attendance obligation). Consider short “one perfect shot” challenges and sharable compact seed challenges once replays are trustworthy.
- [ ] Improve opponent identity: distinguish named rivals by legal shot selection, positional play, mistakes, safety tactics and shot cadence. Profile every change so Rookie still offers hope and Club Pro still makes humanly plausible mistakes.
- [ ] Introduce the full replay browser and selectable highlights only when reliable event-based recording, replay-state visuals, finite storage and share/privacy controls work together.

**Exit:** three distinct learnable short challenges and each genuine room milestone have replayable acceptance tests; earning gear demonstrates something accomplished rather than simply elapsed time.

### P6 — Private friends and fair online matches
**Begin architectural research/transport spikes in parallel with P4–P5, but release only after P2.1's match/physics gate. Real friends before ranked economy, clubs or worldwide matchmaking.**

- [ ] Design **host-authoritative turns/shots and critical results** around the existing deterministic fixed-step simulation and serializable referee/ruling history; validate aim/power/spin/clock/placement, turn ownership, seeds and replay integrity. Do not stream 240-Hz ball state blindly.
- [ ] Evaluate Atelier's direct WebRTC, Cloudflare TURN fallback and reconnect test approach where actually useful; pool requires reliable ordered shot/event sync plus optional low-latency remote cue previews, not identical continuous air-hockey transport.
- [ ] Ship private link/QR two-player **casual** matches first, reliable join/rejoin, obvious turn ownership and quick rematch. Keep each peer's selected cosmetic cue and room presentation while preserving identical shared match physics. Test real two-device network delay, interrupted turn, session recovery and uncertain host exits.
- [ ] Add friend spectating and shareable highlights **after** validated private play, then fair matchmaking with disclosed skill rating if wanted. Anti-cheat means authoritative game state/input and server-side validation wherever trusted ranked play requires it; P2P authority alone is insufficient for strong ranked trust.
- [ ] Defer big clubs, public chat, global ladders and social moderation infrastructure until the basic friend experience is safe and genuinely fun.

**Exit:** reliable cross-device private matches, authoritative non-cheating result handling within the documented trust model, reconnection recovery and screenshot/interaction coverage. No false online menus.

### P7 — Formal competitive rules and additional modes
**A separate track: can begin pure-rules design after P2.1, but do not delay casual cue/room rewards or private casual matches to ship a half-finished tournament mode. Official-rules ranked play is blocked until this phase passes.**

- [ ] Add an **explicit tournament/WPA 8-ball ruleset** alongside the existing casual referee, with legal/illegal break and player choices, correct open-table assignment, called ball/pocket, safety, 8-ball conditions and ball-in-hand restrictions. Include an actual compact pre-shot call/choice UI for human, CPU and network players. See [P2-RULES-ARCHITECTURE.md](P2-RULES-ARCHITECTURE.md). Don't claim full WPA officiating for physics events we can't detect.
- [ ] Ensure score/HUD, AI/legal-shot planner, rules engine, history, replay and spectators understand the selected mode version. Full-rack integration plus physical phone tests are required before enabling.
- [ ] Next add **9-ball** as a truly independent rules module and targeted UX, then optional straight pool. Alternate arcade modes, timed trick-shot runs, local tournaments and broader official-ranked modes follow actual player interest and validated fairness.
- [ ] Introduce opt-in broader competitive tiers/tournaments and limited evergreen rotating challenges only when matchmaking and anti-cheat support them. No financial stakes, expiration pressure, pay-to-win or unearned/artificial progress.

**Exit:** each enabled mode has its own complete rules, input flows and deterministic match/rack regression suite; no faux selection screens or undocumented game balance differences.

### P8 — Additional cameras and long-term expansion
- [ ] Collect the owner's **Atelier Air Hockey 2.5D** interaction/visual reference and establish performance budgets before writing a new camera. Start from current shared simulation and responsive inputs, not deleted experimental WebGL code.
- [ ] Implement an optional true 2.5D/elevated view with validated projection/unprojection and touch/cue occlusion; keep overhead 2D as default. Test safe areas, contrast, reduced motion and low-end mobile frame timing.
- [ ] Only then consider extra venues, more equipment cosmetic styles, advanced optional spin/physics, special table challenges and other-device support. Never let optional effects change authoritative normal-match results.

## Product invariants and priority rules

1. **Fair, tactile pool first.** Shared deterministic simulation is authoritative; renderers, cue cosmetics, venues, sound and achievement systems never silently modify outcomes. Fixed-seed results must match across normal tables/cues.
2. **No monetization treadmill.** No mandatory ads, artificial currency, loot-box chances, limited cue energy, paid stats, forced daily login or fake progression. Real unlock criteria and permanent rewards, with Practice and base pool always available.
3. **Responsive, touch-first and visually restrained.** Key game/pause/locker/table/result screens fit 568x320 and physically portrait 390x844 without unwanted vertical scroll, clipped balls or overlapping HUD. Mouse, touch, accessible labels/keyboard and reduced motion remain supported.
4. **Ship vertical slices:** avoid standalone fake lockers/challenge buttons before they can award/equip something. For each stage: source/design review → module boundaries → focused rules/physics/persistence tests → real gameplay interaction tests → viewport screenshot review → real-device follow-up.
5. **Meaningful evidence:** competitor descriptions are features, not proof of what causes success. Use small, consented novice/experienced playtests to measure misfires, comprehension, voluntary rematch, first unlock comprehension and frustration. Track no manipulative retention tricks. Profile AI seed sets and slow devices before claiming improvement.
6. **Parallel work without blockers:** UI/art exploration and networking architecture can progress alongside reliability, but cannot replace verification or sneak unreleased settings into the clickable UI. Let user-provided future references override speculative camera styling.

**Next concrete build:** physically validate full-rack touch feel and frame pacing on an Android device; verify all three drills on actual touch hardware; then author 2–3 real per-room mastery fixtures and record permanent skill receipts before enabling any locks. Award the earliest room mastery against verifiable settled physics before activating any locks. In parallel finish P3 result feel and research private turn-based online transport.
