# Bogonko ROSCA — Installable App

A complete, installable Progressive Web App (PWA) for the Bogonko-Ngelani Stage
Welfare Programme: contributions, cycle management, members, payouts, reports,
settings, and a member self-service portal.

## What's included
- `index.html` — splash / entry screen
- `login.html`, `dashboard.html`, `contributions.html`, `cycle.html`,
  `members.html`, `payout.html`, `reports.html`, `settings.html`,
  `member-portal.html` — app screens
- `manifest.json` — makes the app installable ("Add to Home Screen" /
  desktop install)
- `sw.js` — service worker for offline caching
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — app icons

## Deploy (GitHub + Vercel)
1. Push this folder to a GitHub repo.
2. Import the repo in Vercel — no build step needed, it's static HTML.
   Set the output/root directory to this folder if it's not the repo root.
3. Once deployed, open the Vercel URL on a phone.

## Install on Android
Open the deployed URL in Chrome → menu (⋮) → **Add to Home screen** / **Install app**.

## Install on iPhone
Open the deployed URL in Safari → Share button → **Add to Home Screen**.

## Install on Windows/desktop
Open the deployed URL in Chrome or Edge → click the install icon (⊕) in the
address bar → **Install**.

## Notes
- The app works offline after the first visit — the service worker caches
  all pages and icons.
- To force everyone to pick up new updates after you edit files, bump the
  `CACHE_NAME` value at the top of `sw.js` (e.g. `bogonko-rosca-v2`).

## Backend: Firebase (new dedicated project)
Data now lives in Firestore and syncs across every device. Set it up once:

1. **Create the project** — [console.firebase.google.com](https://console.firebase.google.com)
   → Add project → name it (e.g. `bogonko-rosca`) → create.
2. **Add a Web app** — Project settings (gear icon) → General → "Your apps"
   → Web (`</>`) → register it → copy the `firebaseConfig` object it shows you.
3. **Paste that config into `firebase-config.js`** in this folder, replacing
   the `PASTE_...` placeholders in `BOGONKO_FIREBASE_CONFIG`.
4. **Enable Firestore** — Build → Firestore Database → Create database →
   start in production mode → pick a region close to Kenya (e.g.
   `europe-west1`).
5. **Enable Authentication** — Build → Authentication → Get started →
   enable the **Email/Password** sign-in method. (Anonymous sign-in is
   not used — every member gets a real account, so there's nothing else
   to enable here.)
6. **Create the admin account** — Authentication → Users → Add user →
   any email (e.g. `admin@bogonko.local`) + a real password. This is what
   you log in with on `login.html` as the admin.
7. **Copy the admin's UID** — click the new user in the Users list, copy
   the UID shown.
8. **Paste the UID in two places**:
   - `BOGONKO_ADMIN_UID` in `firebase-config.js`
   - the `"PASTE_ADMIN_UID_HERE"` string in `firestore.rules`
9. **Publish the security rules** — Firestore Database → Rules tab →
   paste the contents of `firestore.rules` → Publish.
10. Deploy as usual (push to GitHub, Vercel picks it up) and open the URL.

**How member accounts work**: when you add someone in Members, the app
automatically creates a real Firebase login for them behind the scenes —
their phone number doubles as both their ID and their password, so they
just type their number on the login screen and tap Login, nothing else.
This means a member's own phone number is enough to sign in as them, so
it's not a strong secret — but it's a real per-person account, and no
one outside the roster can read anything at all. Ask if you'd rather add
a separate PIN per member later.

**One limitation to know about**: removing someone in Members deletes
their Firestore record, but *not* their login account — Firebase doesn't
allow deleting other users' accounts from client-side code without a
paid Cloud Functions backend. If someone leaves the group, delete their
account manually in Firebase Console → Authentication → Users too.

### Still on localStorage / not yet wired to Firestore
`reports.html`, `settings.html`, and `member-portal.html` still render
placeholder/static data — that's the next piece of work.
