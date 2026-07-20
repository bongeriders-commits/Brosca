/*
 * Bogonko ROSCA — shared app state (Firestore-backed).
 *
 * Replaces the old localStorage stand-in. Data now lives in the
 * project's Firestore database and is shared across every device —
 * the admin's phone and every member's phone see the same cycle,
 * payout history, member list, and daily contributions.
 *
 * Every function that touches storage is now async — call sites must
 * `await` it. Requires firebase-config.js, the Firebase compat SDK
 * <script> tags, and firebase-init.js to be loaded first.
 *
 * Firestore layout:
 *   meta/cycle                        — the single current cycle doc
 *   payouts/{cycleNumber}_{day}       — one immutable doc per closed day
 *   members/{autoId}                  — one doc per group member
 *   contributions/{cycleNumber}_{day}_{memberId} — one doc per member per day
 */
const BogonkoState = (function () {
  const db = () => BogonkoFirebase.db;

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  function dayToDateISO(cycle, day) {
    if (!cycle.startISO) return null;
    return addDays(cycle.startISO, day - 1);
  }

  function dateISOToDay(cycle, iso) {
    if (!cycle.startISO) return null;
    const [sy, sm, sd] = cycle.startISO.split('-').map(Number);
    const [y, m, d] = iso.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const target = new Date(y, m - 1, d);
    const diffDays = Math.round((target - start) / 86400000);
    return diffDays + 1;
  }

  function emptyCycle() {
    return {
      number: 0,
      year: new Date().getFullYear(),
      startISO: null,
      duration: 0,
      totalMembers: 0,
      dailyContribution: 0,
      currentDay: 0
    };
  }

  // ---------- Phone-based member accounts ----------
  // Canonicalizes any phone format a member/admin might type (0712345678,
  // +254712345678, 254712345678, with spaces/dashes) into "254712345678"
  // so login always matches the number used when the account was created.
  function normalizePhone(phone) {
    let digits = (phone || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '254' + digits.slice(1);
    else if (!digits.startsWith('254') && digits.length === 9) digits = '254' + digits;
    return digits;
  }

  // Firebase Auth needs an email-shaped identifier; members never see this,
  // they only ever type their phone number.
  function phoneToEmail(phone) {
    return normalizePhone(phone) + '@bogonko-rosca.local';
  }

  // ---------- Cycle ----------

  async function getCycle() {
    const snap = await db().collection('meta').doc('cycle').get();
    return snap.exists ? snap.data() : emptyCycle();
  }

  async function saveCycle(cycle) {
    await db().collection('meta').doc('cycle').set(cycle);
  }

  // ---------- Payouts (immutable once written) ----------

  async function getPayoutRecord(cycleNumber, day) {
    const snap = await db().collection('payouts').doc(cycleNumber + '_' + day).get();
    return snap.exists ? snap.data() : null;
  }

  async function isDayClosed(cycleNumber, day) {
    const record = await getPayoutRecord(cycleNumber, day);
    return !!record;
  }

  // Records today's payout as permanent, then advances the cycle to the
  // next day (or marks the cycle complete if this was the last day).
  // Returns the updated cycle.
  async function recordPayoutAndAdvance(record) {
    const cycle = await getCycle();
    if (!cycle.startISO || cycle.currentDay < 1) {
      throw new Error('No active cycle.');
    }
    if (await isDayClosed(cycle.number, cycle.currentDay)) {
      // Already recorded (e.g. a duplicate click) — don't double-advance.
      return cycle;
    }

    const payoutDoc = Object.assign(
      {
        cycleNumber: cycle.number,
        day: cycle.currentDay,
        dateISO: addDays(cycle.startISO, cycle.currentDay - 1),
        completedAt: new Date().toISOString()
      },
      record
    );
    await db().collection('payouts').doc(cycle.number + '_' + cycle.currentDay).set(payoutDoc);

    if (cycle.currentDay < cycle.duration) {
      cycle.currentDay += 1;
    } else {
      cycle.currentDay = cycle.duration; // cycle complete, holds at last day
      cycle.completed = true;
    }
    await saveCycle(cycle);
    return cycle;
  }

  // Starts a brand-new cycle (Cycle 1, or the next one after the previous
  // one finished). Past cycles' payout history is untouched — it's
  // already immutable in the `payouts` collection.
  async function startCycle({ duration, totalMembers, dailyContribution }) {
    const prev = await getCycle();
    const cycle = {
      number: prev.number + 1,
      year: new Date().getFullYear(),
      startISO: todayISO(),
      duration: Number(duration),
      totalMembers: Number(totalMembers),
      dailyContribution: Number(dailyContribution),
      currentDay: 1,
      completed: false
    };
    await saveCycle(cycle);
    return cycle;
  }

  // ---------- Members ----------

  async function getMembers() {
    const snap = await db().collection('members').orderBy('order').get();
    return snap.docs.map(d => Object.assign({ docId: d.id }, d.data()));
  }

  function watchMembers(callback) {
    return db().collection('members').orderBy('order').onSnapshot(snap => {
      callback(snap.docs.map(d => Object.assign({ docId: d.id }, d.data())));
    });
  }

  async function addMember(member) {
    const withNormalized = Object.assign({}, member, { phoneNormalized: normalizePhone(member.phone) });
    const ref = await db().collection('members').add(withNormalized);
    return ref.id;
  }

  async function updateMember(docId, changes) {
    await db().collection('members').doc(docId).update(changes);
  }

  async function removeMember(docId) {
    await db().collection('members').doc(docId).delete();
  }

  // Used by the member portal after sign-in to load the matching profile.
  async function findMemberByPhone(phone) {
    const target = normalizePhone(phone);
    const snap = await db().collection('members')
      .where('phoneNormalized', '==', target)
      .get();
    return snap.empty ? null : Object.assign({ docId: snap.docs[0].id }, snap.docs[0].data());
  }

  // ---------- Daily contributions ----------

  function contribDocId(cycleNumber, day, memberDocId) {
    return cycleNumber + '_' + day + '_' + memberDocId;
  }

  // Returns a map of memberDocId -> 'Paid' | 'Pending' for the given day.
  async function getContributionsForDay(cycleNumber, day) {
    const snap = await db().collection('contributions')
      .where('cycleNumber', '==', cycleNumber)
      .where('day', '==', day)
      .get();
    const map = {};
    snap.docs.forEach(d => { map[d.data().memberDocId] = d.data().status; });
    return map;
  }

  async function setContribution(cycleNumber, day, memberDocId, status) {
    await db().collection('contributions').doc(contribDocId(cycleNumber, day, memberDocId)).set({
      cycleNumber, day, memberDocId, status, updatedAt: new Date().toISOString()
    });
  }

  return {
    todayISO,
    dayToDateISO,
    dateISOToDay,
    normalizePhone,
    phoneToEmail,
    getCycle,
    saveCycle,
    isDayClosed,
    getPayoutRecord,
    recordPayoutAndAdvance,
    startCycle,
    getMembers,
    watchMembers,
    addMember,
    updateMember,
    removeMember,
    findMemberByPhone,
    getContributionsForDay,
    setContribution
  };
})();
