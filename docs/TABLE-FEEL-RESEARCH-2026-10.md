# Table feel research — pockets, ball return, shot clock, fine aim (2026-10)

Findings behind the changes in this release. Numbers are in table units (1000 x 500 cloth, ball radius 12).

## 1. The "two points in front of every hole"
**What they are.** Real pool tables have *cushion points* (also called knuckles or pocket jaws): the rubber cushion
ends in a rounded nose on each side of every pocket mouth. They are normal and unavoidable: a ball that arrives
too wide hits a point and rattles, which is the "the pocket spat it out" moment every player knows. Corner mouths
are roughly 4.5–5 in wide for a 2.25 in ball (about two ball widths); side mouths are a little wider.

**What was wrong here.** The physics had those noses, but I had placed them at ball-centre depth (12 units in front of
the cushion face) while the drawn cushion ends sat on the face itself. So balls rebounded off something about 12 units
*out on the cloth* where nothing was drawn, and the usable corner mouth was about half a ball wide for the centre of a
ball. That is the invisible collision you saw. Real tables never do that: the nose is the cushion's own end.

**Fix.** The noses now sit on the visible cushion tips (`JAWS` in `src/physics.js`), the cushion cut-outs match them, and
a ball whose centre has rolled past the cloth edge inside a mouth now drops instead of balancing on the lip. Measured
with a corner-pocket sweep, straight-in pots roughly doubled (8 to 16 of 34 test lines) and rattles dropped; the eight-rack
lab, stress run and replay determinism all pass. Dots are not drawn: on a real table the nose is part of the cushion.

## 2. Ball return
**Problem.** A bar under the table overlapped the lower pocket on short landscape screens and lay across the left rail in
the upright phone layout, and it duplicated the trays already shown beside each player.
**Design.** No persistent bar. A potted ball re-emerges from its hole and rolls along a curved path (spin, a soft shadow,
a shrinking scale) into its owner's tray, where the slot pulses and a small wooden "tok" plays. Everything is positioned in
the table canvas's own frame, so the rotated phone layout follows for free. Reduced-motion players get the pulse only.
The table is also larger now that nothing is reserved for the bar.

## 3. Shot clock: number plus ring
They were the same information twice, and the large box competed with the match title. Decision: **one indicator**, the ring
that drains around the active player's token (the place the eye already goes to see whose turn it is). It turns amber at
10 s and red at 5 s, and only then does the token show the seconds as a number. The number stays in the DOM as a
screen-reader timer. The audible last-five-seconds tick is unchanged.

## 4. Fine aim
The wheel was only 2.5x slower than normal aim and the buttons moved 0.5 degrees. Now: normal wheel 0.024 degrees per pixel, fine
mode 0.006 degrees per pixel (a 300 px drag is under two degrees), buttons 0.1 degrees and 0.02 with Shift. At 700 units the
smallest step moves the object ball about 1.2 units, enough to separate a make from a rattle on a long cut.

## 5. Trick shots for the CPU
`src/trick-shots.js` proposes banks (reflect the pocket in a cushion), combinations (cue to A to B to pocket) and draw / follow
variants. The planner proves each with the real physics before attempting it, so the CPU never plays a shot it only hopes
works. Ace (new, always shows off), Dex, Club Pro and a little Vera use it; Rookie never does. In a 50-position survey Ace
landed about 90% of its trick shots. Not done: masse and jump shots (the simulation has no cue elevation).

## Update: the nose collisions are gone entirely
Those rounded cushion ends are called **cushion points** (also *knuckles*, *jaws* or *pocket facings*). Real tables have them and
they cause the classic rattle, but in a game they read as an invisible blocker whenever the ball looks like it is going in.
So Ghost Ball no longer simulates them at all (`JAWS` is now empty). The cushion is a flat face that stops at its visible tip;
a ball whose centre rolls into a mouth is captured by the pocket, and a ball past the cloth edge near a pocket drops instead of
bouncing back. A sinking ball is also clipped to the cloth and the hole, so it never floats over the wood. Pockets are now a
little easier, which is a deliberate trade for "if it looks like it goes in, it goes in".

## Update: pocket facings, drawn exactly as simulated
Instead of dropping the whole idea of a pocket entrance, the table now has real **facings** (see the nose / facing / throat /
mouth diagram): each cushion ends in a rounded **nose** on the face line, and the rubber is cut back at the **facing angle**
(142 degrees at the corners, 103 degrees at the sides) so the two facings funnel into the **throat**. Corner mouths are about
2.1 ball widths nose to nose and the throat is narrower than the mouth; side mouths are about 2.6.

The point of the earlier complaint was *invisible* blockers, so the geometry now lives in one file, `src/table-geometry.js`,
used by **both** the physics and the painter. The physics treats the six cushion faces and twelve facing edges as walls (a
ball rebounds off the nearest point, so a nose deflects it like a real one). The painter draws the rubber wedge, the angled
facing, a small polished cap on each nose, and a cup whose rim passes through the facing ends. A test checks that a ball
pushed into any nose or facing comes to rest exactly one radius from it, and another that the facing angles are as stated.
The CPU's pocket line-of-sight check uses the same facings, and it now plays a safety rather than a line it predicts will
lose the rack.
