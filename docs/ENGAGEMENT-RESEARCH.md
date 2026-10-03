# Ghost Ball: pool-game engagement research
Research date: 2026-10-02. **Design research and proposals, not implemented features or demonstrated retention gains.** Owner requests explicitly added: **cue options/unlocks and more tables**. The active shipping order lives in [ROADMAP.md](ROADMAP.md). Existing shipped work is recorded in [FINDINGS-VALIDATION.md](FINDINGS-VALIDATION.md).

## Question and method

What makes successful pool games enjoyable beyond merely simulating pool, and which mechanics fit Ghost Ball's original, touch-first, landscape, fair-play, no-currency club identity?

Sources: contemporary store/publisher descriptions establish observable advertised features and rough reach (not causation); product help documents clarify how their rewards actually work; player discussions/reviews are qualitative complaints or praise (not representative surveys); established self-determination research suggests useful hypotheses about enjoyment. **Download counts do not prove why a game succeeds.** We have not run controlled Ghost Ball user studies; all design recommendations below need measurement.

## Competitive landscape (observed features vs proposed adaptation)

| Reference | Directly documented features / reach | Hypothesis for why players return | Ghost Ball adaptation |
| --- | --- | --- | --- |
| **Miniclip 8 Ball Pool** | Google Play lists **1B+ downloads** as inspected in Oct 2026. Direct 1v1/friend challenges, selectable venues, cues and customisation, level-based progression; product help documents trophies, league/table unlocks, earnable rings, missions, pass and clubs. | An immediate recognizable one-match loop plus mastery, visible collection goals and competition offers both short and long-term reasons to play. This is an inference; purchases/streaks are not required to reproduce it. | Preserve accessible rear-cue/precision wheel/power control, quick rematch, skill-earned cue/venue collection and eventually fair friend matches. Do not clone artwork, economy or interfaces. |
| **Pooking / Billiards City** | Google Play lists **500M+ downloads** in Oct 2026 and describes relaxed single-player, touch play, opponent/level difficulty, trophies and city bars. | Low-pressure, offline solo challenges and regular new visual locations give value without waiting for multiplayer. | Give a complete enjoyable offline experience. Add compact, repeatable skill rooms/drills and mastery-earned halls. |
| **Pool Blitz** | Google Play lists **1M+ downloads**. Its published descriptions emphasize 8/9-ball, real-time 1v1, friend tournaments, cross-play, cue customisation and its fast simultaneous Blitz variant (balls sent between two tables). | Friends, variety and optional fast-session mode provide an alternative to standard turn-taking. | Prioritize reliable private friend games and watching friends once core play is solid. Study a shorter arcade variant *later*, but do not dilute standard pool or copy Blitz's specific mode now. |
| **Pure Pool Pro** | Ripstone describes solo/local/online career, **20 personality-based AI opponents**, immersive venues, accurate controls, unlockable cues, balls and cloth, and rewards for trick-shot/clean-frame accomplishments. Official Steam screenshots show a dedicated Equipment section and unlock context beside a selected cue. | Distinct rivals, high-quality venue atmosphere and earning visible equipment through skilled play support identity and mastery. | Differentiated fair Rookie/Club Pro plus future named rival characters. Add a focused, tactile **Cue Locker**, elegant rooms and skill-linked collectibles. |
| **Virtual Pool 4** | Steam documents 27 game variants, career difficulties, trick-shot setup, tutorials with immediate practice, statistics and online/social features. | Practice and skill transfer can be content in their own right, without rewards or forced competition. | Prioritize a deliberately small **Practice Lab**: save/retry a layout, bank/safety/power challenges, instant feedback and optional replay. Defer the many rulesets. |
| **Pool Nation FX** | Official Xbox description highlights practicing/spectating, leagues, rule customisation and a user-editable trick-shot mode. | Designing a challenge adds autonomy and shareable reasons to revisit familiar physics. | Eventually allow replayable seed-based challenge setups with compact share codes, then online spectating. Avoid building a full level editor before robust replay/import validation. |

**Primary sources**
1. 8 Ball Pool Google Play listing (scale, modes and cues): https://play.google.com/store/apps/details?id=com.miniclip.eightballpool
2. Miniclip controls (rear-cue/fine aim/power reference): https://support.miniclip.com/hc/en-us/articles/203747546-How-to-Aim-with-the-Cue-8-Ball-Pool
3. Miniclip Trophy Road, rings and table access: https://support.miniclip.com/hc/en-us/articles/360042151913--Trophies-and-the-Trophy-Road-8-Ball-Pool
4. Miniclip free/premium mission-driven pass: https://support.miniclip.com/hc/en-us/articles/360036840073--Pool-Pass-Elite-Pass-Your-Ultimate-Guide-8-Ball-Pool
5. Pooking Google Play listing (scope and scale): https://play.google.com/store/apps/details?id=com.billiards.city.pool.nation.club
6. Pool Blitz Google Play listing: https://play.google.com/store/apps/details?id=com.CherryPopGames.PoolNationClash
7. Pure Pool Pro publisher: https://ripstone.com/pure-pool-pro/
8. Pure Pool Pro official Steam screenshots: https://store.steampowered.com/app/3456930/Pure_Pool_Pro/
9. Virtual Pool 4 Steam listing: https://store.steampowered.com/app/336150/Virtual_Pool_4/
10. Pool Nation FX Xbox listing: https://www.xbox.com/en-us/games/store/pool-nation-fx/bpqm748j3llt

