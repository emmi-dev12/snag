import assert from "node:assert/strict"
import { test } from "node:test"
import { chatgptPrompt } from "../src/agentCopy.ts"

test("the chatgpt prompt asks for one pasteable json of every hack", () => {
  const prompt = chatgptPrompt()
  assert.match(prompt, /every lifehack in this conversation/)
  assert.match(prompt, /Reply with the JSON only/)
  assert.match(prompt, /No code fence/)
  assert.match(prompt, /"hacks"/)
  assert.match(prompt, /"category": "kitchen"/)
  assert.match(prompt, /Snag filters by that name/)
  assert.match(prompt, /That isn't JSON Snag can read/)
  assert.match(prompt, /Do not put a backslash/)
  assert.match(prompt, /first character of your reply is \{/)
  assert.match(prompt, /At most 80 hacks/)
  assert.match(prompt, /https:\/\/example\.com\/page/)
  assert.match(prompt, /Clicking Computer shows only the computer hacks/)
  assert.match(prompt, /updates that card/)
  assert.equal(prompt.includes("BASE64URL"), false)
  const named = chatgptPrompt(["Kitchen", "computer", "computer"])
  assert.match(named, /Drawers already in this cabinet: computer, kitchen/)
})
