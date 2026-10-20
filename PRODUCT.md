# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Someone who installs Snag on their own phone or computer and keeps lifehacks there. There is no account. A week later they are either in the moment ("wine on a shirt") or checking which hacks worked.

## Product Purpose

Snag keeps a lifehack as a situation you can find again, then open into the procedure. Success is a card you can follow with one hand, mark as worked or failed, and still have next week, on the device that saved it.

## Positioning

A hack arrives as words from a link, a clip, or an agent, and Needle on the device turns those words into steps. The link reader does not store the card. One computer keeps the cabinet file. Snag connects to it on its own, and the other device scans a code. There is no Snag account. A neighboring recipe saver that keeps an account and a library in its own cloud cannot truthfully copy that.

## Operating Context

The person pastes a YouTube, Instagram, Facebook, or other link, attaches a video or audio file, types a hack, or lets an agent open a local link. YouTube captions are the fast path. Whistle, on the device, listens when the words are in a file instead. The cabinet is searched by the moment and filtered by untried, worked, or failed. Desktop and phone, installed as a PWA.

## Capabilities and Constraints

- The name is Snag. The verb is snag a hack.
- A collapsed card shows one photo of the thing when one exists, a short description, and the title. Opening it shows the procedure.
- YouTube hashtags in the title or description become tags on the draft.
- A YouTube link also brings the public preview photo, and the few stills YouTube publishes beside it, as pictures the person can keep or drop.
- When the procedure is a sequence of images, the person attaches the video file. Snag samples frames on the device and offers them as pictures to include. It does not download the video file to a server.
- An agent files a card by opening `{origin}/inbox#card=` plus a base64url JSON payload. The hash never hits the server. The card waits in the inbox to keep or discard.
- Each open card can show a QR of that same inbox link. Photos are not in the code. A friend scans it in Snag on phone or computer. Camera, or a photo of the code.
- A stateless `/api/source` read fetches a public page once so the words, hashtags, and preview photo can come back. It does not store the card. Say that a link is fetched. Do not say nothing is uploaded.
- The page a hack came from has its own Link field. The open card shows that URL. An empty link clears it. The situation stays the moment, not the address.
- Cards live in IndexedDB on each device. The cabinet file lives on the computer they leave on. Snag connects to that computer on its own. The address and token are not typed in. No Snag account.
- The other device scans the code on the sync page. Vercel hosts the app. It does not keep the cabinet. When sync is on, say that the cards, including photos, go to that computer.
- Copy is English.
- The app is at https://snag-hacks.vercel.app. snag.vercel.app was already taken. Vercel hosts the pages. The cabinet file stays on the computer that is left on.

## Brand Commitments

The name Snag is confirmed. Voice is plain and specific: name the moment, the step, and what went wrong. No account, no feed.

## Evidence on Hand

The working app is at `/Users/mh/snag`. Real checks already made: a wine-stain paragraph becomes steps on the device; the zoo video "Me at the zoo" does not invent a hack; an agent sample card round-trips through the inbox hash; a private address is refused by the link reader. A typed card keeps its link on the open card, separate from the situation. Two browsers sync that card through the local sync server, including an edit, an undo, and a delete. Instagram and Facebook login walls are an honest warning, not a scraped post. There are no testimonials, customers, or usage numbers. Do not invent them.

## Product Principles

- The moment is the handle. Search finds "when", and the title names the thing.
- The procedure stays on the device until the person points Snag at their own backend.
- If the source has no procedure, leave a blank draft. Do not invent steps.
- A picture is included only when the person keeps it.
- A verdict is a mark, not a ranking. Untried, worked, and failed do not reorder the cabinet.

## Accessibility & Inclusion

The interface is used on a phone with one hand and on a desktop with a keyboard. Targets stay at least 44px, text meets WCAG AA contrast, and motion respects reduced-motion. No separate legal standard was named.
