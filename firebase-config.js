/*
 * Bogonko ROSCA — Firebase project configuration.
 *
 * Fill these in from Firebase Console → Project settings → General →
 * "Your apps" → Web app → SDK setup and configuration → Config.
 * These values are safe to ship in client code (they identify the
 * project, they are not secrets) — access control is enforced by
 * Firestore Security Rules and Firebase Auth, not by hiding this file.
 */
const BOGONKO_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCM5e4jp-7TUElKxwhdmTlR2lQC93BGWws",
  authDomain: "rosca-cdc6c.firebaseapp.com",
  projectId: "rosca-cdc6c",
  storageBucket: "rosca-cdc6c.firebasestorage.app",
  messagingSenderId: "900856469501",
  appId: "1:900856469501:web:b27b432fa3a873c8aa2b94"
};

/*
 * Paste the UID of the admin account here after you create it in
 * Firebase Console → Authentication → Users → Add user.
 * This UID is what Firestore Security Rules check against to decide
 * who is allowed to write (add members, record payouts, close days,
 * etc). Everyone else — including anonymous member sessions — gets
 * read-only access.
 */
const BOGONKO_ADMIN_UID = "NTdaL18pnfRTVAqcUKXtPW7IMe42";
