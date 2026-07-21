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

  // ---------- Day classification ----------
  // 'future' — that calendar date hasn't happened yet, nothing can be
  //            recorded for it in advance.
  // 'today'  — the live day. Fully editable both ways; this is also the
  //            only day that can never be auto-closed (a day can't
  //            complete before it ends).
  // 'past'   — already elapsed. Late payments can still be marked Paid,
  //            but a Paid entry can never be reverted to Pending.
  function dayStatus(cycle, day) {
    if (!cycle.startISO) return 'today';
    const dateISO = dayToDateISO(cycle, day);
    const today = todayISO();
    if (dateISO > today) return 'future';
    if (dateISO < today) return 'past';
    return 'today';
  }

  // ---------- Automatic day closure ----------
  // If real time has moved past the cycle's current day and the admin
  // never recorded that day's payout, close it automatically: whatever
  // was actually marked "Paid" up to now becomes the final payout, and
  // the cycle advances to the next day/recipient. Handles multiple
  // missed days in one pass (e.g. the app wasn't opened for a week).
  //
  // Safe to call from any page, any time — it's a no-op unless a day has
  // genuinely elapsed unclosed. Firestore rules only allow the admin UID
  // to write, so if this runs during a member's session the write simply
  // fails and is silently skipped; it'll be picked up next time the admin
  // has the app open.
  async function autoCloseElapsedDays() {
    let cycle = await getCycle();
    if (!cycle.startISO || cycle.currentDay < 1 || cycle.completed) return cycle;

    const today = todayISO();
    let guard = 0; // hard cap so a very stale/misconfigured cycle can't loop forever
    while (!cycle.completed && dayToDateISO(cycle, cycle.currentDay) < today && guard < 400) {
      guard++;
      if (await isDayClosed(cycle.number, cycle.currentDay)) {
        cycle = await getCycle();
        continue;
      }

      let membersPaid = 0, collectedAmount = 0;
      try {
        const members = await getMembers();
        const statusMap = await getContributionsForDay(cycle.number, cycle.currentDay);
        membersPaid = members.filter(m => statusMap[m.docId] === 'Paid').length;
        collectedAmount = membersPaid * (cycle.dailyContribution || 0);
      } catch (e) { /* fall back to 0/0 below */ }

      try {
        cycle = await recordPayoutAndAdvance({
          recipientLabel: `Position #${cycle.currentDay}`,
          amount: collectedAmount,
          collectedAmount,
          membersPaid,
          autoClosed: true
        });
      } catch (e) {
        // Not an admin session (or offline) — can't write. Stop; this will
        // retry next time an admin loads the app.
        break;
      }
    }
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
    dayStatus,
    autoCloseElapsedDays,
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
