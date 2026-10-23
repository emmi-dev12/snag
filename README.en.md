# Snag

Lifehacks as cards. No account. The cabinet stays on your computer.

Live: **https://snag-hacks.vercel.app** (`snag.vercel.app` was taken)

[DE](README.md) · EN

## What it does

- A public link (YouTube and others), typed text, audio/video, or an agent
- Needle on the device turns words into steps
- Cabinet: untried / worked / failed, and a filter for each category
- An open card keeps the current step above the bottom bar. Back and Next walk the procedure. The last step marks Worked or Failed. Left and right arrow keys do the same.
- One computer keeps `data/library.json`. The other device scans the code on the sync page
- On a phone: share a YouTube link into Snag
- Each card can show a QR code. Friends scan it in Snag. With the cabinet computer on, the photos come with the card. Share several makes one code for a bunch of cards.
- Inbox: drop or import a JSON file of many hacks (`hacks`, an array, or JSON Lines). Copy the ChatGPT prompt so it replies with that JSON

## What it does not

- No Snag account, no library in our cloud
- Vercel hosts the app, not the cabinet
- Instagram/Facebook login walls: an honest warning, not a scrape
- No invented steps when the source has none

## Sync

On the computer you leave on:

```
npm install
npm start
```

Listens at `http://127.0.0.1:8787`. Token and cabinet live in `data/` (not in the repo).

Snag opens a public https address itself (ngrok, or Tailscale `:8443`). Nobody types the address or token. The `/sync` code carries them in the link hash — not to Vercel.

## Agent

File a card at `{origin}/inbox#card=` plus base64url JSON. The hash never hits the server. Keep or discard in the inbox.

## Develop

```
npm install
npm run dev
npm start
```

Tests: `node --test sync/library.test.mjs`
