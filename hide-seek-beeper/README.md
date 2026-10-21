# Hide & Beep V5 — locked-screen notifications

## What changed
- Hiders can opt in to **Web Push** notifications for locked phones.
- When the page is foregrounded, the normal 5-second in-page sound still plays.
- When the phone is locked, the operating system may play its ordinary notification alert **instead**, not a 5-second continuous beep. Silent mode, Focus, notification permission, data connectivity and battery controls affect delivery. No app can guarantee an audible alert on all phones.
- Players remain in the server room when their screen locks and reconnect automatically after unlocking.
- The host can still spin seekers, choose hiding time, tap Go, see players, and mark found players.

## Setup (Render)
1. Upload everything from the `hide-seek-beeper` folder into your GitHub repository's `hide-seek-beeper` directory (overwrite V4 files). In Render, leave **Root Directory** = `hide-seek-beeper`, **Build Command** = `npm install`, **Start Command** = `npm start`.
2. On a computer with Node installed, run `npm install` and `npx web-push generate-vapid-keys`. Copy the public and private key outputs. You only need to generate them once; never commit the private key to GitHub.
3. In Render → your service → Environment, add:
   - `VAPID_PUBLIC_KEY` = public key generated above
   - `VAPID_PRIVATE_KEY` = private key generated above (secret)
   - `VAPID_EMAIL` = an email address you control (for the `mailto:` contact setting; optional)
4. Deploy again. Visit your HTTPS Render URL.

## Phone installation and notification permission
- **iPhone (iOS 16.4+):** Open the HTTPS link in Safari → Share → Add to Home Screen, then **open from the new Home Screen icon**, join a room, and tap **Enable lock-screen notifications**. Allow notifications when asked.
- **Android:** Open the HTTPS link in Chrome → menu → Add to Home Screen / Install app if available. Open, join a room, tap **Enable lock-screen notifications**, and allow permission.
- Lock the phone and have a seeker send a beep *after* hiding time ends. A notification may sound / show on the lock screen. Test on each device before playing.

## Notes and limits
- This is not a native background audio service. Locked screens receive **standard notifications only**; iPhone cannot play five seconds of arbitrary audio from this web push.
- Players and push subscriptions are held in server memory. Render sleeping/restarting clears rooms. Use a persistent database and hosting without sleep for production reliability. On Render free, wake-ups can delay push events or reset games.
- Each phone must opt in; the server pushes only to **current hiders**, and only when a seeker taps BEEP during seeking.
- Push requires HTTPS (Render provides this). The site never accesses GPS or precise location.
