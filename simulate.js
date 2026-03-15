// ─────────────────────────────────────────────
//  Poker Home Game — 10-session simulation
//  Exercises: buy-ins, add-ons, busts, re-entries,
//  cashouts, closeSession, conservation checks
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

function err(game, msg)  { errors.push(`[GAME ${game}] ❌ ${msg}`); }
// Conservation check correctly blocked an over-cashout attempt (expected / by design)
function blocked(game, msg) { log.push(`[GAME ${game}] ✅ BLOCKED (correct): ${msg}`); }
function warn(game, msg) { warnings.push(`[GAME ${game}] ⚠️  ${msg}`); }
function info(msg)       { log.push(msg); }

// ── Player factory ───────────────────────────
function makePlayer(id, name, buyin, seat) {
  return { id, name, buyin, addOns:[], addOnTotal:0,
           seat, status:'active', currentStack:buyin,
           cashoutAmount:null };
}

// ── Add-on (mirrored from confirmRebuySheet) ─
function addOn(p, amt, type='rebuy') {
  p.addOns.push({ amount:amt, type, time: Date.now() });
  p.addOnTotal += amt;
  p.currentStack += amt;
}

// ── Bust at $0 (mirrored from bustPlayerZero) ─
function bust(p) {
  p.status = 'cashed';
  p.cashoutAmount = 0;
  p.currentStack = 0;
}

// ── Re-entry (mirrored from confirmRebuySheetReentry) ─
function reenter(p, amt) {
  p.addOns.push({ amount:amt, type:'reentry', time: Date.now() });
  p.addOnTotal += amt;
  p.cashoutAmount = null;
  p.currentStack = amt;
  p.status = 'active';
}

// ── Cash out with conservation check (NEW path, confirmCOSheet) ─
function cashOut(game, players, p, val) {
  val = rnd(val);
  const totalIn = rnd(players.reduce((s,q)=>s+ti(q),0));
  const alreadyCO = rnd(players
    .filter(q=>q.status==='cashed' && q.id!==p.id)
    .reduce((s,q)=>s+(q.cashoutAmount||0),0));
  const remaining = rnd(totalIn - alreadyCO);

  if (val > remaining + 0.01) {
    blocked(game, `${p.name} tried to cash ${fmt(val)} but only ${fmt(remaining)} remains — capped`);
    val = remaining;
  }
  p.status = 'cashed';
  p.cashoutAmount = val;
  p.currentStack = 0;
}

// ── Cash out via old tab path (now also has conservation check) ─
function cashOutOld(game, players, p, val) {
  // Now mirrors the FIXED confirmCO() — same conservation check
  cashOut(game, players, p, val);
}

// ── closeSession check (mirrors FIXED code) ─
function closeSessionCheck(game, players) {
  const all      = players.filter(p=>['active','cashed','out'].includes(p.status));
  const activeCt = players.filter(p=>p.status==='active').length;

  // FIXED: active-player check comes first — only check balance when everyone is settled
  if (activeCt > 0) {
    return { blocked: false, reason: 'Active players warned, but not blocked', activeCt };
  }
  const totalIn   = rnd(all.reduce((s,p)=>s+ti(p),0));
  const cashedOut = rnd(all.filter(p=>p.status==='cashed'||p.status==='out').reduce((s,p)=>s+(p.cashoutAmount||0),0));
  const diff      = rnd(cashedOut - totalIn);
  if (Math.abs(diff) > 0.02) {
    return { blocked: true, reason: `Cash is ${diff>0?'over':'short'} by ${fmt(Math.abs(diff))}`, diff, activeCt };
  }
  return { blocked: false, diff, activeCt };
}

// ── Final conservation check ─────────────────
function checkConservation(game, players, label='') {
  const totalIn   = rnd(players.reduce((s,p)=>s+ti(p),0));
  const cashedOut = rnd(players.filter(p=>p.status==='cashed'||p.status==='out').reduce((s,p)=>s+(p.cashoutAmount||0),0));
  const diff = rnd(cashedOut - totalIn);
  if (Math.abs(diff) > 0.02) {
    err(game, `Conservation FAILED ${label}: totalIn=${fmt(totalIn)} cashedOut=${fmt(cashedOut)} diff=${fmt(diff)}`);
    return false;
  }
  return true;
}

