import assert from "node:assert/strict"
import { test } from "node:test"
import { parseIncoming, splitIncoming } from "../src/incoming.ts"
import type { Hack } from "../src/types.ts"

test("chatgpt aliases and a hacks array import as many cards", () => {
  const raw = JSON.stringify({
    hacks: [
      {
        when: "When rice sticks to the pot",
        name: "Soak, then steam",
        instructions: ["Take it off the heat", "Splash in a little water", "Cover for five minutes"],
        warning: "Don't scrape while it's dry.",
        topics: ["kitchen"],
      },
      {
        situation: "When a wine stain is still wet",
        title: "Salt, then cold water",
        steps: ["Cover the stain with salt", "Wait ten minutes", "Rinse with cold water"],
        caveat: "Hot water sets it.",
        tags: ["laundry"],
      },
    ],
  })
  const hacks = parseIncoming(raw, { maxLength: 400_000 })
  assert.equal(hacks.length, 2)
  assert.equal(hacks[0]?.title, "Soak, then steam")
  assert.equal(hacks[0]?.steps.length, 3)
  assert.match(hacks[0]?.caveat ?? "", /scrape/)
  assert.equal(hacks[1]?.title, "Salt, then cold water")
})

test("a matching title updates the drawer and leaves a new title waiting", () => {
  const saved = {
    id: "kept",
    situation: "When a jar lid is too slippery to open",
    title: "Rubber Band Jar Opener",
    steps: ["Twist"],
    caveat: "",
    tags: ["jars"],
    verdict: "worked",
    createdAt: 1,
    updatedAt: 1,
  } satisfies Hack
  const incoming = parseIncoming(
    JSON.stringify({
      hacks: [
        { situation: "When a jar lid is too slippery to open", title: "Rubber Band Jar Opener", steps: ["Wrap a band", "Twist"], category: "kitchen" },
        { situation: "When you need a coin", title: "Dedicated Trolley Coin", steps: ["Keep a coin"], category: "shopping" },
      ],
    }),
    { maxLength: 400_000 },
  )
  const { updates, fresh } = splitIncoming([saved], incoming, 50)
  assert.equal(updates.length, 1)
  assert.equal(updates[0]?.id, "kept")
  assert.equal(updates[0]?.verdict, "worked")
  assert.equal(updates[0]?.category, "kitchen")
  assert.equal(updates[0]?.updatedAt, 50)
  assert.equal(fresh.length, 1)
  assert.equal(fresh[0]?.title, "Dedicated Trolley Coin")
})

test("a shared card keeps its photos", () => {
  const shot = `data:image/jpeg;base64,${"a".repeat(40)}`
  const raw = JSON.stringify({
    hacks: [{ situation: "When you need to remove the skin from garlic", title: "Spoon Garlic Peeler", steps: ["Take a garlic clove", "Scrape with a spoon"], cover: shot, pictures: [shot, ""] }],
  })
  const [hack] = parseIncoming(raw, { maxLength: 400_000 })
  assert.equal(hack?.cover, shot)
  assert.deepEqual(hack?.pictures, [shot])
})

test("a drawer alias becomes the category", () => {
  const raw = JSON.stringify({
    situation: "When the sink is leaking",
    title: "Shut the water",
    steps: ["Turn the valve"],
    drawer: "Home repair",
  })
  const [hack] = parseIncoming(raw, { maxLength: 400_000 })
  assert.equal(hack?.category, "home repair")
})

test("numbered steps in one string still split", () => {
  const raw = JSON.stringify({
    when: "When the zipper sticks",
    name: "Soap the teeth",
    how: "1. Rub a dry soap bar on the teeth\n2. Work the slider\n3. Wipe the extra soap",
  })
  const [hack] = parseIncoming(raw, { maxLength: 400_000 })
  assert.equal(hack?.steps.length, 3)
  assert.match(hack?.steps[0] ?? "", /soap/i)
})

test("json lines import several hacks", () => {
  const raw = [
    JSON.stringify({ when: "When shoes are wet", name: "Newspaper", steps: ["Stuff with paper", "Leave overnight"] }),
    JSON.stringify({ when: "When garlic smells on hands", name: "Steel", steps: ["Rub fingers on stainless steel under water"] }),
  ].join("\n")
  const hacks = parseIncoming(raw, { maxLength: 400_000 })
  assert.equal(hacks.length, 2)
})

test("empty json fails honestly", () => {
  assert.throws(() => parseIncoming("{}", { maxLength: 400_000 }), /No hacks/)
})
