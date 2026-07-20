/*
 * Bogonko ROSCA — Firebase initialization.
 * Loaded after firebase-config.js and the Firebase compat SDK <script>
 * tags. Exposes `BogonkoFirebase.auth` and `BogonkoFirebase.db` for
 * every other script (bogonko-state.js, page scripts) to use.
 */
firebase.initializeApp(BOGONKO_FIREBASE_CONFIG);

const BogonkoFirebase = {
  auth: firebase.auth(),
  db: firebase.firestore(),
  adminUid: BOGONKO_ADMIN_UID
};

// Offline support intentionally removed: every read/write goes straight
// to the server. Simpler and easier to debug — no local cache that can
// disagree with what security rules actually allow.
