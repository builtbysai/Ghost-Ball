# Flow, aim guide, AI character and sound: research and decisions (2026-10-04)

## 1. Turn flow: never cover the table
Problem: a large centred banner ("Rival's turn", "Rival missed") sat over the cloth while the shot clock kept running.
Findings from the casual pool leaders (Miniclip, GamePigeon) and general HUD practice: turn changes are carried by the *HUD* (active-player ring, a short caption), never a modal or a banner over play. Information that must persist (what just happened) lives in a one-line recap, not a transient overlay.
Decision: the banner became a slim chip docked above the table for 1.9 s; the recap line already says what happened; the active token carries the shot-clock ring; the placement hint yields to the chip.

## 2. Pocket "points"
Real tables do have pocket *knuckles* (the angled ends of the cushion rubber at each mouth), but they are part of the cushion, never separate dots on the cloth. The dots we painted looked like obstacles in the pockets. Decision: nothing is painted over a pocket mouth. The physics funnel stays so glancing contacts still fall in rather than spit out.

## 3. Aim guide
Best practice in pocket-billiards games: (1) a clean line from the cue ball to the contact point, (2) a ghost cue ball at contact, (3) the struck ball's direction (this is what players aim with), (4) a *short* line for the cue ball's path after contact, because it is a tangent whose length shrinks with the cut. More than that is clutter on a phone.
Decision: white fading path + translucent ghost ball; solid gold object-ball line that fades with distance; short dashed blue deflection line only on a cut (stun-shot geometry, no spin prediction). Short guide mode shortens both.

## 4. Fine aim
Wheel gain went from 0.004 to 0.0015 rad/px (0.0006 in Fine). The on-screen minus/plus buttons step 0.5° (0.1° with Shift). Keyboard arrows stay at 2° (0.25° Shift), where a bigger step is the point.

## 5. Fun and "addictive" without dark patterns
Retention in casual pool comes from: a fast loop (open, break, shoot in seconds), the near-miss ("so close") feeling, clear progress, and opponents with character. Not from timers, streak guilt or loot boxes.
Applied here: opponents with recognisable styles (Rookie steady; Dex aggressive, big power, spectacular misses; Vera patient, plays safeties; Club Pro accurate); a quiet dynamic-difficulty nudge (the CPU loosens by up to 32% when it is far ahead and sharpens when the human leads; never a rule change); run counters in the recap; short opponent quips; fair skill-earned cues (already present). Exhibitions are real refereed matches with rotating pairings, so watching is worth watching.
Persona bench (`node scripts/persona-bench.mjs 10`): Club Pro > Vera > Rookie ~ Dex, with Dex trading accuracy for flair.

## 6. Sound and music
Effects: a ball hit is a short bright noise click over a tone, a cushion is a dull low-pass thud, a pocket is a hollow thump plus a short roll. Volume follows impact speed. Music: pool halls suit slow, warm, non-intrusive jazz/lounge; it must sit under the ball sounds. We generate it (no downloads, no licensing): an electric-piano chord loop, a walking bass, brushes and an occasional sparse note, with a different key and tempo for each hall. It is a Preferences toggle and is silenced by the mute button.

## 7. Nine-ball rules added
Legal break (pot a ball or drive four object balls to a cushion) and three-fouls-lose. The CPU breaks at full power in nine-ball. Push-out stays on the roadmap because it needs an accept/pass choice for the incoming player.
