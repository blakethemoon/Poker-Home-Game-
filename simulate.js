// ─────────────────────────────────────────────
//  Poker Home Game — 15-session simulation
//  Exercises: buy-ins, add-ons, busts, re-entries,
//  cashouts, closeSession, conservation checks,
//  winning re-entry, float accumulation, negative
//  input guard, balance-bar false alarms
// ─────────────────────────────────────────────

// ── Helpers (mirrored from index.html) ──────
const ti  = p => p.buyin + p.addOnTotal;
const fmt = n => '$' + Math.abs(n).toFixed(2);
const rnd = (n, dp=2) => parseFloat(n.toFixed(dp));

const NAMES = [
  'Alice','Bob','Charlie','Diana','Eve',
  'Frank','Grace','Henry','Iris','Jack'
];

let errors   = [];
let warnings = [];
let log      = [];

function err(game, msg)     { errors.push(`[GAME ${game}] ❌ ${msg}`); }
function blocked(game, msg) { log.push(`[GAME ${game}] ✅ BLOCKED (correct): ${msg}`); }
function warn(game, msg)    { warnings.push(`[GAME ${game}] ⚠️  ${msg}`); }
function info(msg)          { log.push(msg); }

let totalConservationFails = 0;
let closeSessionBlocks     = 0;

// ── Player factory ───────────────────────────
function makePlayer(id, name, buyin, seat) {
  return { id, name, buyin, addOns:[], addOnTotal:0,
           seat, status:'active', currentStack:buyin,
           cashoutAmount:null, prevCashoutTotal:0 };
}

// ── Add-on ────────────────────────────────────
function addOn(p, amt, type='rebuy') {
  p.addOns.push({ amount:amt, type, time: Date.now() });
  p.addOnTotal += amt;
  p.currentStack += amt;
}

// ── Bust at $0 ────────────────────────────────
function bust(p) {
  p.prevCashoutTotal += (p.cashoutAmount || 0); // preserve any existing cashout before overwrite
  p.status = 'cashed';
  p.cashoutAmount = 0;
  p.currentStack = 0;
}

// ── Re-entry — FIXED: preserve previous cashout ─
function reenter(p, amt) {
  p.addOns.push({ amount:amt, type:'reentry', time: Date.now() });
  p.addOnTotal += amt;
  p.prevCashoutTotal += (p.cashoutAmount || 0); // FIX: don't lose prior cashout
  p.cashoutAmount = null;
  p.currentStack = amt;
  p.status = 'active';
}

// ── totalMoneyOut: all money a player has ever cashed ─
const totalOut = q => (q.cashoutAmount || 0) + (q.prevCashoutTotal || 0);

// ── Cash out — FIXED: uses totalOut for alreadyCO ─
function cashOut(game, players, p, val) {
  val = rnd(val);
  if (isNaN(val) || val < 0) { blocked(game, `${p.name} rejected negative/NaN cashout: ${val}`); return; }
  const totalIn  = rnd(players.reduce((s,q) => s + ti(q), 0));
  const alreadyCO = rnd(players.filter(q => q.id !== p.id).reduce((s,q) => s + totalOut(q), 0));
  const remaining = rnd(totalIn - alreadyCO);

  if (val > remaining + 0.01) {
    blocked(game, `${p.name} tried to cash ${fmt(val)} but only ${fmt(remaining)} remains — capped`);
    val = remaining;
  }
  p.status = 'cashed';
  p.cashoutAmount = val;
  p.currentStack = 0;
}

// ── closeSession check — FIXED order ─────────
function closeSessionCheck(game, players) {
  const all      = players.filter(p => ['active','cashed','out'].includes(p.status));
  const activeCt = players.filter(p => p.status === 'active').length;

  // FIXED: active-player check first — balance only meaningful when all settled
  if (activeCt > 0) {
    return { blocked: false, reason: 'Active players warned, not blocked', activeCt };
  }
  const totalIn   = rnd(all.reduce((s,p) => s + ti(p), 0));
  const cashedOut = rnd(all.reduce((s,p) => s + totalOut(p), 0));
  const diff = rnd(cashedOut - totalIn);
  if (Math.abs(diff) > 0.02) {
    return { blocked: true, reason: `Cash is ${diff>0?'over':'short'} by ${fmt(Math.abs(diff))}`, diff, activeCt };
  }
  return { blocked: false, diff, activeCt };
}

