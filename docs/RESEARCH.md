# Research notes (2026-10-01)

## Historic identity

Billiards developed from European indoor adaptations of earlier lawn games. American pool acquired its name from nineteenth-century gambling *poolrooms*, where billiard tables entertained patrons. Eight-ball developed in the United States around 1900, with the eight reserved for last. **Design implication:** quiet, historic club spaces and physical wood, felt, brass, lamp-light and cue sounds form an identity separate from flashy casino UI.

- https://www.bestinbilliards.org/billiardshistorypart1
- https://www.bestinbilliards.org/billiardshistorypart2
- https://www.smithsonianmag.com/history/ruth-mcginnis-queen-billiards-180968563/

## Controls

Miniclip uses drag-to-aim plus a precision aiming wheel, separate mobile power pull, and optional cue-ball hit-position/spin. GamePigeon 8-Ball's approachable async interaction favors quick, social turns. **Decision:** do not put the finger over the cue during the power stroke; grab and rotate the visible stick behind the cue ball (not the guideline in front), separate fine aim, independent power and explicit shoot fallback. Do not obscure sightlines with floating panels.

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

## v0.2 shot feel and mobile input decision (2026-10-01)

The 2010 Mathavan et al. cushion-impact paper reports restitution around 0.98 and sliding friction around 0.14 under its experimental assumptions, and emphasizes the influence of spin on the rebound. These values do not directly translate to pixel-unit browser physics, so Ghost Ball uses **documented tunable, approximate coefficients** until video or instrumented fixtures exist. Collision impulses are symmetric; cue slip transitions into rolling; side spin has bounded cushion influence. The pocket representation has open rail mouths and small jaw guards, but still needs genuine pocket-shelf geometry and measurement.

- https://journals.sagepub.com/doi/10.1243/09544062JMES1964
- https://support.miniclip.com/hc/en-us/articles/35451942766865-Basic-Controls-Improving-your-skills-8-Ball-Pool
- https://support.miniclip.com/hc/en-us/articles/6630561650833--Settings-Guideline

Miniclip documents separate aim, fine-aim controls, power bar, spin and configurable settings, including orientation on supported screens. We keep these jobs independent. On a tall phone, rotating the *table* upright uses the available vertical space instead of shrinking the balls to fit the viewport width. Power-release shooting is on by default, with an explicit option to disable it to protect users who explore the power range before shooting. The game shows a placement preview and rejects illegal ball-in-hand locations.


## Archived v0.3 view experiment (2026-10-01)

**Retired October 2:** The below design and WebGL components are historical research, not current playable features. The earlier experimental 3D renderer and its harness were removed. Gameplay now ships top-down 2D only; a new 2.5D approach will be scoped from the user's Atelier Air Hockey reference when provided.


The official three.js renderer documentation confirms that modern WebGLRenderer targets WebGL2 and requires explicit resource disposal; three.js performance guidance recommends avoiding uncontrolled high-DPI framebuffers. Ghost Ball has no build system or external runtime dependencies, so this milestone implements a small self-contained WebGL2 pipeline rather than adding a CDN availability dependency. Source: https://threejs.org/docs/pages/WebGLRenderer.html and https://threejs.org/manual/pages/responsive.html.

The existing 240 Hz simulation owns all ball state. Pure `camera3d.js` maps world ball centers and screen-space ray intersections to the same 1000×500 physics coordinates; `render3d.js` owns only graphics resources. The transparent 2D overlay renders readable guide lines and receives pointer input. WebGL is lazily initialized for an opt-in third view, capped at ~1.3 million framebuffer pixels and only renders while in active 3D gameplay. Context creation failure or loss returns to 2.5D without resetting the match. Hardware shader/performance evaluation remains an explicit prerequisite before defaulting users to 3D.
