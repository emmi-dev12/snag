# Snag sync

The app is at <https://snag-hacks.vercel.app>. `snag.vercel.app` was already taken. Vercel hosts the app. The computer you leave on keeps the cabinet, in `data/library.json`. There is no account and no hosted database.

On that computer, `npm start` listens at `http://127.0.0.1:8787`. The first run makes a token and saves it in `data/server.json`. Snag opens a public https address for the other device and, the first time that address is ready, opens the app so this computer connects. The address and token are not typed in.

The sync page shows a code. Scan it on the other device. The code carries the address and the token in the link hash, so the token is not sent to Vercel. `/setup` answers only on this computer, so the public address does not reveal the token.

If ngrok is installed and logged in, that public address is the account's ngrok dev domain, and Snag starts the tunnel. A page on Vercel can reach it. If ngrok is not there and Tailscale is running, Snag serves the cabinet at `https://<this-machine>.<tailnet>.ts.net:8443/sync`. That port is separate from anything already served on port 443. The other device then needs Tailscale turned on.

`http://` is accepted only for this computer. Other devices need the https address.
