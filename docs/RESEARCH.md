# Research notes (2026-10-01)

## Historic identity

Billiards developed from European indoor adaptations of earlier lawn games. American pool acquired its name from nineteenth-century gambling *poolrooms*, where billiard tables entertained patrons. Eight-ball developed in the United States around 1900, with the eight reserved for last. **Design implication:** quiet, historic club spaces and physical wood, felt, brass, lamp-light and cue sounds form an identity separate from flashy casino UI.

- https://www.bestinbilliards.org/billiardshistorypart1
- https://www.bestinbilliards.org/billiardshistorypart2
- https://www.smithsonianmag.com/history/ruth-mcginnis-queen-billiards-180968563/

## Controls

Miniclip uses drag-to-aim plus a precision aiming wheel, separate mobile power pull, and optional cue-ball hit-position/spin. GamePigeon 8-Ball's approachable async interaction favors quick, social turns. **Decision:** do not put the finger over the cue during the power stroke; allow coarse drag anywhere on the table, separate fine aim, independent power and explicit shoot fallback. Do not obscure sightlines with floating panels.

- https://support.miniclip.com/hc/en-us/articles/35451942766865-Basic-Controls-Improving-your-skills-8-Ball-Pool
- https://support.miniclip.com/hc/en-us/articles/203747546-How-to-Aim-with-the-Cue-8-Ball-Pool
- https://support.miniclip.com/hc/en-us/articles/35451960569361-Advanced-Plays-Spins-8-Ball-Pool
- https://allthings.how/how-to-play-8-ball-pool-on-imessage/

## Rules fidelity

WPA 8-ball has fifteen object balls, group assignment, called shots, a defined legal break, ball-in-hand fouls and the eight pocketed only after clearing a group. **We currently implement a clearly labeled arcade/casual subset without called shots or detailed break enforcement.** The roadmap adds an independently tested rules engine rather than claiming competition-level accuracy.

- https://wpapool.com/rules/
- https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf

## Enjoyment and polish

Pool offers fast-to-understand goals and long-term competence through positioning and precise angles. Play should celebrate *readable results*, not flood the screen with arbitrary animation. A survey distinguishes physical tuning, amplifying feedback, and streamlined controls. Experimental research on juicy feedback warns that excessive amplification can undermine agency, while coherent uncertainty and curiosity contribute to enjoyment. **Decision:** small graded collision sounds, subtle pocket rings, legible guides, instantly responsive aim, clear cue movement and progression based on skill rather than paid counters.

- https://doi.org/10.1109/TG.2021.3072241
- https://nickballou.com/publication/2024-kao-et-al-juicy/
- https://doi.org/10.1016/j.chb.2017.03.048

## Differentiation

Ghost Ball isn't another coin economy. The room is a place, practice is immediately available, and the dynamic lobby is a playable exhibition. Earnable, non-pay-to-win cosmetics and a compact skill circuit are later work, following game-feel and rule fidelity.
