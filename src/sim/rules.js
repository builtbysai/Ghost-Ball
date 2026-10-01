// 8-ball rules state machine (WPA/BCA casual). Pure, DOM-free.
// CONTRACT (locked):
//   ballGroup(id): 0 'cue', 1-7 'solid', 8 'eight', 9-15 'stripe'
//   class Rules8:
//     constructor()
//     state: { turn:0, groups:[null,null], open:true, winner:null, over:false,
//              calledPocket:null }
//     startRack()  reset for a new rack; turn = breaker
//     legalFirstIds() -> array of ball ids the current player may hit first
//     onEight(player?) -> bool
//     callPocket(i)
//     settle(summary) -> outcome
//       summary: { firstContactId:null|id, potted:[ids] (no cue), cuePotted:bool,
//                  railAfterContact:bool, wasBreak:bool }
//       outcome: { foul:bool, reason:string|null, message:string,
//                  ballInHand:false|'anywhere'|'kitchen', nextTurn:int,
//                  winner:null|int, gameOver:bool, respot8:bool,
//                  groupsAssigned:bool }
//
// NOTE: rules.state.groups is the [g0, g1] array the tray/UI code reads
// (entries null | 'solid' | 'stripe'). There is no state.groupsAssigned:
// derive it from groups[0] !== null.

/** Which group a ball belongs to. */
export const ballGroup = (id) =>
  id === 0 ? 'cue'
  : id === 8 ? 'eight'
  : id >= 1 && id <= 7 ? 'solid'
  : 'stripe';

export class Rules8 {
  constructor() {
    this.finalId = 8;      // the ball that ends the game
    this.sequence = false; // true for rotation games (9-ball)
    this.state = null;
    this.remaining = new Set();   // object balls still on the table
    this.startRack(0);
  }

  /** Reset for a new rack. turn = breaker (player index 0 or 1). */
  startRack(breaker = 0) {
    this.state = {
      turn: breaker,
      groups: [null, null],
      open: true,
      winner: null,
      over: false,
      calledPocket: null,
    };
    this.remaining = new Set();
    for (let i = 1; i <= 15; i++) this.remaining.add(i);
  }

  /** True when the 8 is the player's next required ball. */
  onEight(player = this.state.turn) {
    const g = this.state.groups[player];
    if (!g || this.state.open) return false;
    for (const id of this.remaining) {
      if (ballGroup(id) === g) return false;
    }
    return true;
  }

  /** Ball ids the current player may legally contact first. */
  legalFirstIds() {
    if (this.state.over) return [];
    const ids = [...this.remaining].sort((a, b) => a - b);
    if (this.state.open) return ids.filter((id) => id !== 8);
    const g = this.state.groups[this.state.turn];
    if (!g) return ids.filter((id) => id !== 8);
    const mine = ids.filter((id) => ballGroup(id) === g);
    if (mine.length) return mine;
    return this.remaining.has(8) ? [8] : [];
  }

  /** The 8-ball call: pocket index the shooter names before shooting the 8. */
  callPocket(i) {
    this.state.calledPocket = i;
  }