// ── Balance bar check — FIXED formula ────────
// When players still active: show stillInPlay, not a misleading diff
function balanceBarCheck(game, players) {
  const all        = players.filter(p => ['active','cashed','out'].includes(p.status));
  const totalIn    = rnd(all.reduce((s,p) => s + ti(p), 0));
  const allTimeOut = rnd(all.reduce((s,p) => s + totalOut(p), 0));
  const activeCt   = all.filter(p => p.status === 'active').length;
  const stillInPlay = rnd(totalIn - allTimeOut);
  // FIXED: only compute diff when fully settled
  const newDiff = activeCt === 0 ? rnd(allTimeOut - totalIn) : 0;
  return { newDiff, stillInPlay, activeCt };
}

// ── Final conservation check ──────────────────
function checkConservation(game, players, label='') {
  const totalIn   = rnd(players.reduce((s,p) => s + ti(p), 0));
  const cashedOut = rnd(players.reduce((s,p) => s + totalOut(p), 0));
  const diff = rnd(cashedOut - totalIn);
  if (Math.abs(diff) > 0.02) {
    err(game, `Conservation FAILED ${label}: totalIn=${fmt(totalIn)} cashedOut=${fmt(cashedOut)} diff=${fmt(diff)}`);
    totalConservationFails++;
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────
//  SCENARIOS
// ─────────────────────────────────────────────
const BUY_INS = [5, 10, 20, 25, 50];
const SCENARIOS = [
  // ── Original 10 ──
  'normal',           //  1  everyone cashes out at break-even
  'with-addons',      //  2  add-ons and rebuys
  'with-busts',       //  3  some bust, winner absorbs chips
  'with-reentry',     //  4  bust players re-enter (at $0 bust)
  'float-pennies',    //  5  decimal buy-ins with many add-ons
  'big-winner',       //  6  one player wins 70% of chips
  'all-bust-one',     //  7  9 bust, last absorbs everything
  'old-co-path',      //  8  tab-path also blocks over-cashout
  'close-partial',    //  9  closeSession called mid-cashout
  'multi-reentry',    // 10  player busts and re-enters 3×
  // ── 5 New edge-case scenarios ──
  'winning-reentry',  // 11  player wins, cashes $big, re-enters — prev cashout must stay tracked
  'float-micro',      // 12  50× $0.03 add-ons per player — float bleed in addOnTotal
  'negative-input',   // 13  cashout of -$5 — negative input guard
  'multi-winner-reentry', // 14  3 big winners all cash out then re-enter — compound conservation
  'balancebar-check', // 15  mid-session balance bar false-alarm when winner cashes early
];

for (let g = 1; g <= 15; g++) {
  const scenario  = SCENARIOS[g - 1];
  const defaultBI = BUY_INS[(g - 1) % BUY_INS.length];
  const players   = [];

  for (let i = 0; i < 10; i++) {
    let buyin = defaultBI;
    if (scenario === 'float-pennies') buyin = parseFloat((defaultBI + (i % 3) * 0.25).toFixed(2));
    players.push(makePlayer(i + 1, NAMES[i], buyin, i + 1));
  }

  info(`\nGame ${g} [${scenario}] defaultBI=${fmt(defaultBI)}`);

  // ─────────────────────────────────────────
  if (scenario === 'normal') {
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'with-addons') {
    for (let i = 0; i < 5; i++) addOn(players[i], defaultBI);
    addOn(players[2], defaultBI); // double add-on for Charlie
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'with-busts') {
    const busters = [players[1], players[4], players[7]];
    busters.forEach(p => bust(p));
    const bustedTotal = busters.reduce((s,p) => s + ti(p), 0);
    const active = players.filter(p => p.status === 'active');
    const winner = active[0];
    cashOut(g, players, winner, rnd(ti(winner) + bustedTotal));
    for (const p of active.filter(p => p.id !== winner.id)) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'with-reentry') {
    bust(players[0]); bust(players[1]);
    reenter(players[0], defaultBI);
    reenter(players[1], defaultBI);
    // After bust+reenter, addOnTotal should equal exactly one re-entry amount
    if (Math.abs(players[0].addOnTotal - defaultBI) > 0.001)
      err(g, `Alice addOnTotal wrong after bust+reentry: expected ${fmt(defaultBI)} got ${fmt(players[0].addOnTotal)}`);
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'float-pennies') {
    for (const p of players) addOn(p, 5.50);
    for (const p of players) addOn(p, 0.25);
    for (const p of players) {
      const expected = rnd(5.50 + 0.25);
      const actual   = rnd(p.addOnTotal);
      if (Math.abs(actual - expected) > 0.001)
        err(g, `${p.name} addOnTotal float error: expected ${expected} got ${actual}`);
    }
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'big-winner') {
    const totalChips = players.reduce((s,p) => s + ti(p), 0);
    const jack = players[9];
    cashOut(g, players, jack, rnd(totalChips * 0.7));
    const rest = players.filter(p => p.status === 'active');
    const leftover = rnd(totalChips - rnd(totalChips * 0.7));
    for (let i = 0; i < rest.length - 1; i++)
      cashOut(g, players, rest[i], rnd(leftover / rest.length));
    const last = rest[rest.length - 1];
    const tIn = rnd(players.reduce((s,p) => s + ti(p), 0));
    const aCO = rnd(players.filter(q => q.id !== last.id).reduce((s,q) => s + totalOut(q), 0));
    cashOut(g, players, last, rnd(tIn - aCO));
  }

  else if (scenario === 'all-bust-one') {
    for (let i = 0; i < 9; i++) bust(players[i]);
    const last = players[9];
    cashOut(g, players, last, rnd(players.reduce((s,p) => s + ti(p), 0)));
  }

  else if (scenario === 'old-co-path') {
    // Both try to cash out the full 2-player pot; second one gets capped to $0
    const twoPlayer = players.slice(0, 2);
    const twoTotal  = rnd(twoPlayer.reduce((s,p) => s + ti(p), 0));
    cashOut(g, players, twoPlayer[0], twoTotal); // takes entire pot
    cashOut(g, players, twoPlayer[1], twoTotal); // blocked → $0
    for (const p of players.slice(2)) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'close-partial') {
    // Winners cash 1.5× buy-in, losers cash 0.5× — then call closeSession with 5 still active
    for (const p of players.slice(0, 3)) cashOut(g, players, p, rnd(ti(p) * 1.5));
    for (const p of players.slice(3, 5)) cashOut(g, players, p, rnd(ti(p) * 0.5));
    const result = closeSessionCheck(g, players);
    if (result.blocked && result.activeCt > 0) {
      closeSessionBlocks++;
      warn(g, `closeSession STILL blocked with ${result.activeCt} active players (diff=${fmt(result.diff||0)})`);
    }
    for (const p of players.filter(p => p.status === 'active')) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'multi-reentry') {
    const charlie = players[2];
    for (let r = 0; r < 3; r++) { bust(charlie); reenter(charlie, defaultBI); }
    const expectedAddOnTotal = defaultBI * 3;
    if (Math.abs(charlie.addOnTotal - expectedAddOnTotal) > 0.001)
      err(g, `Charlie multi-reentry addOnTotal wrong: expected ${fmt(expectedAddOnTotal)} got ${fmt(charlie.addOnTotal)}`);
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  // ── NEW SCENARIOS ────────────────────────

  else if (scenario === 'winning-reentry') {
    // Alice wins the ENTIRE table, cashes out, then re-enters
    // Ensures prevCashoutTotal is tracked so the re-entry doesn't inflate 'remaining'
    const alice = players[0];
    const others = players.slice(1);
    const totalChips = rnd(players.reduce((s,p) => s + ti(p), 0)); // $50 if BI=$5
    cashOut(g, players, alice, totalChips); // alice cashes entire pot
    others.forEach(p => bust(p));           // everyone else busts at $0
    // Alice re-enters — prevCashoutTotal must preserve her $50 cashout
    reenter(alice, defaultBI);
    if (Math.abs(alice.prevCashoutTotal - totalChips) > 0.001)
      err(g, `Alice prevCashoutTotal wrong after reentry: expected ${fmt(totalChips)} got ${fmt(alice.prevCashoutTotal)}`);
    // Alice cashes her fresh stack — remaining = totalIn($55) - prevCashedOut($50) = $5
    cashOut(g, players, alice, defaultBI);
    // Conservation: totalIn=$55 (orig $50 + reentry $5), cashedOut=$55 (alice $50+$5 + 9×$0)
  }

  else if (scenario === 'float-micro') {
    // 50 × $0.03 add-ons per player — stress float accumulation
    for (const p of players) {
      for (let i = 0; i < 50; i++) addOn(p, 0.03);
    }
    for (const p of players) {
      const expected = rnd(50 * 0.03); // 1.50
      const actual   = rnd(p.addOnTotal);
      if (Math.abs(actual - expected) > 0.02)
        err(g, `${p.name} micro-addOnTotal float bleed: expected ${fmt(expected)} got ${fmt(actual)}`);
    }
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'negative-input') {
    // Attempt cashout of negative value — must be rejected, not silently applied
    const alice = players[0];
    const prevStatus = alice.status;
    cashOut(g, players, alice, -5); // should trigger err() and bail
    if (alice.status !== prevStatus)
      err(g, `Alice status changed despite negative cashout value — guard not working`);
    else
      info(`  [GAME ${g}] ✅ Negative cashout correctly rejected`);
    // Cash everyone out normally to close game
    for (const p of players) if (p.status === 'active') cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'multi-winner-reentry') {
    // Three big winners each cash out, then ALL re-enter
    // Without prevCashoutTotal fix this would inflate remaining by their combined profit
    const bigWinners  = players.slice(0, 3);
    const losers      = players.slice(3);
    const totalChips  = rnd(players.reduce((s,p) => s + ti(p), 0));
    const winnerShare = rnd(totalChips / 3);
    // Cash out 3 winners, losers bust
    for (const p of bigWinners) cashOut(g, players, p, winnerShare);
    losers.forEach(p => bust(p));
    // All 3 winners re-enter
    for (const p of bigWinners) reenter(p, defaultBI);
    // Verify prevCashoutTotal for each winner
    for (const p of bigWinners) {
      if (Math.abs(p.prevCashoutTotal - winnerShare) > 0.001)
        err(g, `${p.name} prevCashoutTotal wrong: expected ${fmt(winnerShare)} got ${fmt(p.prevCashoutTotal)}`);
    }
    // Each re-entrant cashes their new stack
    for (const p of bigWinners) cashOut(g, players, p, defaultBI);
    // Conservation: totalIn should equal all cashouts (winners' prev + new) + all busted $0s
  }

  else if (scenario === 'balancebar-check') {
    // Alice wins double her buy-in from other players; cashes early while 9 still active
    const alice = players[0];
    cashOut(g, players, alice, rnd(defaultBI * 2));
    // OLD balance bar would flag "unaccounted chips" — new formula shows stillInPlay instead
    const bbResult = balanceBarCheck(g, players);
    if (Math.abs(bbResult.newDiff) > 0.02) {
      err(g, `FIXED renderBalanceBar still shows wrong diff=${fmt(bbResult.newDiff)} — fix not working`);
    } else {
      info(`  [GAME ${g}] ✅ renderBalanceBar (NEW) correctly shows stillInPlay=${fmt(bbResult.stillInPlay)} with ${bbResult.activeCt} active`);
    }
    // Cash rest to balance
    const rest = players.filter(p => p.status === 'active');
    const tIn  = rnd(players.reduce((s,p) => s + ti(p), 0));
    for (let i = 0; i < rest.length - 1; i++)
      cashOut(g, players, rest[i], rnd((tIn - rnd(defaultBI * 2)) / rest.length));
    const last = rest[rest.length - 1];
    const aCO  = rnd(players.filter(q => q.id !== last.id).reduce((s,q) => s + totalOut(q), 0));
    cashOut(g, players, last, rnd(tIn - aCO));
  }

  // ── Conservation check (every game) ────────
  checkConservation(g, players);

  // ── Summary line ─────────────────────────
  const tIn   = rnd(players.reduce((s,p) => s + ti(p), 0));
  const tOut  = rnd(players.reduce((s,p) => s + totalOut(p), 0));
  const addCt = players.reduce((s,p) => s + p.addOns.length, 0);
  const bCt   = players.filter(p => p.cashoutAmount === 0 && p.prevCashoutTotal === 0).length;
  info(`  Players:${players.length}  AddOns:${addCt}  Busts:${bCt}  TotalIn:${fmt(tIn)}  TotalOut:${fmt(tOut)}  Diff:${fmt(rnd(tOut - tIn))}`);
}

// ─────────────────────────────────────────────
//  RESULTS
// ─────────────────────────────────────────────
console.log('═══════════════════════════════════════════');
console.log(' POKER SIMULATION — 15 SESSIONS × 10 PLAYERS');
console.log('═══════════════════════════════════════════');
log.forEach(l => console.log(l));
console.log('\n── WARNINGS ────────────────────────────────');
if (warnings.length) warnings.forEach(w => console.log(w));
else console.log('  None');
console.log('\n── ERRORS ──────────────────────────────────');
if (errors.length) errors.forEach(e => console.log(e));
else console.log('  None');
console.log('\n── SUMMARY ─────────────────────────────────');
console.log(`  Conservation failures : ${totalConservationFails}`);
console.log(`  closeSession blocks   : ${closeSessionBlocks}`);
console.log(`  Total warnings        : ${warnings.length}`);
console.log(`  Total errors          : ${errors.length}`);
console.log('═══════════════════════════════════════════');