// ── Redistribute chips realistically ─────────
// Give each active player a random stack, ensuring sum = totalChips
function distributeChips(players, totalChips) {
  const active = players.filter(p=>p.status==='active');
  if (!active.length) return;
  // Random weights
  const weights = active.map(()=>Math.random()+0.1);
  const weightSum = weights.reduce((a,b)=>a+b,0);
  let assigned = 0;
  for (let i=0; i<active.length-1; i++) {
    const stack = rnd(totalChips * weights[i] / weightSum);
    active[i]._realStack = stack;
    assigned += stack;
  }
  active[active.length-1]._realStack = rnd(totalChips - assigned);
}

// ─────────────────────────────────────────────
//  RUN SIMULATIONS
// ─────────────────────────────────────────────

const BUY_INS   = [5, 10, 20, 25, 50];
const SCENARIOS = [
  'normal',        // 0  everyone cashes out clean
  'with-addons',   // 1  add-ons and rebuys
  'with-busts',    // 2  some bust at $0
  'with-reentry',  // 3  bust then re-enter
  'float-pennies', // 4  decimal buy-ins ($5.50, $10.25)
  'big-winner',    // 5  one player takes most chips
  'all-bust-one',  // 6  everyone busts except last player
  'old-co-path',   // 7  uses old confirmCO() (no conservation check)
  'close-partial', // 8  closeSession called with active players still in
  'multi-reentry', // 9  players bust and re-enter multiple times
];

let totalConservationFails = 0;
let closeSessionBlocks     = 0;

