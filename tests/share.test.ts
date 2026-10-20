import assert from "node:assert/strict"
import { test } from "node:test"
import { encodeCard, parseIncoming } from "../src/incoming.ts"
import { interpretScan } from "../src/scan.ts"
import { shareHref, sharePayload } from "../src/share.ts"
import type { Hack } from "../src/types.ts"

const wine: Hack = {
  id: "h1",
  situation: "When a wine stain is still wet",
  title: "Salt, then cold water",
  steps: ["Cover the stain with a pile of salt", "Let it sit for ten minutes", "Rinse from the back with cold water"],
  caveat: "Hot water sets the stain.",
  tags: ["laundry"],
  cover: "data:image/jpeg;base64,aaaa",
  verdict: "untried",
  createdAt: 1,
  updatedAt: 1,
  source: { kind: "typed" },
}

test("a share payload drops photos", () => {
  const payload = sharePayload(wine)
  assert.equal("cover" in payload, false)
  assert.equal(payload.situation, wine.situation)
})

test("a friend can decode the share link into a card", () => {
  const href = shareHref("https://snag-hacks.vercel.app", wine)
  const hit = interpretScan(href)
  assert.equal(hit.kind, "card")
  if (hit.kind !== "card") return
  const card = new URLSearchParams(hit.hash).get("card")
  assert.ok(card)
  const hacks = parseIncoming(card ?? "")
  assert.equal(hacks[0]?.title, "Salt, then cold water")
  assert.equal(hacks[0]?.cover, undefined)
})

test("a scanned youtube link is a link, not a card", () => {
  const hit = interpretScan("https://www.youtube.com/watch?v=jNQXAC9IVRw")
  assert.equal(hit.kind, "link")
})

test("an inbox hash without a host still files", () => {
  const hash = `card=${encodeCard(sharePayload(wine))}`
  const hit = interpretScan(`https://snag-hacks.vercel.app/inbox#${hash}`)
  assert.equal(hit.kind, "card")
})

test("empty scan fails honestly", () => {
  const hit = interpretScan("   ")
  assert.equal(hit.kind, "fail")
})
