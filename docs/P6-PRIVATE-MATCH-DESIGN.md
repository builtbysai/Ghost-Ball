# P6: Private friend matches, protocol and recovery spike

**October 3, 2026. Design and two pure shot/placement command gates only. Not a released Online mode.**

## Goal and constraints

Start with casual two-player private friend matches. Keep existing fixed-step `Game`, pure casual referee, match history, five identical-physics venue themes and cosmetic cue equipment. Host authority chooses accepted shot, clock expiration, placement, turn, foul, pocket and result. Online equipment cannot change power, aim time, spin or outcome. Do not show an active Online button until a real end-to-end two-device match and recovery pass.

Physical Android verification of core P2.1 gameplay and low-end CPU planning remains a release gate for networking, although protocol tests can proceed independently.

## First implemented slice

`src/private-match-protocol.js` exports `PRIVATE_PROTOCOL_VERSION`, `authoritativeDigest`, `shotCommand`, `placementCommand`, `adjudicateShotCommand` and `adjudicatePlacementCommand`. The pure host gate checks a *transport-bound* sending seat (not the sender's claimed seat), session ID, monotonic turn epoch, shot number, angle, bounded power and spin, readiness and pre-shot state digest. It invokes the existing `Game.beginShot` only after validation. The separate placement gate also requires live host ball-in-hand ownership, valid table geometry, current turn/seat/shot/epoch and pre-placement state digest before calling `Game.placeCue`. Its acknowledgment contains the resulting authoritative digest. Duplicate placements cannot move the cue again, and twin-game fixtures must agree after placement plus the subsequent shot. Duplicate/stale/mismatched commands receive explicit nonmutating rejections. Fixed-step twin-Game tests require identical histories and full snapshots on the same accepted input.

The compact 32-bit digest is for **ordinary stale-state detection only**. It is neither a cryptographic signature nor protection against a dishonest P2P host. It includes gameplay flags such as ball-in-hand, foul and match completion, while excluding hall finishes, cue cosmetics, audio, visual animation and real-time UI clocks. Never represent it as authoritative security for a ranked competitive server.

## Next transport design, not yet implemented

1. Create an isolated `src/online/` session controller and transport adapter. Use a single reliable, ordered WebRTC data channel for *accepted turns, placements, game-state snapshots, referee rulings and result/rejoin events*. Pool is turn-based: do not stream authoritative 240 Hz ball state or copy air hockey's 60 Hz realtime scheme.
2. Use optional best-effort remote cue/aim previews on a separate unordered, at-most-once data channel. These previews are purely decorative and may be dropped. Disconnect must never leave a remotely previewed cue authoritative.
3. Invite by private link/QR; no public usernames, chat or directory. Bind host and guest to seats at handshake. The session ID is ephemeral and unguessable. Cap inbound packet sizes; schema-validate every message. Keep TURN credentials short-lived and obtain them through a server-side endpoint configured for this game. Evaluate whether the existing Atelier Cloudflare TURN service can be adapted safely, rather than assuming its URL or permissions work unchanged.
4. Negotiate WebRTC with collision-safe signaling using the recommended perfect-negotiation pattern. Prefer direct connectivity; use TURN if needed. Apply `restartIce()` to appropriate failed network states and reestablish the transport binding on reconnect.
5. Host accepts only host-validated placement while ball-in-hand is active, followed by one valid stroke per current shot state and turn epoch. Only the host decrements canonical shot time and emits clock-expiry and ball-in-hand decisions. Both peers may run the deterministic physics for responsive rendering, but the host broadcasts the accepted stroke plus eventual canonical snapshot/ruling, and the guest reconciles any mismatch. Previews/animations must never drive adjudication.
6. Serialize new network events as versioned envelopes: join, canonical snapshot, turn-start (epoch), shot-intent/accepted/rejected, placement-intent/accepted/rejected, stroke-settled, rules-end, rejoin-request/resync and explicit host-left. Make processing idempotent and reject late previous-turn events. Include current Game seed/rack snapshot, referee state, event history tail and turn clock on resync.
7. On reload/rejoin, pause local authoritative actions until a single current host snapshot and epoch are acknowledged. A host loss is **undecided/disconnected**, not an automatic awarded win. Host migration and independent result trust need separate protocols before anyone promises them.

## Acceptance cases before clicking Online

- Real Android + desktop complete matches on different networks with direct and TURN fallback; measure join, shot acknowledgment, turn advance, remote cue display and practical delay.
- Intent tampering: wrong sending seat, forged seat, duplicate ID, invalid angle/power/spin, stale epoch, scratch placement conflict, late shot after expiration, different seed/digest and oversized packet all reject safely without moving authoritative balls.
- Reliable full-session serialization: the host and guest converge on the same turn, referee verdict and canonical balls after every shot and full rack, including ball-in-hand, break placement and 8-ball foul/win.
- Network faults: temporary disconnect before shot, during motion and after settlement; reload both seats, migrate Wi-Fi/cellular, retry signaling, and verify the receiver cannot double-shoot or silently award a result.
- Equipment and halls are cosmetic and equal across peers. Local offline match achievements and room mastery are not granted from an untrusted peer report. Ranked or money play is explicitly out of scope.
- Maintain current touch/mouse, viewport fit, no fake UI buttons, keyboard access and privacy-local defaults.

## External WebRTC references

- MDN, [RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel), documents default ordered delivery and retransmission options.
- MDN, [Perfect negotiation pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation), covers offer-collision handling.
- MDN, [RTCPeerConnection.restartIce()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce), covers requesting ICE restart after connection changes.

**Release gate:** P2.1 real-device acceptance and actual two-device play/rejoin tests, not the existence of this protocol module.
