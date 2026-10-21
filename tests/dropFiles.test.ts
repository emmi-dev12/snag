import assert from "node:assert/strict"
import { test } from "node:test"
import { keepJson } from "../src/dropFiles.ts"

test("a drop keeps json files and sorts them by name", () => {
  const files = keepJson([
    new File(["{}"], "notes.txt", { type: "text/plain" }),
    new File(["x"], "photo.png", { type: "image/png" }),
    new File(["{}"], "hacks-2.json", { type: "application/json" }),
    new File(["{}"], "hacks-10.json", { type: "application/json" }),
    new File(["{}"], "hacks-1.json", { type: "" }),
  ])
  assert.deepEqual(
    files.map((file) => file.name),
    ["hacks-1.json", "hacks-2.json", "hacks-10.json", "notes.txt"],
  )
})
