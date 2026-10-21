import assert from "node:assert/strict"
import { test } from "node:test"
import { linkCodeStartsOpen, mergeLibraries } from "../src/sync.ts"
import type { Hack } from "../src/types.ts"

function hack(id: string, updatedAt: number, title: string): Hack {
  return {
    id,
    situation: "When the sink is leaking",
    title,
    steps: ["Shut the water off"],
    caveat: "",
    tags: [],
    verdict: "untried",
    createdAt: updatedAt,
    updatedAt,
  }
}

test("the same title collapses and the dropped card stays dropped", () => {
  const merged = mergeLibraries(
    { hacks: [hack("phone", 2, "Spoon Garlic Peeler")], removed: [] },
    { hacks: [hack("desk", 5, "Spoon Garlic Peeler")], removed: [] },
  )
  assert.deepEqual(
    merged.hacks.map((item) => item.id),
    ["desk"],
  )
  assert.equal(merged.removed.find((item) => item.id === "phone")?.at, 6)
  const again = mergeLibraries(merged, { hacks: [hack("phone", 2, "Spoon Garlic Peeler")], removed: [] })
  assert.deepEqual(
    again.hacks.map((item) => item.id),
    ["desk"],
  )
})

test("the link code opens on this computer and after this computer hands the page back", () => {
  assert.equal(linkCodeStartsOpen("127.0.0.1", "", false), true)
  assert.equal(linkCodeStartsOpen("snag-hacks.vercel.app", "#setup=abc", false), true)
  assert.equal(linkCodeStartsOpen("snag-hacks.vercel.app", "", true), true)
  assert.equal(linkCodeStartsOpen("snag-hacks.vercel.app", "", false), false)
})