  /**
   * Judge one shot and advance the rules state.
   * summary: { firstContactId, potted:[ids] (no cue), cuePotted, railAfterContact, wasBreak }
   * Optional extra: summary.pocketOf = { ballId: pocketIndex } when the
   * integration layer knows which pocket each ball fell in; used to call a
   * wrong-pocket 8 a loss. Without it, a called 8 counts as a win.
   */
  settle(summary) {
    const st = this.state;
    const me = st.turn, opp = 1 - me;
    const firstContactId = summary.firstContactId ?? null;
    const potted = summary.potted || [];
    const cuePotted = !!summary.cuePotted;
    const railAfterContact = !!summary.railAfterContact;
    const wasBreak = !!summary.wasBreak;

    // Legal first-contact set is judged on the table as it was before the shot.
    const legalBefore = this.legalFirstIds();
    for (const id of potted) this.remaining.delete(id);

    let foul = false;
    const reasons = [];
    const addFoul = (r) => { foul = true; reasons.push(r); };

    // ---- fouls -------------------------------------------------------------
    if (cuePotted) addFoul('Cue ball pocketed');
    if (firstContactId === null) {
      addFoul('Cue ball hit nothing');
    } else if (!legalBefore.includes(firstContactId)) {
      addFoul(firstContactId === 8
        ? 'Hit the 8-ball first'
        : `Hit a ${ballGroup(firstContactId)} first`);
    }
    if (firstContactId !== null && potted.length === 0 && !railAfterContact) {
      addFoul('No rail after contact and nothing potted');
    }

    // ---- the 8 ball ---------------------------------------------------------
    const eightDown = potted.includes(8);
    let respot8 = false, winner = null, gameOver = false, eightMsg = null;
    if (eightDown) {
      if (wasBreak) {
        respot8 = true;                 // 8 on the break: respot, never a win/loss
        this.remaining.add(8);
      } else if (!this.onEight(me)) {
        winner = opp; gameOver = true; eightMsg = 'Sank the 8-ball early';
      } else if (foul) {
        winner = opp; gameOver = true; eightMsg = 'Fouled while sinking the 8-ball';
      } else if (st.calledPocket === null || st.calledPocket === undefined) {
        winner = opp; gameOver = true; eightMsg = 'Sank the 8-ball without a called pocket';
      } else if (summary.pocketOf && summary.pocketOf[8] !== st.calledPocket) {
        winner = opp; gameOver = true; eightMsg = 'Sank the 8-ball in the wrong pocket';
      } else {
        winner = me; gameOver = true; eightMsg = 'Sank the 8-ball in the called pocket';
      }
    }

    // ---- group assignment (open table until first legal pot after the break) --
    let groupsAssigned = false;
    if (!gameOver && st.open && !wasBreak && !foul) {
      const others = potted.filter((id) => id !== 8);
      if (others.length) {
        const g = ballGroup(others[0]);
        st.groups[me] = g;
        st.groups[opp] = g === 'solid' ? 'stripe' : 'solid';
        st.open = false;
        groupsAssigned = true;
      }
    }

    // ---- turn / ball in hand --------------------------------------------------
    let nextTurn, ballInHand = false, message;
    if (gameOver) {
      st.winner = winner; st.over = true;
      nextTurn = winner;
      message = winner === me ? `You win. ${eightMsg}.` : `You lose. ${eightMsg}.`;
    } else if (foul) {
      nextTurn = opp;
      // Scratch on the break plays from the kitchen; any other foul is ball in hand anywhere.
      ballInHand = (wasBreak && cuePotted) ? 'kitchen' : 'anywhere';
      message = `Foul. ${reasons[0]}.`;
    } else if (potted.length > 0) {
      nextTurn = me;                    // potting a ball keeps the turn
      message = groupsAssigned
        ? `You are ${st.groups[me]}s.`
        : wasBreak ? 'Good break.' : 'Pocketed.';
    } else {
      nextTurn = opp;
      message = 'Your shot.';
    }
    st.turn = nextTurn;
    st.calledPocket = null;             // the 8 call is per-shot

    // The 8-ball verdict overrides any lesser foul reason in the report.
    const reason = (gameOver && eightMsg) ? eightMsg : (reasons.length ? reasons[0] : null);

    return {
      foul,
      reason,
      message,
      ballInHand,
      nextTurn,
      winner,
      gameOver,
      respot8,
      respotId: respot8 ? 8 : null,
      groupsAssigned,
    };
  }
}

// ---------------------------------------------------------------------------
// 9-ball rules (casual rotation). Same state/outcome shape as Rules8 so the
// match controller, AI and trays read both through one interface:
//   - the lowest-numbered ball on the table must be contacted first
//   - sinking any ball legally keeps the turn; the 9 wins whenever it drops
//     on a legal shot (a clean 9 on the break wins too)
//   - a 9 that drops on a foul is re-spotted; fouls give ball in hand,
//     kitchen only when the cue is scratched on the break
//   - no groups, no called pockets. Deliberate cuts (foundation scope):
//     push-out after the break, the 3-consecutive-foul loss, and the
//     legal-break 4-rails-or-a-pot requirement.
// ---------------------------------------------------------------------------
export class Rules9 {
  constructor() {
    this.finalId = 9;
    this.sequence = true;
    this.state = null;
    this.remaining = new Set();
    this.startRack(0);
  }

