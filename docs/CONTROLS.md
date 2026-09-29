# Ghost Ball: Controls, UX and Feel (research and design)

Written 2026-09-29 before the controls rework. Sources inline; anything I could not verify is marked.

## 1. What the best pool games do with input

- **Console (Pure Pool, Pool Nation):** left stick aims, a held button slows it for fine aim, and the *right stick is the cue*: pull back to draw the stick, push forward to strike. "The strength and speed of the shot is 100% dependent on how far back you pull the right stick and how fast you flick it forward"; there is no power meter ([Push Square](https://www.pushsquare.com/reviews/ps4/pure_pool), [GameFAQs guide](https://gamefaqs.gamespot.com/ps4/739896-pure-pool/faqs/72071), [Use a Potion](https://www.useapotion.com/2026/02/pure-pool-pro-review-right-on-cue/)). Difficulty settings fade the guide lines out.
- **Mobile (8 Ball Pool):** drag to aim, a slider or pull for power, a cue-ball icon for spin, an aiming wheel for fine tuning ([Miniclip support](https://support.miniclip.com/hc/en-us/articles/203747546-How-to-Aim-with-the-Cue-8-Ball-Pool), which returned 403 to my fetch; the summary comes from search results). Cue stats change the guideline length, which is why players complain about pay-to-win aim.
- **Complaints across the genre:** a camera that locks close to the cue ball and hides the layout, controls that are hard to make precise, and a power meter you have to look away from the table to read.

### What that means for Ghost Ball
Today power comes from *how far* you drag. That works, but it is a distance-to-number mapping, not a stroke. The stroke is the single largest feel upgrade available: the cue should be in your hand, follow your pull back 1:1, and hit at the speed you push it.

## 2. Cross-platform input: what the web platform gives us

From the [W3C Games on the Web roadmap](https://w3c.github.io/web-roadmaps/games/userinput.html), [MDN's Gamepad guide](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API) and [MDN on coalesced events](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents):

- **Pointer Events** unify mouse, touch and pen. Keep using them. `getCoalescedEvents()` returns the intermediate samples a browser merges between frames, so a 1000 Hz mouse gives an accurate stroke *velocity* instead of a 60 Hz guess.
- **Gamepad API:** must be polled every frame; the `standard` mapping is guaranteed only for known pads (axes 0-3 are the sticks, buttons 0-3 face, 4/5 bumpers, 6/7 triggers, 8 back, 9 start, 12-15 D-pad); apply a deadzone (around 0.15); Firefox exposes a pad only after the user touches it; rumble is `vibrationActuator.playEffect('dual-rumble', ...)`.
- **Vibration API** for phones (already used), **Fullscreen and Screen Orientation lock** for a proper landscape game, **Wake Lock** so the screen does not sleep mid-frame. All need a user gesture and can fail, so they are best-effort.
- **Low-latency canvas:** a `desynchronized` 2D context and `alpha: false` reduce presentation latency in Chromium. Support varies, so it is a hint, not a dependency.

## 3. Touch ergonomics
[Apple asks for 44 pt and Material for 48 dp targets](https://www.nngroup.com/articles/touch-target-size/); shrinking a target from 44 to 30 px roughly doubles errors ([UX Movement](https://uxmovement.com/mobile/finger-friendly-design-ideal-mobile-touch-target-sizes/)). Primary actions belong in the thumb zone at the bottom of the screen, and players want to move or resize controls ([72 Technologies](https://www.72technologies.com/blog/tap-targets-thumb-zones-mobile-ux)). Ghost Ball's current jump buttons are 26 px tall and the aim nudges 28 px: both fail this. A finger also hides the ball it is aiming at.

## 4. Design decisions

### A. The stroke (mouse, touch strip, gamepad share one algorithm)
`src/stroke.js` is a pure state machine fed `(position along the aim axis, time)`:
- Pull back to **arm** it (a minimum draw, so a stray click cannot fire a shot).
- Push forward: when the tip comes back to the ball, the shot fires with the *forward speed* over the last ~50 ms mapped to cue speed.
- **Release without a push** and the shot fires from the draw distance, exactly as before. Slow, careful players lose nothing; the flick is the fast path. No setting is needed because the two are distinguished by release velocity.
- The on-screen cue follows the pointer 1:1 while drawing, and the strike animation runs at the real stroke speed.

### B. Precision without the finger in the way
A **loupe** (magnifier lens) appears above the finger while aiming on touch, showing the contact point at 2.5x. Aim keeps the lever-arm rule (farther from the ball = finer). Nudge and jump controls grow to 44+ px.

### C. Gamepad, first class
Left stick aims (quadratic response; a held bumper for fine aim), right stick is the cue (pull down, push up; releasing the stick is a natural push), a modifier turns the right stick into the spin dot, D-pad and buttons cover jump, fire, pause and replay. Menus are navigable by D-pad and A/B. Rumble scales with impact.

### D. Keyboard
Arrows aim, WASD moves the spin dot, `J` cycles jump, `Space` fires at the strip power. Menus use the arrow keys and Enter.

### E. Ergonomics settings
Left-handed layout (swaps the spin ball and power strip sides), aim sensitivity for sticks, stroke sensitivity, haptics, and Fullscreen.

### F. Feel
Cue draws back 1:1 and trembles near full draw; the strike animation speed follows the stroke; a stroke whoosh scales with speed; controller rumble and phone haptics scale with impact; canvas latency hints; a hover ring on the ball under the cursor; input samples are timestamped and coalesced.

## 5. What shipped
The stroke (mouse, touch strip, controller), coalesced pointer samples, the touch loupe, 44 px+ targets, a single JUMP button, left-handed layout, aim-stick and stroke sensitivity settings, gamepad play and menu navigation, keyboard spin (WASD), fullscreen with landscape lock and wake lock, a stroke whoosh, controller rumble, and low-latency canvas hints. In the live page I confirmed: a slow push gives 0.66 m/s, a flick 5.4 m/s, a bare click nothing; a fake controller aims, strokes, pauses and navigates menus; a held touch shows the loupe.

## 6. What is not verified
I cannot test a physical gamepad, real touch screens, or haptics in this environment. The stroke logic is unit-tested with synthetic timestamps; mouse and touch paths are driven with synthetic pointer events; gamepad code follows the standard mapping and is tested against a fake `getGamepads()`.
