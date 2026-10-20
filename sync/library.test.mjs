import assert from "node:assert/strict"
import { request as httpRequest } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createSyncServer } from "./server.mjs"
import { handleSync, mergeLibraries } from "./library.mjs"

function hack(id, updatedAt, title = id) {
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
    source: { kind: "web", url: "https://example.com/sink" },
  }
}

test("a newer edit wins, and a later delete stays deleted", () => {
  const merged = mergeLibraries(
    { hacks: [hack("a", 2, "local")], removed: [] },
    { hacks: [hack("a", 1, "remote"), hack("b", 3)], removed: [{ id: "a", at: 4 }] },
  )
  assert.deepEqual(merged.hacks.map((item) => item.id), ["b"])
  assert.equal(merged.removed[0].id, "a")
})

test("an edit after a delete brings the card back", () => {
  const merged = mergeLibraries(
    { hacks: [hack("a", 5, "edited")], removed: [] },
    { hacks: [], removed: [{ id: "a", at: 4 }] },
  )
  assert.equal(merged.hacks[0].title, "edited")
})

test("the http server syncs only with the token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snag-sync-"))
  process.env.SNAG_DATA = join(dir, "library.json")
  process.env.SYNC_TOKEN = "desk-token"
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  delete process.env.VERCEL
  delete process.env.RENDER
  const server = createSyncServer()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  const endpoint = `http://127.0.0.1:${port}/sync`
  const headers = { authorization: "Bearer desk-token", "content-type": "application/json" }
  try {
    const refused = await fetch(endpoint, { headers: { authorization: "Bearer no" } })
    assert.equal(refused.status, 401)
    const put = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ hacks: [hack("a", 1)], removed: [] }) })
    const saved = await put.json()
    assert.equal(put.status, 200)
    assert.equal(saved.hacks[0].source.url, "https://example.com/sink")
    const got = await fetch(endpoint, { headers })
    const library = await got.json()
    assert.equal(library.hacks.length, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
    delete process.env.SNAG_DATA
  }
})

function raw(port, host, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      const chunks = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    req.on("error", reject)
    req.end()
  })
}

test("setup is only offered to this computer", async () => {
  process.env.SNAG_NO_SHARE = "1"
  process.env.SYNC_TOKEN = "desk-token"
  delete process.env.SNAG_SYNC_URL
  const server = createSyncServer({ port: 8787 })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  try {
    const local = await raw(port, `127.0.0.1:${port}`, "/setup")
    const body = JSON.parse(local.body)
    assert.equal(local.status, 200)
    assert.equal(body.token, "desk-token")
    assert.equal(body.endpoint, "http://127.0.0.1:8787/sync")
    const remote = await raw(port, "macmin.example.ts.net", "/setup")
    assert.equal(remote.status, 404)
    assert.equal(remote.body.includes("desk-token"), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    delete process.env.SNAG_NO_SHARE
  }
})

test("a host with no disk refuses a file library", async () => {
  const previous = process.env.VERCEL
  process.env.SYNC_TOKEN = "desk-token"
  process.env.VERCEL = "1"
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  try {
    const result = await handleSync({ method: "GET", authorization: "Bearer desk-token", body: "" })
    assert.equal(result.status, 503)
    assert.match(result.body.error, /UPSTASH_REDIS_REST_URL/)
  } finally {
    if (previous == null) delete process.env.VERCEL
    else process.env.VERCEL = previous
  }
})
