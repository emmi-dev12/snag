import assert from "node:assert/strict"
import { test } from "node:test"
import { parseIncoming } from "../src/incoming.ts"

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