  startRack(breaker = 0) {
    this.state = {
      turn: breaker,
      groups: [null, null],
      open: true,
      winner: null,
      over: false,
      calledPocket: null,
    };
    this.remaining = new Set();
    for (let i = 1; i <= 9; i++) this.remaining.add(i);
  }

  /** Lowest ball still on the table, or null when the rack is decided. */
  lowest() {
    let m = null;
    for (const id of this.remaining) if (m === null || id < m) m = id;
    return m;
  }

  /** True when only the 9 remains (interface parity with Rules8.onEight). */
  onEight(player = this.state.turn) {
    void player;
    return this.remaining.size === 1 && this.remaining.has(9);
  }

  /** Only the lowest ball may be contacted first. */
  legalFirstIds() {
    if (this.state.over) return [];
    const lo = this.lowest();
    return lo === null ? [] : [lo];
  }

  /** 9-ball has no called pockets; kept for interface parity. */
  callPocket(i) {
    this.state.calledPocket = i;
  }

  settle(summary) {
    const st = this.state;
    const me = st.turn, opp = 1 - me;
    const firstContactId = summary.firstContactId ?? null;
    const potted = summary.potted || [];
    const cuePotted = !!summary.cuePotted;
    const railAfterContact = !!summary.railAfterContact;
    const wasBreak = !!summary.wasBreak;

    // Judged on the table as it was before the shot.
    const legalBefore = this.legalFirstIds();
    for (const id of potted) this.remaining.delete(id);

    let foul = false;
    const reasons = [];
    const addFoul = (r) => { foul = true; reasons.push(r); };

    if (cuePotted) addFoul('Cue ball pocketed');
    if (firstContactId === null) {
      addFoul('Cue ball hit nothing');
    } else if (!legalBefore.includes(firstContactId)) {
      addFoul(`Hit the ${firstContactId} first — the ${legalBefore[0]} was lowest`);
    }
    if (firstContactId !== null && potted.length === 0 && !railAfterContact) {
      addFoul('No rail after contact and nothing potted');
    }

    // ---- the 9 ball ------------------------------------------------------
    const nineDown = potted.includes(9);
    let respot9 = false, winner = null, gameOver = false, nineMsg = null;
    if (nineDown) {
      if (!foul) {
        winner = me; gameOver = true;
        nineMsg = wasBreak ? 'Sank the 9-ball on the break' : 'Sank the 9-ball';
      } else {
        respot9 = true;             // a fouled 9 never ends the rack
        this.remaining.add(9);
      }
    }

    // ---- turn / ball in hand ---------------------------------------------
    let nextTurn, ballInHand = false, message;
    if (gameOver) {
      st.winner = winner; st.over = true;
      nextTurn = winner;
      message = winner === me ? `You win. ${nineMsg}.` : `You lose. ${nineMsg}.`;
    } else if (foul) {
      nextTurn = opp;
      ballInHand = (wasBreak && cuePotted) ? 'kitchen' : 'anywhere';
      message = `Foul. ${reasons[0]}.`;
    } else if (potted.length > 0) {
      nextTurn = me;
      message = wasBreak ? 'Good break.' : 'Pocketed.';
    } else {
      nextTurn = opp;
      message = 'Your shot.';
    }
    st.turn = nextTurn;
    st.calledPocket = null;

    const reason = (gameOver && nineMsg) ? nineMsg : (reasons.length ? reasons[0] : null);

    return {
      foul,
      reason,
      message,
      ballInHand,
      nextTurn,
      winner,
      gameOver,
      respot8: false,
      respot9,
      respotId: respot9 ? 9 : null,
      groupsAssigned: false,
    };
  }
}
