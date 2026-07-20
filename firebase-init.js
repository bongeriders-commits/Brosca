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

// Keep Firestore usable offline (matches the app's existing offline-first
// PWA behavior from the service worker).
BogonkoFirebase.db.enablePersistence({ synchronizeTabs: true }).catch(() => {
  // Multiple tabs open, or browser doesn't support it — app still works,
  // just without offline cache in that tab.
});