## Enjoyment mechanisms to test (interpretation, not proof)

The four-study article *The Motivational Pull of Video Games* relates **competence, autonomy and relatedness** to enjoyment and subsequent play. It supports a framework for testable hypotheses, **not** a claim that a specific pool reward increases retention: https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf

1. **Competence: every shot teaches something.** Responsive aim/pull, readable ball roll and cushions, believable misses, varied-but-fair rivals, meaningful bank/position challenges and a replayable last-shot lesson. Even failures should be explainable. Turn-one fundamentals precede menus and XP.
2. **Autonomy: choose the kind of pool night.** Quick Match, local pass-and-play, Practice and later short challenges. Choose a favorite earned cue and hall; do not force a skill ladder to keep playing free modes.
3. **Relatedness: rivalry with real friends.** Reliable private links, rematch, optional best-of series, watch/replay before broad matchmaking. No anonymous global leaderboard or tournament economy until the network is cheat-resistant.
4. **Sensory feel:** real rolling/strike/pocket audio, brief staged cue recoil, calibrated tactile response and visually distinctive wood/cloth. Subtle enough to maintain focus, muted/reduced-motion equivalents mandatory.
5. **Personal goals:** clear, transparent progress such as a successful bank, a no-scratch clear, beating Club Pro or mastering a challenge. The reward must be something players can actually see/equip.
6. **Respect the player's time:** first match starts with minimal taps, retry a drill instantly, show unobstructed results and put Play Again in reach. A short session must feel complete.

## Qualitative negative research: where to differentiate

- Some 2026 Google Play reviews complain about intrusive post-game advertising/purchase popups, perceived cheating and uneven matchmaking. This is review feedback, not independent proof of cheating in any specific match: https://play.google.com/store/apps/details?id=com.miniclip.eightballpool
- Player discussions explicitly dislike tying cue appearance to superior stats, cue recharge costs and a hard-to-browse large collection: https://www.reddit.com/r/8BallPool/comments/1g0vma8/ and https://www.reddit.com/r/8BallPool/comments/tz7u2j/
- Other users report finding casual gameplay, collecting cues and social competition enjoyable; preferences genuinely vary. Therefore allow optional collecting and competition without making them prerequisites for normal pool: https://www.reddit.com/r/8BallPool/comments/1tx4xxn/
- **Ghost Ball guardrails:** no loot boxes, recharge fees, paid competitive stats, wagering, energy timers, forced streaks, FOMO countdowns, modal stacks, artificial shot manipulation or rigged AI. Rewards should recognize play, not coerce it. Any future monetization is a separate explicit product decision, not a dependency of this roadmap.

## Proposed feature specification: Cue Locker (move forward)

**Design goal:** visible ownership without pay-to-win. Cues are original equipment cosmetics with equal strike physics, precision, spin and shot clock; difficulty and guideline options live in settings/modes and never secretly on cues. Do not implement a hidden stats treadmill.

- **Starter slice:** 2 distinctive original, instantly available cues, at least 4 more with transparent, permanent **skill-based** unlocks. Proposed themes: Maple, Smoke, Copperline, Nightfall, Juniper and Slate. Names/art are working concepts, not existing assets. Give every cue a close-up and a real rendered in-table shaft, grip, tip and highlight so an unlock matters **during gameplay**, not only in a modal.
- **Unlock examples (tune through tests):** finish the introduction; beat Rookie fairly; complete a position drill; bank a ball in Practice Lab; beat Club Pro; complete a three-room challenge. No purchase, grinding quota, reset or time-limited access. Make an early non-default unlock reasonably achievable in one short session.
- **One compact locker** from the lobby, using touch-friendly horizontal carousel or viewport-contained grid with Owned / Locked / Favorites; show cue, equipped state and **exact achievement** required. No 200-item scrolling wall. Preview before unlock; equipped cue used consistently in live menu exhibition where appropriate, match entrance, gameplay and replays.
- **Local pass-and-play** supports independently selected cosmetics per player. Never alter shots or network fairness due to appearance. Add versioned, resettable local persistence; handle localStorage blocked/corrupt gracefully and future optional cloud migration separately. Cue IDs/configuration cannot affect deterministic game physics or reproducible replays.
- **Future only:** collectible flourish (subtle chalk/shot sound), ball sets and profile crests after stable cue rendering; cosmetics must have accessible contrast and optional reduced effects.

**Cue acceptance:** a new player can earn/equip and see a different cue across lobby and match in one short session; all cues pass deterministic identical-shot state tests; unlocked status persists/reloads, locked state explains how to earn, no scroll on a 568x320 viewport.