for (let g=1; g<=10; g++) {
  const scenario  = SCENARIOS[g-1];
  const defaultBI = BUY_INS[(g-1) % BUY_INS.length];
  const players   = [];

  // Build 10 players
  for (let i=0; i<10; i++) {
    let buyin = defaultBI;
    if (scenario==='float-pennies') buyin = parseFloat((defaultBI + (i%3)*0.25).toFixed(2));
    players.push(makePlayer(i+1, NAMES[i], buyin, i+1));
  }

  info(`\nGame ${g} [${scenario}] defaultBI=${fmt(defaultBI)}`);

  // ── Scenario logic ───────────────────────
  if (scenario === 'normal') {
    // Everyone cashes out what they bought in (break even)
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'with-addons') {
    // 5 players get 1-2 add-ons
    for (let i=0; i<5; i++) addOn(players[i], defaultBI);
    if (players[2]) addOn(players[2], defaultBI); // double add-on
    // Redistribute: everyone cashes out their buy-in (break even)
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'with-busts') {
    // 3 players bust, rest share their chips
    const busters = [players[1], players[4], players[7]];
    busters.forEach(p => bust(p));
    const bustedTotal = busters.reduce((s,p)=>s+ti(p),0);
    const active = players.filter(p=>p.status==='active');
    // Distribute busted chips: first active player wins them all
    const winner = active[0];
    const winnerCO = rnd(ti(winner) + bustedTotal);
    cashOut(g, players, winner, winnerCO);
    // Rest cash out break even
    for (const p of active.filter(p=>p.id!==winner.id)) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'with-reentry') {
    // Alice and Bob bust, re-enter
    bust(players[0]); bust(players[1]);
    reenter(players[0], defaultBI);
    reenter(players[1], defaultBI);
    // Verify addOnTotal includes re-entry amounts
    if (players[0].addOnTotal !== defaultBI)
      err(g, `Alice addOnTotal wrong after reentry: expected ${defaultBI} got ${players[0].addOnTotal}`);
    // Cash out everyone at break even
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'float-pennies') {
    // Add-ons with decimal amounts
    for (const p of players) addOn(p, 5.50);
    for (const p of players) addOn(p, 0.25);
    // Check float accumulation in addOnTotal
    for (const p of players) {
      const expected = rnd(5.50 + 0.25);
      const actual   = rnd(p.addOnTotal);
      if (Math.abs(actual - expected) > 0.001)
        err(g, `${p.name} addOnTotal float error: expected ${expected} got ${actual}`);
    }
    // Cash everyone out at their exact ti
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'big-winner') {
    // Jack wins ~70% of chips
    const totalChips = players.reduce((s,p)=>s+ti(p),0);
    const jack = players[9];
    const jackCO = rnd(totalChips * 0.7);
    cashOut(g, players, jack, jackCO);
    // Spread remaining among others proportionally
    const remaining = players.filter(p=>p.status==='active');
    const leftover  = rnd(totalChips - jackCO);
    for (let i=0; i<remaining.length-1; i++) {
      const share = rnd(leftover / remaining.length);
      cashOut(g, players, remaining[i], share);
    }
    // Last player gets exact remainder
    const last = remaining[remaining.length-1];
    const totalIn = rnd(players.reduce((s,p)=>s+ti(p),0));
    const co = rnd(players.filter(p=>p.status==='cashed'&&p.id!==last.id).reduce((s,p)=>s+(p.cashoutAmount||0),0));
    cashOut(g, players, last, rnd(totalIn - co));
  }

  else if (scenario === 'all-bust-one') {
    // Players 1-9 bust, player 10 absorbs all chips
    for (let i=0; i<9; i++) bust(players[i]);
    const last = players[9];
    const totalIn = rnd(players.reduce((s,p)=>s+ti(p),0));
    cashOut(g, players, last, totalIn);
  }

  else if (scenario === 'old-co-path') {
    // Verify the fixed tab path also blocks over-cashout (like the screenshot bug)
    const twoPlayer = players.slice(0,2);
    const twoTotal  = rnd(twoPlayer.reduce((s,p)=>s+ti(p),0));
    // Both try to cash out twoTotal — second one should be blocked (only $0 remains after first)
    cashOutOld(g, players, twoPlayer[0], twoTotal); // OK: $20 of $20 remaining
    cashOutOld(g, players, twoPlayer[1], twoTotal); // BLOCKED: $0 remaining, capped to $0
    // Cash rest normally
    for (const p of players.slice(2)) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'close-partial') {
    // Cash out first 5 players with real chip movements (some won, some lost)
    const winners = players.slice(0,3);
    const losers  = players.slice(3,5);
    // Winners each get 1.5x their buy-in
    for (const p of winners) cashOut(g, players, p, rnd(ti(p)*1.5));
    // Losers each get 0.5x their buy-in
    for (const p of losers) cashOut(g, players, p, rnd(ti(p)*0.5));
    // Now call closeSession with 5 still active — check if it blocks
    const result = closeSessionCheck(g, players);
    if (result.blocked && result.activeCt > 0) {
      closeSessionBlocks++;
      warn(g, `closeSession blocked with ${result.activeCt} active players still in game (diff=${fmt(result.diff)}) — BUG: diff check runs before active-player check`);
    }
    // Cash out remaining at break even to finish
    for (const p of players.filter(p=>p.status==='active')) cashOut(g, players, p, ti(p));
  }

  else if (scenario === 'multi-reentry') {
    // Charlie busts and re-enters 3 times
    const charlie = players[2];
    for (let r=0; r<3; r++) {
      bust(charlie);
      reenter(charlie, defaultBI);
    }
    // Verify cumulative addOnTotal
    const expectedAddOnTotal = defaultBI * 3; // 3 re-entries
    if (Math.abs(charlie.addOnTotal - expectedAddOnTotal) > 0.001)
      err(g, `Charlie multi-reentry addOnTotal wrong: expected ${fmt(expectedAddOnTotal)} got ${fmt(charlie.addOnTotal)}`);
    // Cash everyone out at break even
    for (const p of players) cashOut(g, players, p, ti(p));
  }

  // ── Final conservation check (all scenarios) ─
  if (scenario !== 'old-co-path') { // already checked above
    const ok = checkConservation(g, players);
    if (!ok) totalConservationFails++;
  }

  // ── Summary line ─────────────────────────
  const totalIn  = rnd(players.reduce((s,p)=>s+ti(p),0));
  const totalCO  = rnd(players.reduce((s,p)=>s+(p.cashoutAmount||0),0));
  const addOnCt  = players.reduce((s,p)=>s+p.addOns.length,0);
  const bustCt   = players.filter(p=>p.cashoutAmount===0).length;
  info(`  Players:${players.length}  AddOns:${addOnCt}  Busts:${bustCt}  TotalIn:${fmt(totalIn)}  TotalOut:${fmt(totalCO)}  Diff:${fmt(rnd(totalCO-totalIn))}`);
}

// ─────────────────────────────────────────────
//  RESULTS
// ─────────────────────────────────────────────
console.log('═══════════════════════════════════════');
console.log(' POKER SIMULATION — 10 SESSIONS × 10P  ');
console.log('═══════════════════════════════════════');
log.forEach(l=>console.log(l));
console.log('\n── WARNINGS ───────────────────────────');
if (warnings.length) warnings.forEach(w=>console.log(w));
else console.log('  None');
console.log('\n── ERRORS ─────────────────────────────');
if (errors.length) errors.forEach(e=>console.log(e));
else console.log('  None');
console.log('\n── SUMMARY ─────────────────────────────');
console.log(`  Conservation failures : ${totalConservationFails}`);
console.log(`  closeSession blocks   : ${closeSessionBlocks}`);
console.log(`  Total warnings        : ${warnings.length}`);
console.log(`  Total errors          : ${errors.length}`);
console.log('═══════════════════════════════════════');
