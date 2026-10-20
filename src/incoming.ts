import type { Hack, HackDraft, HackSource, SourceKind } from "./types.ts"
import { cleanDraft, coerceHack, safeHttpUrl } from "./cards.ts"
import { putPending } from "./db.ts"

const SAMPLE: HackDraft & { source: HackSource } = {
  situation: "When a wine stain is still wet",
  title: "Salt, then cold water",
  steps: ["Cover the stain with a pile of salt", "Let it sit for ten minutes", "Rinse from the back with cold water"],
  caveat: "Hot water sets the stain.",
  tags: ["laundry"],
  source: { kind: "agent", label: "sample" },
}

function fnv(text: string) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function decodePayload(raw: string) {
  const text = decodeURIComponent(raw).trim()
  if (text.startsWith("{") || text.startsWith("[")) return JSON.parse(text) as unknown
  const padded = text.replace(/-/g, "+").replace(/_/g, "/")
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
  const draft = coerceHack(value)
  if (!draft) return null
  const clean = cleanDraft(draft)
  if (!clean.situation) return null
  let source = value && typeof value === "object" ? sourceOf((value as { source?: unknown }).source) : undefined
  if (value && typeof value === "object") {
    const record = value as { url?: unknown; link?: unknown }
    const extra = safeHttpUrl(typeof record.url === "string" ? record.url : undefined)
      || safeHttpUrl(typeof record.link === "string" ? record.link : undefined)
    if (extra && !source?.url) source = { ...(source ?? { kind: "agent" }), url: extra }
  }
  const stamp = Date.now()
  const id = `p_${fnv(JSON.stringify({ ...clean, source }))}`
  return {
    ...clean,
    title: clean.title || clean.situation,
    id,
    source: source ?? { kind: "agent" },
    verdict: "untried",
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export function parseIncoming(raw: string) {
  if (raw.length > 20000) {
    throw new Error("That filing is too long. Send the card, not the transcript.")
  }
  const data = decodePayload(raw)
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { cards?: unknown }).cards)
      ? (data as { cards: unknown[] }).cards
      : [data]
  const hacks = list.map(toPending).filter((item): item is Hack => item !== null)
  if (!hacks.length) throw new Error("That link didn't contain a hack.")
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

const ERROR_KEY = "snag.incomingError"

function takeHash() {
  const raw = new URLSearchParams(window.location.hash.slice(1)).get("card")
  if (!raw) return ""
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
  return raw
}

let chain = Promise.resolve()

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
