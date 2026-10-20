# Snag

Lifehacks als Karten. Kein Account. Der Schrank bleibt auf deinem Computer.

Live: **https://snag-hacks.vercel.app** (`snag.vercel.app` war schon vergeben)

DE · [EN](README.en.md)

## Was es tut

- Link (YouTube und andere öffentliche Seiten), Text, Audio/Video, oder ein Agent
- Needle auf dem Gerät macht daraus Schritte
- Cabinet: untried / worked / failed
- Ein Computer hält `data/library.json`. Das andere Gerät scannt den Code auf der Sync-Seite
- Vom Telefon: YouTube-Link in Snag teilen

## Was es nicht tut

- Kein Snag-Account, keine Cloud-Bibliothek von uns
- Vercel hostet nur die App, nicht den Schrank
- Instagram/Facebook hinter Login: ehrliche Warnung, kein Scrape
- Keine erfundenen Schritte, wenn die Quelle keine hat

## Sync

Auf dem Computer, der anbleibt:

```
npm install
npm start
```

Läuft auf `http://127.0.0.1:8787`. Token und Schrank liegen in `data/` (nicht im Repo).

Snag öffnet selbst eine öffentliche HTTPS-Adresse (ngrok, sonst Tailscale `:8443`). Adresse und Token tippt niemand. Der Code auf `/sync` trägt sie im Hash — nicht zu Vercel.

## Agent

Karte ablegen:

`{origin}/inbox#card=` plus base64url-JSON. Der Hash geht nie an den Server. Inbox: behalten oder wegwerfen.

## Entwickeln

```
npm install
npm run dev
npm start
```

Tests: `node --test sync/library.test.mjs`

PWA: Home-Bildschirm. Nach Updates Safari Hold-Reload.
