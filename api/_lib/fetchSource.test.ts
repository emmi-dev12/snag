import assert from "node:assert/strict"
import { test } from "node:test"
import { instagramCode, sourceResponse, youtubeId } from "./fetchSource.ts"

test("youtube ids from watch, short, and share links", () => {
  assert.equal(youtubeId(new URL("https://www.youtube.com/watch?v=jNQXAC9IVRw")), "jNQXAC9IVRw")
  assert.equal(youtubeId(new URL("https://youtu.be/jNQXAC9IVRw")), "jNQXAC9IVRw")
  assert.equal(youtubeId(new URL("https://www.youtube.com/shorts/jNQXAC9IVRw")), "jNQXAC9IVRw")
  assert.equal(youtubeId(new URL("https://www.youtube.com/embed/jNQXAC9IVRw")), "jNQXAC9IVRw")
})

test("instagram codes from post, reel, and share paths", () => {
  assert.equal(instagramCode(new URL("https://www.instagram.com/p/CqKj8x8I0AA/")), "CqKj8x8I0AA")
  assert.equal(instagramCode(new URL("https://www.instagram.com/reel/CqKj8x8I0AA/")), "CqKj8x8I0AA")
  assert.equal(instagramCode(new URL("https://www.instagram.com/share/reel/CqKj8x8I0AA/")), "CqKj8x8I0AA")
})

test("private addresses are refused", async () => {
  const result = await sourceResponse("http://127.0.0.1/")
  assert.equal(result.status, 400)
  assert.equal(result.body.ok, false)
  if (result.body.ok) throw new Error("expected failure")
  assert.match(result.body.error, /private address/)
})

test("the zoo video keeps its title and does not invent a hack", async () => {
  const result = await sourceResponse("https://www.youtube.com/watch?v=jNQXAC9IVRw")
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  if (!result.body.ok) throw new Error("expected source")
  assert.match(result.body.source.title, /zoo/i)
  assert.equal(result.body.source.kind, "youtube")
})

test("instagram login walls stay a warning, not a scrape", async () => {
  const result = await sourceResponse("https://www.instagram.com/p/CqKj8x8I0AA/")
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  if (!result.body.ok) throw new Error("expected source")
  assert.equal(result.body.source.kind, "instagram")
  assert.equal(result.body.source.text, "")
  assert.match(result.body.source.warning ?? "", /Instagram didn't share/)
})

test("facebook login walls stay a warning, not a scrape", async () => {
  const result = await sourceResponse("https://www.facebook.com/watch/?v=10153231379946729")
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  if (!result.body.ok) throw new Error("expected source")
  assert.equal(result.body.source.kind, "facebook")
  assert.equal(result.body.source.text, "")
  assert.match(result.body.source.warning ?? "", /Facebook didn't share/)
  assert.equal(result.body.source.title.includes("views"), false)
})

test("instagram stories are refused honestly", async () => {
  const result = await sourceResponse("https://www.instagram.com/stories/example/123/")
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  if (!result.body.ok) throw new Error("expected source")
  assert.match(result.body.source.warning ?? "", /stories aren't public/)
})