## Proposed feature specification: More tables and room mastery (move forward)

Existing game already has **three original table finishes**; distinguish this from adding **more distinct rooms/venues**. Do not count recolors as five new halls. Add at least **two new identifiable original venue designs** in the next content slice, not just cloth variants. Directional concepts: warm amber workshop, late-night rooftop/salon, vintage tournament hall, and daylight loft. Visual identities are proposals, not shipped or licensed artwork.

- Each room has recognizable lighting, rails/wood details, surrounding venue ambiance and matching entrance/transition; table remains readable and physically centered under 568x320 and rotated portrait. Respect reduced-motion/low-power renderer and keep the cue tip/ball numbers legible on every cloth color.
- **Same official table geometry, roll/collision constants, visibility/aim aids and pocket sizes** in normal competitive play regardless of cosmetics. Any alternate-shaped table/pocket gimmick belongs in an explicit unranked trick-shot challenge, not ranked/normal matchmaking.
- Start with existing rooms usable and some free practice access; use progression to unlock **additional** rooms and a visual mastery emblem on each one. Illustrative achievements: clear a room drill, beat its fair rival, complete its optional three-stage challenge.
- A table card previews actual hall artwork, status and exact challenge, then returns immediately to play. The current live-lobby-to-match camera flight and moving balls must use the selected hall, including new rooms; no static fake previews.
- **Room mastery** = 3 short, reusable challenges across pocketing, positioning and defense, rather than repeatedly playing N matches for an arbitrary XP meter. Free Practice remains playable even when a decorative competitive room is locked.

**Room acceptance:** at least two non-recolor venues each visually QA'd across current breakpoints; consistent identical shots in the same rack/seed produce identical physics on every normal table; permanent, comprehensible unlocks and progress persistence; no table/card HUD collision.

## One player-centered loop, not a second casino

**Enter table → aim/pull/strike → understand result → rematch or choose a tiny challenge → see genuine progress → optionally equip a cue/room → repeat or invite a friend.**

Recommended discoverability: Play remains the dominant lobby action. Room selection and Cue Locker should be neighboring but subordinate entry points, not five new first-run CTAs. Celebrate a real skill milestone once and let the user dismiss it immediately; avoid intrusive popups after every shot.

**Practice Lab and progression dependency:** add an actual local stats/achievement ledger **before** implementing unlock conditions. Record mode, rule version, simulation seed, eligible shot provenance and match outcome to prevent exhibition/preview/test events from awarding achievements; document local data reset/export. Build 3 authored repeatable challenges before adding a large procedural catalog. A challenge can unlock one cue and contribute to one room's mastery, so existing play drives multiple rewards instead of duplicated chores.

**Multiplayer order:** private 1v1 and seamless rematches **ahead of** leagues, clubs, ranked stakes, spectators and global profiles. Plan online in parallel after physical baseline passes; validate turn authority, input integrity, anti-cheat server-side validation, reconnection/resume and fairness before ranked progression. Multiplayer must not block offline unlocks. Spectator and shareable replays follow reliable sessions.

## Acceptance experiments and measurement (targets, not achieved metrics)

- **Control gate:** blind novice tests on real Android (cutouts/edge gesture, 568x320, rotated portrait) and desktop; record misfires, max-pull recovery, shot intent vs result, UI collisions, response/frame timing. Avoid collecting personal data without consent.
- **Fun gate:** short playtests of core-only vs core + first cue reward, asking whether cues are meaningful, whether a miss teaches something and whether players elect another match without being prompted. Track optional next-match choice, drill replay, new cue equip and frustration reports. Do not optimize compulsion/forced session length.
- **AI gate:** seeded full-rack results: legal contact, pots, scratches, intended shot completion, rack finish and per-decision latency on low-end devices. Distinguish Rookie and Club Pro via their actual planning, not secret physics. Preset table fixtures plus human feedback required.
- **Content gate:** mock up a new hall and cue on low-end hardware first. Accept only if table visibility, memory/performance and cue readability survive and all cosmetics leave authoritative physics untouched.
- **Online gate:** separate device-to-device synchronization and reconnect tests from browser-only matchmaking UI tests; measure reasonable recovery and never silently award a win on uncertain state.

## Priority decision

1. First unblock reliability and complete matches: physical touch/foul/results and full-rack opponent benchmark.
2. Improve immediate shot feel and readable consequences; eliminate frustration before increasing reward surfaces.
3. Ship **small, high-quality Cue Locker + genuinely new rooms** alongside one local ledger and a tiny authored challenge slice. This lets players earn and display things before the online infrastructure exists.
4. Expand Practice Lab and connected room mastery; then private friends/replay as soon as authoritative networking meets the fairness gate. These can proceed in parallel after step 1.
5. Tournament referee, 9-ball, broader tournaments/rankings, rotating content and new 2.5D cameras are additive, separate, tested expansions. Tournament rules are required before any *official-rules* competitive queue, but are **not** a blocker for fair private casual matches or cosmetics.

Do not turn hypotheses into shipped features, imply store listings establish causation, or let unlocks overtake shot quality.
