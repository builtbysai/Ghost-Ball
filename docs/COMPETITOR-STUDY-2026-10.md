# Competitor, rules and history study (4 Oct 2026)

Purpose: decide what Ghost Ball should borrow *as an interaction principle* from Miniclip's **8 Ball Pool** and Apple's **GamePigeon 8 Ball**, and which real-world rules and history are worth putting in front of players. Nothing here copies assets, branding or monetisation. Miniclip's help pages returned HTTP 403 to our fetcher, so the Miniclip rows rest on the search-result summaries of those pages (cited) plus the earlier first-party notes in [REFERENCE-CONTROLS.md](REFERENCE-CONTROLS.md). Treat details as "reported", and verify against the live games before relying on them.

## What each game does for touch input

| | Miniclip 8 Ball Pool | GamePigeon 8 Ball | Ghost Ball before | Ghost Ball now |
|---|---|---|---|---|
| Aim on the table | Tap/drag the cue, or click-drag on web ([aiming](https://support.miniclip.com/hc/en-us/articles/203747546-How-to-Aim-with-the-Cue-8-Ball-Pool)) | Drag sideways anywhere to line up ([guide](https://appdrum.com/gamepigeon-8-ball-play-cheats-tips-tricks-72/)) | Only the rear shaft; the table ignored touches | **Both**: grab the cue (relative turn) *or* tap/drag the cloth (aim there); tap a ball to aim through it |
| Fine adjustment | Aiming wheel beside the table | none beyond drag distance | Wheel (0.25° keyboard steps, invisible) | Wheel, 2° steps (Shift ¼°), visible readout, optional Fine speed, plus lever-arm precision on the cue |
| Power | Pull bar down, release ([controls](https://support.miniclip.com/hc/en-us/articles/35451942766865-Basic-Controls-Improving-your-skills-8-Ball-Pool)) | Hold the cue icon and drag down | Rail pull; Space fired instantly | Rail pull; hold-Space ramp; tap/Esc cancel |
| Spin | Tap cue-ball icon, drag red dot | Tap cue-ball icon, tap/drag the contact | Button opens a sheet | Same sheet **plus quick-drag on the icon itself** |
| Called pocket | Standard for the 8 | none | none | Optional **Call the 8** ruleset |
| Guide line | Cue path + object-ball direction; length depends on a paid "aim" stat | Short guide | Full guide | Full / Short / Off, never gated by unlocks |
| Ball in hand | Drag cue ball; kitchen after a break scratch | Drag | Anywhere always | Kitchen-only after a break scratch |
| Shot timer | Yes, expiry is a foul | No | Yes | Yes, optional OFF for relaxed games |

### The design decision: one surface, two intents
The user request was "touch in front of the stick where the ball is, sometimes the stick itself". Both are legitimate and neither should need a mode switch:

1. **Press lands on the visible cue behind the ball** (hit-tested in screen space with a larger touch tolerance) → *relative rotation*. Distance down the stick acts as a lever, so holding the butt end is naturally finer than holding near the ball.
2. **Press lands anywhere else on the cloth** → *point aim*. A tap sets the aim at that spot, or straight through an object ball if one was tapped (finger pad of 10 world units). A drag keeps the aim locked on the finger; on touch the aim point leads the finger by 34 px so the finger never hides the target. A crosshair confirms what the touch was understood as.
3. Taps vs drags are separated by an 8 px slop. `pointercancel` restores the previous aim.
4. **Aiming never fires.** Only the power rail, hold-Space, or Enter can shoot. This is the lesson of the earlier "dragging the cue fires" finding.
5. Preferences → Table touch → **Stick only** restores the old behaviour for players who dislike accidental retargeting. The logic lives in the pure, tested `src/aim-gestures.js`.

Rejected: pulling the cue back along its axis to set power. It is realistic but recreates exactly the accidental-shot problem this project already fixed, and the rail/Space paths are explicit.

## Rules: what the WPA game asks for versus our casual mode

From the [WPA rules](https://wpapool.com/wp-content/uploads/2025/09/2025.09.15-WPA-Rules.pdf) and a [summary](https://www.cuesight.com/wpa/8-ball-rules/):

- Break: cue ball behind the head string, no call. A legal break pockets a ball **or** drives at least four object balls to cushions. Otherwise the opponent may accept, or have a re-rack.
- The table is open until a player legally pockets a *called* ball; the 8 may not be struck first on an open table.
- Every non-break shot is called (ball and pocket). The 8 is called only after the group is cleared.
- Loss of game: foul while pocketing the 8; the 8 early; the 8 in an uncalled pocket; off the table. None apply on the break (the 8 may be re-spotted or the breaker may re-break).
- Fouls give **ball in hand**; after a scratch on the break the incoming player is behind the head string.
- Stalemate: the original breaker breaks again.

| Rule | Shipped | Notes |
|---|---|---|
| Open table, first legal pot assigns (Miniclip simplification) | Yes | No calling in casual |
| 8 spotted when potted on the break | Yes | |
| Early 8 / scratch on 8 / wrong first contact lose | Yes | |
| Ball in hand after foul | Yes | |
| **Kitchen only after a break scratch** | **New** | Player and CPU |
| **8-ball pocket must be called** | **New, optional** | "Call the 8"; CPU names its pocket |
| Legal-break test (4 rails or a pot) | No | Needs the P7 tournament ruleset and re-rack UI |
| Full called shots every turn | No | P7; needs a compact pre-shot call UI |
| Push-out, jump rules, 3-foul loss | No | Not in WPA 8-ball; skipped |

## History worth showing players (kept short and general)
From [poolhistory.com](https://poolhistory.com/history/), [tradgames](https://www.tradgames.org.uk/games/Pool.htm) and [History UK](https://www.history.co.uk/history-of-sports/history-of-snooker-and-pool): a French lawn game moved indoors in the 1400s onto green-covered tables; the *mace* gave way to the *cue* (from *queue*, "tail") in the 1600s; pockets and the first recorded pocket billiards arrive in late-1700s England; pocket games spread through American taverns and pool halls in the 1800s, with standard rules and professionals by the late century. The in-game **How to play → History** tab uses only those broad points. Hall founding years in the Clubhouse are fiction and are labelled as such.

## What the competitors do that we still lack (candidates for the roadmap)
1. **Replay / last-shot review** (Miniclip has post-shot feedback). Needs validated event recording first (P3).
2. **A guided first match** (Miniclip's tutorial). We have one hint line and the new How to play sheet; an interactive coach is open.
3. **Named rival personalities** instead of two skill tiers (P5).
4. **Full WPA called shots and break options** (P7).
5. **Sensitivity/handedness depth** (Miniclip's guideline settings). We now have power side, wheel speed, guide length and Table touch.
6. **Social**: rematch is instant, but friend invites and spectating are P6.
Deliberately **not** copied: coins, cue stats that lengthen the aim line, energy/ads, loot boxes (see roadmap invariants).
