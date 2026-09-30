// Network transports for online play. Both expose the same small interface used
// by OnlineLink: send(obj), close(), and onmessage / onpeer / onleave callbacks.
//
//   trysteroTransport  real play: WebRTC data channels, signalled over public
//                      Nostr relays (no server of ours), TURN as a fallback for
//                      networks that block direct connections. Loaded lazily, so
//                      offline play never touches the network.
//   localTransport     two tabs of the same browser over BroadcastChannel. It
//                      needs no internet, which makes it the way to test the whole
//                      online flow, and it works for two windows on one machine.

// relay.mostr.pub answers with an HTTP 301 redirect, which WebSockets cannot
// follow, so it cost a console error on every online visit for nothing.
const RELAYS = ['wss://nos.lol', 'wss://nostr-01.yakihonne.com', 'wss://yabu.me/v2', 'wss://purplerelay.com'];
const TURN_URLS = [
  'turn:staticauth.openrelay.metered.ca:80', 'turn:staticauth.openrelay.metered.ca:443',
  'turn:staticauth.openrelay.metered.ca:80?transport=tcp', 'turns:staticauth.openrelay.metered.ca:443?transport=tcp',
];
let trysteroModule = null;

/** Credentials for the free public TURN service (its REST shared secret is published by the service). */
async function turnCredential() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const username = `${exp}:${Math.random().toString(36).slice(2, 10)}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('openrelayprojectsecret'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
  let bin = ''; for (const b of sig) bin += String.fromCharCode(b);
  return { username, password: btoa(bin) };
}

export async function trysteroTransport(code, onJoinError) {
  if (!('RTCPeerConnection' in window) || !window.crypto || !crypto.subtle) throw new Error('This browser does not support the WebRTC features online play needs.');
  if (!trysteroModule) trysteroModule = await import('https://esm.run/trystero@0.25.4');
  const turn = await turnCredential();
  let peer = null;
  const t = { onmessage: null, onpeer: null, onleave: null, send: () => {}, close: () => {} };
  const room = trysteroModule.joinRoom(
    { appId: 'ghost-ball-pool', relayConfig: { urls: RELAYS, redundancy: 4 }, turnConfig: [{ urls: TURN_URLS, username: turn.username, credential: turn.password }] },
    `gb-${code}`,
    {
      // a table seats exactly two: a third arrival is refused at the handshake
      onPeerHandshake: async (id) => { if (peer && peer !== id) throw new Error('Table is full'); },
      onJoinError: (d) => { console.warn('[Ghost Ball net]', d && (d.error || d)); if (onJoinError) onJoinError(d); },
    },
  );
  const act = room.makeAction('gb');
  act.onMessage = (data, meta = {}) => { if (!peer || meta.peerId === peer) if (t.onmessage) t.onmessage(data); };
  room.onPeerJoin = (id) => { if (peer && peer !== id) return; peer = id; if (t.onpeer) t.onpeer(); };
  room.onPeerLeave = (id) => { if (id !== peer) return; peer = null; if (t.onleave) t.onleave(); };
  t.send = (obj) => { if (peer) act.send(obj, { target: peer }).catch(() => {}); };
  t.close = () => { try { room.leave(); } catch { /* already gone */ } };
  return t;
}

export function localTransport(code) {
  const id = Math.random().toString(36).slice(2, 10);
  const ch = new BroadcastChannel(`ghost-ball-${code}`);
  let peer = null, lastBeat = 0, timer = 0;
  const t = { onmessage: null, onpeer: null, onleave: null };
  const say = (m) => { try { ch.postMessage({ from: id, ...m }); } catch { /* closed */ } };
  const lose = () => { if (!peer) return; peer = null; if (t.onleave) t.onleave(); };
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.from === id) return;
    if (m.k === 'hi') { if (!peer) { peer = m.from; lastBeat = Date.now(); say({ k: 'here', to: m.from }); if (t.onpeer) t.onpeer(); } else if (m.from !== peer) say({ k: 'full', to: m.from }); }
    else if (m.k === 'here' && m.to === id && !peer) { peer = m.from; lastBeat = Date.now(); if (t.onpeer) t.onpeer(); }
    else if (m.from !== peer) return;
    else if (m.k === 'bye') lose();
    else if (m.k === 'beat') lastBeat = Date.now();
    else if (m.k === 'msg' && t.onmessage) t.onmessage(m.d);
  };
  timer = setInterval(() => { if (peer) { say({ k: 'beat' }); if (Date.now() - lastBeat > 4500) lose(); } }, 1000);
  setTimeout(() => say({ k: 'hi' }), 30);
  t.send = (obj) => { if (peer) say({ k: 'msg', d: obj }); };
  t.close = () => { say({ k: 'bye' }); clearInterval(timer); ch.close(); };
  window.addEventListener('pagehide', () => say({ k: 'bye' }));
  return t;
}
