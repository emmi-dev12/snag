import type { Hack, HackDraft, HackSource, SourceKind } from "./types.ts"
import { cleanCategory, cleanDraft, coerceHack, safeHttpUrl } from "./cards.ts"
import { listHacks, putHack, putPending } from "./db.ts"
import { scheduleSync } from "./sync.ts"

const SAMPLE: HackDraft & { source: HackSource } = {
  situation: "When a wine stain is still wet",
  title: "Salt, then cold water",
  steps: ["Cover the stain with a pile of salt", "Let it sit for ten minutes", "Rinse from the back with cold water"],
  caveat: "Hot water sets the stain.",
  tags: ["laundry"],
  category: "laundry",
  source: { kind: "agent", label: "sample" },
}

const HASH_LIMIT = 20_000
const FILE_LIMIT = 400_000
const HACK_LIMIT = 80

function fnv(text: string) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function firstString(record: Record<string, unknown>, keys: string[], max: number) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").trim().slice(0, max)
  }
  return ""
}

function asSteps(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((step) => (typeof step === "string" ? step.replace(/^\s*(?:\d+[\).:-]|[-*•])\s*/, "").replace(/\s+/g, " ").trim() : ""))
      .filter(Boolean)
      .slice(0, 12)
  }
  if (typeof value !== "string") return []
  return value
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[\).:-]|[-*•])\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12)
}

function asTags(value: unknown) {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;]/) : []
  return parts.map((tag) => (typeof tag === "string" ? tag.replace(/^#/, "").trim() : "")).filter(Boolean)
}

export function flattenIncoming(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw
  const record = raw as Record<string, unknown>
  const nested = record.source && typeof record.source === "object" && !Array.isArray(record.source) ? (record.source as Record<string, unknown>) : {}
  const canonical = typeof record.situation === "string" && Array.isArray(record.steps)
  if (canonical) {
    const url =
      safeHttpUrl(typeof record.url === "string" ? record.url : undefined) ||
      safeHttpUrl(typeof record.link === "string" ? record.link : undefined) ||
      safeHttpUrl(typeof nested.url === "string" ? nested.url : undefined)
    const category = cleanCategory(firstString(record, ["category", "drawer", "group"], 24))
    return { ...record, ...(url ? { url, link: url } : {}), ...(category ? { category } : {}) }
  }
  const situation = firstString(record, ["situation", "when", "moment", "use_when", "useWhen", "for"], 180)
  const title = firstString(record, ["title", "name", "hack", "summary", "headline"], 80)
  const steps = asSteps(record.steps ?? record.instructions ?? record.procedure ?? record.actions ?? record.how)
  const caveat = firstString(record, ["caveat", "warning", "watch_out", "watchOut", "gotcha", "dont", "don't", "note"], 240)
  const tags = asTags(record.tags ?? record.topics ?? record.labels)
  const category = cleanCategory(firstString(record, ["category", "drawer", "group"], 24))
  const url =
    safeHttpUrl(typeof record.url === "string" ? record.url : undefined) ||
    safeHttpUrl(typeof record.link === "string" ? record.link : undefined) ||
    safeHttpUrl(typeof nested.url === "string" ? nested.url : undefined)
  const label = firstString({ ...nested, ...record }, ["label", "author", "from"], 80)
  if (!situation && !title && !steps.length) return raw
  return {
    situation: situation || title,
    title: title || situation,
    steps,
    caveat,
    tags,
    ...(category ? { category } : {}),
    ...(url ? { url, link: url } : {}),
    source: {
      kind: "agent",
      ...(label ? { label } : {}),
      ...(url ? { url } : {}),
    },
  }
}

function parseJsonLines(text: string) {
  const rows: unknown[] = []
  if (!text.includes("\n") || !text.includes("{")) return null
  for (const line of text.split("\n")) {
    const item = line.trim()
    if (!item || (!item.startsWith("{") && !item.startsWith("["))) continue
    try {
      rows.push(JSON.parse(item) as unknown)
    } catch {
      /* skip a bad line */
    }
  }
  return rows.length ? rows : null
}

function decodePayload(raw: string) {
  const text = raw.trim()
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      const lines = parseJsonLines(text)
      if (lines) return lines
      throw new Error("That isn't JSON Snag can read.")
    }
  }
  const rows = parseJsonLines(text)
  if (rows) return rows
  const padded = decodeURIComponent(text).replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function sourceOf(value: unknown): HackSource | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const kinds: SourceKind[] = ["youtube", "instagram", "facebook", "web", "agent", "file", "typed"]
  const kind = kinds.find((item) => item === record.kind) ?? "agent"
  const url = safeHttpUrl(typeof record.url === "string" ? record.url : undefined)
  const label = typeof record.label === "string" ? record.label.slice(0, 80) : undefined
  return { kind, url, label }
}

