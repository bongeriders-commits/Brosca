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
- If this app doesn't yet have a backend (Firebase, etc.) wired in, contributions/
  member data won't persist between devices — pages currently render static/demo
  data except where `localStorage` is used (`login.html`, `member-portal.html`).
