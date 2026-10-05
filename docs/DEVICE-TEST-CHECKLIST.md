# What needs a real phone (or a second device)

Everything that can be built and checked in a browser here is done and covered by tests and smokes. These are the things
only a person with real hardware can judge. Please note what feels wrong and send it back; each item says what "good" means.

## Touch and feel (one Android phone, ideally two sizes)
1. **Aiming by touch** - tap or drag the cloth, tap a ball, grab the cue behind the white ball. Good: the cue goes where the
   finger means, no accidental retargeting. Try Preferences > Tap to aim > Cue only if Smart misfires.
2. **Fine aim** - the wheel (Normal and Fine) and the - / + buttons (0.1 degree each). Good: you can line up a long cut without
   overshooting; Fine is slow enough to feel precise but not sluggish.
3. **Power bar and full-power edge gesture** - on both sides of the screen (Preferences > Power bar), including phones with a
   display cutout or gesture bar. Good: a full-length pull always fires, nothing triggers the OS back gesture.
4. **Spin ball** - drag the contact point, tap for the big one. Good: reachable one-handed.
5. **Ball in hand** - drag to place, tap to preview, PLACE and RESET. Good: no hidden duplicate cue ball, the dashed zone is clear.
6. **Pocket tray flight** - balls roll out of the hole into the player's tray. Good: smooth, readable, never covers the next shot.
7. **Cue on top of balls** and each rival's own cue (Rental Ash, Ember, Viridian, Pro Line, Showman). Good: the right cue each turn.

## Performance (a modest Android phone)
8. **Frame rate during a break and during CPU thinking** - the CPU plans in slices; Ace's trick-shot search is the heaviest.
   Good: no visible stutter; a rival never freezes the table. Tell me the phone model if anything hitches.
9. **Elevated view and the room around the table** - the extra lighting layers are the likeliest cost. Good: smooth; if not, tell me
   and I will add a "light effects" switch.
10. **Battery/heat** over a 10 minute match with music on.

## Screens (physically portrait 390x844 and short landscape 844x390 / 568x320)
11. **Every menu** - Clubhouse, New match, Preferences, My Club, Skill drills, Cue locker, How to play, Play a friend, Pause.
    Good: nothing clipped behind a notch or the OS bar, every button comfortably tappable (44 px), scrolling inside a sheet never
    scrolls the page behind it.
12. **Ball-number contrast in all five halls** - can you read 8 / 9 / 10 / 11 etc. at arm's length?

## Online (two real devices on different networks)
13. **Host and join** - by code, by link, and by scanning the QR code from the host's screen. Good: connects within about 15 s;
    if relays are blocked you see the message, not a hang.
14. **A full game** - break, fouls, ball in hand, a pocket call (Official), push-out (9-ball). Good: both screens always agree.
15. **Shot clock** - host's choice, only the host fines a player. Let one run out on each side.
16. **Drop and rejoin** - turn Wi-Fi off on one phone for 20 s and back on, then reload the page and rejoin with the same code.
    Good: the banner counts down, the game resumes where it was.
17. **Rematch** - both players press REMATCH. Good: new rack, the other player breaks.
18. **Host leaving** - close the host's tab. Good: the guest sees a clear "opponent did not come back" after a minute.
19. **Strict network** - try from a phone on mobile data and a laptop on corporate Wi-Fi. WebRTC may fail on some networks; that
    is what a TURN fallback is for, and it needs a relay service this project does not run yet.

## Also worth a real human playing
20. **First five minutes** - open the game cold and see whether the aim / power / shoot coaching is clear without reading anything.
21. **Skill drills** - do all ten feel fair? Safe Hide and Three Straight are new; report if any feels impossible or trivial.
22. **Backup and restore** - My Club > Export a backup, then Restore a backup on another browser.