function toPending(value: unknown): Hack | null {
  const flat = flattenIncoming(value)
  const draft = coerceHack(flat)
  if (!draft) return null
  const clean = cleanDraft(withPictures(flat, draft))
  if (!clean.situation) return null
  let source = flat && typeof flat === "object" ? sourceOf((flat as { source?: unknown }).source) : undefined
  if (flat && typeof flat === "object") {
    const record = flat as { url?: unknown; link?: unknown }
    const extra =
      safeHttpUrl(typeof record.url === "string" ? record.url : undefined) ||
      safeHttpUrl(typeof record.link === "string" ? record.link : undefined)
    if (extra && !source?.url) source = { ...(source ?? { kind: "agent" }), url: extra }
  }
  if (!source) source = { kind: "agent", label: "JSON" }
  const stamp = Date.now()
  const id = `p_${fnv(JSON.stringify({ ...clean, source }))}`
  return {
    ...clean,
    title: clean.title || clean.situation,
    id,
    source,
    verdict: "untried",
    createdAt: stamp,
    updatedAt: stamp,
  }
}

function withPictures(flat: unknown, draft: HackDraft): HackDraft {
  if (!flat || typeof flat !== "object") return draft
  const record = flat as { cover?: unknown; pictures?: unknown }
  const cover = typeof record.cover === "string" ? record.cover : ""
  const pictures = Array.isArray(record.pictures) ? record.pictures.filter((item): item is string => typeof item === "string") : []
  return {
    ...draft,
    ...(cover ? { cover } : {}),
    ...(pictures.length ? { pictures } : {}),
  }
}

function listFrom(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>
    for (const key of ["hacks", "cards", "items", "lifehacks", "entries"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[]
    }
  }
  return [data]
}

export function splitIncoming(existing: Hack[], incoming: Hack[], now = Date.now()) {
  const byTitle = new Map(existing.map((hack) => [hack.title.trim().toLowerCase(), hack]))
  const updates: Hack[] = []
  const fresh: Hack[] = []
  for (const item of incoming) {
    const key = item.title.trim().toLowerCase()
    const prev = byTitle.get(key)
    if (!prev) {
      fresh.push(item)
      continue
    }
    const next: Hack = {
      ...prev,
      situation: item.situation || prev.situation,
      steps: item.steps.length ? item.steps : prev.steps,
      caveat: item.caveat,
      tags: item.tags.length ? item.tags : prev.tags,
      updatedAt: now,
    }
    if (item.category) next.category = item.category
    if (item.cover) next.cover = item.cover
    if (item.pictures?.length) next.pictures = item.pictures
    if (item.source?.url) next.source = { ...(prev.source ?? { kind: "agent" }), url: item.source.url }
    updates.push(next)
    byTitle.set(key, next)
  }
  return { updates, fresh }
}

export function parseIncoming(raw: string, options?: { maxLength?: number }) {
  const maxLength = options?.maxLength ?? HASH_LIMIT
  if (raw.length > maxLength) {
    throw new Error("That filing is too long. Send the cards, not the transcript.")
  }
  let data: unknown
  try {
    data = decodePayload(raw)
  } catch {
    throw new Error("That isn't JSON Snag can read.")
  }
  const hacks = listFrom(data)
    .map(toPending)
    .filter((item): item is Hack => item !== null)
  if (!hacks.length) throw new Error("No hacks in that JSON. Need a when/situation or title, and steps.")
  if (hacks.length > HACK_LIMIT) throw new Error(`That file has more than ${HACK_LIMIT} hacks. Split it.`)
  return hacks
}

export function encodeCard(card: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(card))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function sampleCard() {
  return SAMPLE
}

export function sampleHash() {
  return `card=${encodeCard(SAMPLE)}&n=${Date.now()}`
}

export function sampleJson() {
  return `${JSON.stringify(
    {
      hacks: [
        SAMPLE,
        {
          when: "When rice sticks to the pot",
          name: "Soak, then steam",
          steps: ["Take it off the heat", "Splash in a little water", "Cover for five minutes"],
          warning: "Don't scrape while it's dry.",
          tags: ["kitchen"],
          drawer: "kitchen",
        },
      ],
    },
    null,
    2,
  )}\n`
}

const ERROR_KEY = "snag.incomingError"

function takeHash() {
  const raw = new URLSearchParams(window.location.hash.slice(1)).get("card")
  if (!raw) return ""
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
  return raw
}

let chain = Promise.resolve()

export async function fileShared(raw: string) {
  const items = parseIncoming(raw, { maxLength: 6_000_000 })
  const { updates, fresh } = splitIncoming(await listHacks(), items)
  for (const hack of updates) await putHack(hack)
  if (fresh.length) await putPending(fresh)
  if (updates.length) scheduleSync()
  return { updates: updates.length, fresh: fresh.length }
}

export function takeSharedUrl() {
  const raw = new URLSearchParams(window.location.hash.slice(1)).get("fetch")
  if (!raw) return ""
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && url.protocol !== "http:") return ""
    if (!/^\/(?:card|pack)\/[A-Za-z0-9_-]{1,80}$/.test(url.pathname)) return ""
    return `${url.origin}${url.pathname}`
  } catch {
    return ""
  }
}

export function persistIncoming() {
  const raw = takeHash()
  if (!raw) return chain
  try {
    const items = parseIncoming(raw)
    sessionStorage.removeItem(ERROR_KEY)
    chain = chain.then(() => putPending(items))
  } catch (error) {
    const message = error instanceof Error ? error.message : "That link didn't contain a hack."
    sessionStorage.setItem(ERROR_KEY, message)
  }
  return chain
}

export function takeIncomingError() {
  const message = sessionStorage.getItem(ERROR_KEY)
  if (message) sessionStorage.removeItem(ERROR_KEY)
  return message
}

export { FILE_LIMIT }
