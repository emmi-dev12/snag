import { randomBytes, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const KEY = "snag:library"
const MAX_BODY = 8_000_000
const MAX_HACKS = 400
const MAX_REMOVED = 500

const KINDS = new Set(["youtube", "instagram", "facebook", "web", "agent", "file", "typed"])
const TEXT_KINDS = new Set(["transcript", "caption", "page", "speech"])

export function emptyLibrary() {
  return { hacks: [], removed: [] }
}

export function mergeLibraries(local, remote) {
  const removed = new Map()
  for (const item of [...(local.removed ?? []), ...(remote.removed ?? [])]) {
    if (!item || typeof item.id !== "string" || typeof item.at !== "number") continue
    const prev = removed.get(item.id)
    if (!prev || item.at > prev.at) removed.set(item.id, { id: item.id, at: item.at })
  }
  const hacks = new Map()
  for (const hack of [...(local.hacks ?? []), ...(remote.hacks ?? [])]) {
    if (!hack || typeof hack.id !== "string") continue
    const tomb = removed.get(hack.id)
    if (tomb && tomb.at >= hack.updatedAt) continue
    const prev = hacks.get(hack.id)
    if (!prev || hack.updatedAt >= prev.updatedAt) hacks.set(hack.id, hack)
  }
  return {
    hacks: [...hacks.values()],
    removed: [...removed.values()].slice(-MAX_REMOVED),
  }
}

function asText(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function httpUrl(value) {
  if (typeof value !== "string" || !value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString()
  } catch {
    return undefined
  }
  return undefined
}

function image(value) {
  if (typeof value !== "string" || value.length > 280_000) return undefined
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(value)
  if (!match) return undefined
  const body = match[2].replace(/\s+/g, "")
  if (body.length < 32) return undefined
  return `data:image/${match[1].toLowerCase()};base64,${body}`
}

function stamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e15 ? value : 0
}

export function sanitizeHack(raw) {
  if (!raw || typeof raw !== "object") return null
  const id = typeof raw.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id) ? raw.id : ""
  if (!id) return null
  const situation = asText(raw.situation, 180)
  const title = asText(raw.title, 80)
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((step) => asText(step, 220)).filter(Boolean).slice(0, 12)
  if (!situation && !title && steps.length === 0) return null
  const tags = []
  const seen = new Set()
  for (const tag of Array.isArray(raw.tags) ? raw.tags : []) {
    const clean = asText(tag, 24).replace(/^#/, "").toLowerCase()
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    tags.push(clean)
    if (tags.length === 8) break
  }
  const pictures = []
  for (const value of Array.isArray(raw.pictures) ? raw.pictures : []) {
    const shot = image(value)
    if (!shot || pictures.includes(shot)) continue
    pictures.push(shot)
    if (pictures.length === 8) break
  }
  const cover = image(raw.cover)
  const source = raw.source && typeof raw.source === "object" ? raw.source : undefined
  const kind = source && KINDS.has(source.kind) ? source.kind : undefined
  const url = httpUrl(source?.url) || httpUrl(raw.link)
  const label = source ? asText(source.label, 80) : ""
  const textKind = source && TEXT_KINDS.has(source.textKind) ? source.textKind : undefined
  const createdAt = stamp(raw.createdAt) || Date.now()
  const updatedAt = stamp(raw.updatedAt) || createdAt
  const triedAt = stamp(raw.triedAt)
  const verdict = raw.verdict === "worked" || raw.verdict === "failed" ? raw.verdict : "untried"
  const hack = {
    id,
    situation: situation || title,
    title: title || situation,
    steps,
    caveat: asText(raw.caveat, 240),
    tags,
    verdict,
    createdAt,
    updatedAt,
  }
  if (cover) hack.cover = cover
  if (pictures.length) hack.pictures = pictures
  if (kind || url || label) {
    hack.source = { kind: kind || (url ? "web" : "typed") }
    if (url) hack.source.url = url
    if (label) hack.source.label = label
    if (textKind) hack.source.textKind = textKind
  }
  if (triedAt) hack.triedAt = triedAt
  return hack
}

export function sanitizeLibrary(raw) {
  const hacks = []
  const seen = new Set()
  for (const item of Array.isArray(raw?.hacks) ? raw.hacks : []) {
    const hack = sanitizeHack(item)
    if (!hack || seen.has(hack.id)) continue
    seen.add(hack.id)
    hacks.push(hack)
    if (hacks.length === MAX_HACKS) break
  }
  const removed = []
  for (const item of Array.isArray(raw?.removed) ? raw.removed : []) {
    if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)) continue
    const at = stamp(item.at)
    if (!at) continue
    removed.push({ id: item.id, at })
    if (removed.length === MAX_REMOVED) break
  }
  return { hacks, removed }
}

