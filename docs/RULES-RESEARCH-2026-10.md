# Rules research: how pool games actually decide things (4 Oct 2026)

Why this exists: players asked how solids and stripes are decided, how 9-ball differs, and what the wider family of billiards games looks like, so Ghost Ball can implement rules that match the real game before it simplifies. Sources are linked; our own conclusions are marked **Decision**.

## 1. Solids and stripes in 8-ball

The table is **open** after the break. Group assignment is **not** decided by the break, even when balls of one or both groups drop ([BCA after-the-break rules](https://www.billiards.com/blogs/articles/official-bca-8-ball-rules), [APA](https://rules.poolplayers.com/game-rules/after-the-break/), [open-table rule](https://www.billiardworld.com/8bl_ot.html)). The choice is made only when a player *legally pockets a called object ball* after the break; the opponent takes the other group. On an open table the shooter may hit any solid or stripe first (never the 8), and a combination that pockets a ball from either group assigns by the ball that is pocketed.

| Rule family | Assignment |
|---|---|
| WPA / BCA (called shot) | First **called** ball legally pocketed after the break. A fouled pot never assigns. |
| APA | Same open table; a legally pocketed ball after the break assigns (called-ball rules apply). |
| Miniclip / phone pool (no calling) | First legally pocketed ball after the break assigns. No call. |

**Decision (already shipped):** casual Ghost Ball uses the phone-pool simplification: the first legal pot after the break assigns, balls on the break and balls potted on a foul never assign (verified against `resolveCasualEight` in the play-test audit). **Call the 8** (new) restores one slice of the official call: the 8 must drop in the pocket you named. Full called shots every turn are the roadmap's P7.

## 2. Nine-ball (WPA)

Sources: [WPA 9-ball summary](https://www.cuesight.com/wpa/9-ball-rules/), [World Standardized Rules](https://www.billiardworld.com/rls_9bl.html), [WPBA rules](https://static1.squarespace.com/static/5acf990e8ab7220efae54260/t/6626c116592466730832194c/1713815831055/WPBA+9-Ball+Rules+-+%28Rev+4.21.24%29.pdf), [azbilliards push-out thread](https://forums.azbilliards.com/threads/9-ball-push-out.336115/).

- Balls 1-9 in a **diamond**: the 1 at the apex, the 9 in the centre, the others in any order.
- The first ball the cue ball touches must be the **lowest numbered ball** on the table. Balls need not be pocketed in order.
- A player keeps shooting while legally pocketing balls. **Pocketing the 9 legally wins**, on the break or by combination.
- The break must pocket a ball or drive four balls to a cushion. The 9 pocketed on the break is a win unless the cue ball is also pocketed, in which case the 9 is **spotted**.
- Fouls give ball in hand. A 9 pocketed on a foul or push-out is spotted. **Push-out**: the first shot after the break may be played without a required contact; the opponent may then choose to shoot or pass it back. **Three consecutive fouls** by one player lose the rack.

| Rule | Shipped | Note |
|---|---|---|
| Diamond rack, 1 apex, 9 centre | Yes | `rackNine`, seed-shuffled, deterministic |
| Lowest ball first | Yes | A ring marks it; the CPU plans only against it |
| Keep shooting while potting | Yes | |
| 9 wins, including combination and break | Yes | |
| 9 spotted on a foul / scratch | Yes | Foot spot, else nearest free centre-line spot |
| Ball in hand, kitchen after break scratch | Yes | Same as 8-ball |
| Legal-break test (pot or 4 cushions) | No | Needs the P7 re-rack flow |
| Push-out | No | Needs a two-option UI for the incoming player |
| Three-foul loss | No | Easy to add; excluded from casual |

## 3. The wider billiards family (what exists, what we might build)

From [Wikipedia: cue sports](https://en.wikipedia.org/wiki/Cue_sports_techniques), the [Eight-ball](https://en.wikipedia.org/wiki/Eight-ball), [Nine-ball](https://en.wikipedia.org/wiki/Nine-ball) and [Ten-ball](https://en.wikipedia.org/wiki/Ten-ball) pages, and the history sites linked in [COMPETITOR-STUDY-2026-10.md](COMPETITOR-STUDY-2026-10.md):

| Family | Idea | Fit for Ghost Ball |
|---|---|---|
| **Pocket**: 8-ball, 9-ball, 10-ball, straight pool (14.1), one-pocket, bank pool | Pot balls under rules about order, groups, calls or pockets | 8 and 9 shipped. **Ten-ball** is nine-ball with called shots and a 10th ball: a small rules module once calling exists. **Straight pool** (any ball, call every shot, rerack at 14, play to a score) and **one-pocket** (each player owns one pocket) both need a scoring HUD. |
| **Carom**: three-cushion, straight rail, balkline | No pockets; score by hitting both object balls (three-cushion: at least three cushions first) | Needs a pocketless table and a different physics scoring layer. Distinct product; not planned. |
| **English / snooker**: English billiards, snooker | Larger table, smaller pockets, many coloured balls | Different table geometry; not planned. |
| **British pub 8-ball** | Reds and yellows, smaller table | Same engine with other ball art and rules; possible later. |

**Decision:** keep the pocket-game family as the product. Next rules modules, in order of effort: three-foul and push-out for 9-ball, called shots and ten-ball (P7), straight pool, one-pocket.

## 4. Spin: how it should behave (and what we do)

Real players pick their tip position on the cue ball *for every shot*. Top (follow), bottom (draw) and side (english) spin change how the cue ball travels after contact and how it rebounds from cushions ([Basic Billiards: intro to spin](https://www.basicbilliards.com/intro-to-spin.php), [cue sports techniques](https://en.wikipedia.org/wiki/Cue_sports_techniques)). The phone game most players know keeps the red dot where you left it: a tips article reports leaving it from a previous shot is "a common mistake" ([search summary of Miniclip spin guides](https://en.androidayuda.com/games/Tutorials/use-cue-ball-spin-8-ball-pool/)).

**Decision:** Ghost Ball **resets spin to the centre after every shot**, which matches the real habit of choosing each time and removes the "forgot my spin" accident. Preferences → *Spin after a shot → Keep* restores the Miniclip-style memory. Spin remains visible on the cue-ball icon, and the icon is draggable for a quick change.

## 5. Pocket behaviour (why balls "spit")

Real pockets rattle or reject balls that arrive too fast or hit the jaw at a wide angle; deeper shelves and harder facings spit more ([azbilliards: what makes pockets spit balls](https://forums.azbilliards.com/threads/what-makes-pockets-tight-what-makes-them-spit-balls-out.141006/), [the shelf effect](https://pooltableportfolio.com/blogs/magazine/the-shelf-effect-why-pocket-depth-changes-everything)). Ghost Ball's rejections came from **invisible** jaw collision nubs. **Decision (shipped):** the nubs are drawn as rubber noses, glancing contacts are tilted toward the well so ordinary shots drop, and a ball aimed at the nose itself still rattles. A measured side-pocket test shows balls aimed within 30 units of centre always drop; 40 units off rattle out.