function tokenOk(header, expected) {
  const match = /^Bearer\s+(\S+)$/.exec(header || "")
  if (!match || !expected) return false
  const got = Buffer.from(match[1])
  const want = Buffer.from(expected)
  if (got.length !== want.length) {
    timingSafeEqual(randomBytes(got.length), randomBytes(got.length))
    return false
  }
  return timingSafeEqual(got, want)
}

function dataFile() {
  return process.env.SNAG_DATA || new URL("../data/library.json", import.meta.url).pathname
}

async function readFileLibrary() {
  try {
    return sanitizeLibrary(JSON.parse(await readFile(dataFile(), "utf8")))
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyLibrary()
    throw error
  }
}

async function writeFileLibrary(library) {
  const file = dataFile()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(library))
  await rename(temp, file)
}

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ""), token }
}

function hostedWithoutStore() {
  return Boolean(process.env.VERCEL || process.env.RENDER) && !upstash()
}

async function upstashCommand(command) {
  const redis = upstash()
  const response = await fetch(redis.url, {
    method: "POST",
    headers: { authorization: `Bearer ${redis.token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.error || "Upstash refused the library.")
  }
  return payload.result
}

async function readLibrary() {
  if (upstash()) {
    const result = await upstashCommand(["GET", KEY])
    if (!result) return emptyLibrary()
    return sanitizeLibrary(JSON.parse(result))
  }
  return readFileLibrary()
}

async function writeLibrary(library) {
  const json = JSON.stringify(library)
  if (json.length > MAX_BODY) {
    const error = new Error("The cabinet is too big for one sync.")
    error.status = 413
    throw error
  }
  if (upstash()) {
    await upstashCommand(["SET", KEY, json])
    return
  }
  await writeFileLibrary(library)
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, ngrok-skip-browser-warning",
  "access-control-allow-private-network": "true",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
}

function reply(status, body) {
  return { status, body, headers: { ...cors, "content-type": "application/json; charset=utf-8" } }
}

export async function handleSync({ method, authorization, body }) {
  if (method === "OPTIONS") return { status: 204, body: null, headers: cors }
  if (method !== "GET" && method !== "PUT") return reply(405, { ok: false, error: "Use GET or PUT." })
  const expected = process.env.SYNC_TOKEN || ""
  if (!expected) return reply(503, { ok: false, error: "Set SYNC_TOKEN on the backend before syncing." })
  if (!tokenOk(authorization, expected)) return reply(401, { ok: false, error: "That token was refused." })
  if (hostedWithoutStore()) {
    return reply(503, { ok: false, error: "This host forgets its disk. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN." })
  }
  try {
    if (method === "GET") return reply(200, { ok: true, ...(await readLibrary()) })
    if (typeof body === "string" && body.length > MAX_BODY) return reply(413, { ok: false, error: "That sync is too big." })
    const parsed = typeof body === "string" ? JSON.parse(body || "{}") : body
    const merged = mergeLibraries(await readLibrary(), sanitizeLibrary(parsed))
    await writeLibrary(merged)
    return reply(200, { ok: true, ...merged })
  } catch (error) {
    const status = error && error.status === 413 ? 413 : 500
    const message = status === 413 ? "That sync is too big." : "The library could not be saved."
    return reply(status, { ok: false, error: message })
  }
}
