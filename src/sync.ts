import { cleanDraft, coerceHack, safeHttpUrl } from "./cards.ts"
import * as db from "./db.ts"
import type { Hack, HackSource, Removal, SourceKind, TextKind, Verdict } from "./types.ts"

const SETTINGS = "snag.sync"
const MAX_BODY = 8_000_000
const kinds: SourceKind[] = ["youtube", "instagram", "facebook", "web", "agent", "file", "typed"]
const textKinds: TextKind[] = ["transcript", "caption", "page", "speech"]

export type SyncSettings = { endpoint: string; token: string; share?: string }

type Library = { hacks: Hack[]; removed: Removal[] }

export type SyncResult = { ok: boolean; message: string }

let onChange: () => void = () => {}
let inflight: Promise<SyncResult> | null = null
let queued = false
let timer = 0

export function bindSync(listener: () => void) {
  onChange = listener
  const wake = () => {
    if (document.visibilityState === "hidden") return
    scheduleSync()
  }
  window.addEventListener("focus", wake)
  document.addEventListener("visibilitychange", wake)
  return () => {
    window.removeEventListener("focus", wake)
    document.removeEventListener("visibilitychange", wake)
    onChange = () => {}
  }
}

export function readSettings(): SyncSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS) || "") as { endpoint?: unknown; token?: unknown; share?: unknown }
    const share = typeof raw.share === "string" ? raw.share.trim() : ""
    return {
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : "",
      token: typeof raw.token === "string" ? raw.token : "",
      ...(share ? { share } : {}),
    }
  } catch {
    return { endpoint: "", token: "" }
  }
}

export function writeSettings(settings: SyncSettings) {
  const share = settings.share?.trim() || ""
  localStorage.setItem(SETTINGS, JSON.stringify({
    endpoint: settings.endpoint.trim(),
    token: settings.token.trim(),
    ...(share ? { share } : {}),
  }))
}

function decodeSetup(raw: string): SyncSettings | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/")
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { endpoint?: unknown; token?: unknown }
    if (typeof parsed.endpoint !== "string" || typeof parsed.token !== "string") return null
    if (endpointError(parsed.endpoint) || !parsed.token.trim()) return null
    return { endpoint: parsed.endpoint.trim(), token: parsed.token.trim() }
  } catch {
    return null
  }
}

export function readSetupHash() {
  const hash = window.location.hash
  if (!hash.startsWith("#setup=")) return null
  return decodeSetup(decodeURIComponent(hash.slice("#setup=".length)))
}

export function clearSetupHash() {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
}

export function encodeSetup(settings: { endpoint: string; token: string }) {
  const bytes = new TextEncoder().encode(JSON.stringify({ endpoint: settings.endpoint, token: settings.token }))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function discoverDesk(): Promise<SyncSettings | null> {
  try {
    const response = await fetch("http://127.0.0.1:8787/setup", { cache: "no-store", signal: AbortSignal.timeout(1500) })
    if (!response.ok) return null
    const body = (await response.json()) as { token?: unknown; endpoint?: unknown; share?: unknown }
    if (typeof body.token !== "string" || typeof body.endpoint !== "string") return null
    if (endpointError(body.endpoint) || !body.token.trim()) return null
    const share = typeof body.share === "string" && !endpointError(body.share) ? body.share.trim() : ""
    return { endpoint: body.endpoint, token: body.token.trim(), ...(share ? { share } : {}) }
  } catch {
    return null
  }
}

function onThisComputer() {
  const host = window.location.hostname
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]"
}

export function linkCodeStartsOpen(host: string, hash: string, deskReachable: boolean) {
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]"
  return local || hash.startsWith("#setup=") || deskReachable
}

export async function prepareSync() {
  const paired = readSetupHash()
  if (paired) {
    writeSettings(paired)
    clearSetupHash()
  }
  const desk = await discoverDesk()
  if (!desk) return
  if (onThisComputer()) {
    writeSettings(desk)
    return
  }
  // A public page cannot call this computer's loopback. Use the https address it opened.
  if (desk.share) writeSettings({ endpoint: desk.share, token: desk.token, share: desk.share })
}

export function endpointError(value: string) {
  const text = value.trim()
  if (!text) return "Add the backend address."
  try {
    const url = new URL(text)
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    if (url.protocol === "https:") return ""
    if (url.protocol === "http:" && local) return ""
    return "Use an https address."
  } catch {
    return "That address is not a URL."
  }
}

function stamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e15 ? value : 0
}

export function acceptHack(raw: unknown): Hack | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(record.id) ? record.id : ""
  if (!id) return null
  const draft = coerceHack(record)
  if (!draft) return null
  const sourceRecord = record.source && typeof record.source === "object" ? (record.source as Record<string, unknown>) : undefined
  const url = safeHttpUrl(typeof sourceRecord?.url === "string" ? sourceRecord.url : undefined)
    || safeHttpUrl(typeof record.link === "string" ? record.link : undefined)
  const kind = kinds.find((item) => item === sourceRecord?.kind)
  const textKind = textKinds.find((item) => item === sourceRecord?.textKind)
  const label = typeof sourceRecord?.label === "string" ? sourceRecord.label.replace(/\s+/g, " ").trim().slice(0, 80) : ""
  const clean = cleanDraft({
    ...draft,
    cover: typeof record.cover === "string" ? record.cover : undefined,
    pictures: Array.isArray(record.pictures) ? record.pictures.filter((item): item is string => typeof item === "string") : undefined,
    ...(url ? { link: url } : {}),
  })
  const fields = { ...clean }
  delete fields.link
  const createdAt = stamp(record.createdAt) || Date.now()
  const updatedAt = stamp(record.updatedAt) || createdAt
  const triedAt = stamp(record.triedAt)
  const verdict: Verdict = record.verdict === "worked" || record.verdict === "failed" ? record.verdict : "untried"
  const source: HackSource | undefined = kind || url || label
    ? {
        kind: kind ?? "web",
        ...(url ? { url } : {}),
        ...(label ? { label } : {}),
        ...(textKind ? { textKind } : {}),
      }
    : undefined
  return {
    ...fields,
    title: clean.title || clean.situation,
    id,
    verdict,
    createdAt,
    updatedAt,
    ...(source ? { source } : {}),
    ...(triedAt ? { triedAt } : {}),
  }
}

function acceptRemoval(raw: unknown): Removal | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as { id?: unknown; at?: unknown }
  if (typeof record.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id)) return null
  const at = stamp(record.at)
  return at ? { id: record.id, at } : null
}

export function mergeLibraries(local: Library, remote: Library): Library {
  const removed = new Map<string, Removal>()
  for (const item of [...local.removed, ...remote.removed]) {
    const prev = removed.get(item.id)
    if (!prev || item.at > prev.at) removed.set(item.id, item)
  }
  const hacks = new Map<string, Hack>()
  for (const hack of [...local.hacks, ...remote.hacks]) {
    const tomb = removed.get(hack.id)
    if (tomb && tomb.at >= hack.updatedAt) continue
    const prev = hacks.get(hack.id)
    if (!prev || hack.updatedAt >= prev.updatedAt) hacks.set(hack.id, hack)
  }
  collapseSameTitles(hacks, removed)
  return { hacks: [...hacks.values()], removed: [...removed.values()].slice(-500) }
}

function collapseSameTitles(hacks: Map<string, Hack>, removed: Map<string, Removal>) {
  const groups = new Map<string, Hack[]>()
  for (const hack of hacks.values()) {
    const key = hack.title.trim().toLowerCase()
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(hack)
    else groups.set(key, [hack])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    let winner = group[0]
    if (!winner) continue
    for (const hack of group.slice(1)) {
      const newer = hack.updatedAt > winner.updatedAt
      const tieCover = hack.updatedAt === winner.updatedAt && !winner.cover && hack.cover
      if (newer || tieCover) winner = hack
    }
    for (const hack of group) {
      if (hack.id === winner.id) continue
      hacks.delete(hack.id)
      const at = Math.max(hack.updatedAt || 0, winner.updatedAt || 0) + 1
      const prev = removed.get(hack.id)
      if (!prev || at > prev.at) removed.set(hack.id, { id: hack.id, at })
    }
  }
}

async function localLibrary(): Promise<Library> {
  const [hacks, removed] = await Promise.all([db.listHacks(), db.listRemovals()])
  return { hacks, removed }
}

function syncHeaders(settings: SyncSettings) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${settings.token}`,
    "content-type": "application/json",
  }
  try {
    if (new URL(settings.endpoint).hostname.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "1"
  } catch {
    // endpointError reports a bad address before a request is sent.
  }
  return headers
}

async function runSync(): Promise<SyncResult> {
  const settings = readSettings()
  const problem = endpointError(settings.endpoint)
  if (problem || !settings.token) return { ok: false, message: problem || "Add the token from the backend." }
  const headers = syncHeaders(settings)
  let response: Response
  try {
    response = await fetch(settings.endpoint, { headers, cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(70_000) })
  } catch {
    return { ok: false, message: "Could not reach that backend. If it is waking up, try again in a minute." }
  }
  const remoteRaw = await response.json().catch(() => null) as { ok?: boolean; error?: string; hacks?: unknown; removed?: unknown } | null
  if (response.status === 401) return { ok: false, message: "That backend refused the token." }
  if (!response.ok || !remoteRaw || !Array.isArray(remoteRaw.hacks)) {
    return { ok: false, message: remoteRaw?.error || "That backend did not answer with a library." }
  }
  const remote: Library = {
    hacks: remoteRaw.hacks.map(acceptHack).filter((hack): hack is Hack => Boolean(hack)),
    removed: (Array.isArray(remoteRaw.removed) ? remoteRaw.removed : []).map(acceptRemoval).filter((item): item is Removal => Boolean(item)),
  }
  const merged = mergeLibraries(await localLibrary(), remote)
  const body = JSON.stringify(merged)
  if (body.length > MAX_BODY) return { ok: false, message: "This cabinet is too big to sync. Remove a few pictures and try again." }
  let saved: Response
  try {
    saved = await fetch(settings.endpoint, { method: "PUT", headers, body, cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(70_000) })
  } catch {
    return { ok: false, message: "Could not reach that backend. If it is waking up, try again in a minute." }
  }
  const payload = await saved.json().catch(() => null) as { ok?: boolean; error?: string; hacks?: unknown; removed?: unknown } | null
  if (saved.status === 401) return { ok: false, message: "That backend refused the token." }
  if (!saved.ok || !payload || !Array.isArray(payload.hacks)) {
    return { ok: false, message: payload?.error || "That backend could not store the cabinet." }
  }
  const finalLibrary: Library = {
    hacks: payload.hacks.map(acceptHack).filter((hack): hack is Hack => Boolean(hack)),
    removed: (Array.isArray(payload.removed) ? payload.removed : []).map(acceptRemoval).filter((item): item is Removal => Boolean(item)),
  }
  // A card saved while this request was in flight must stay, then go up on the next sync.
  const during = await localLibrary()
  const reconciled = mergeLibraries(during, finalLibrary)
  await db.replaceLibrary(reconciled.hacks, reconciled.removed)
  onChange()
  if (aheadOf(during, finalLibrary)) scheduleSync()
  return { ok: true, message: "Synced." }
}

function aheadOf(local: Library, remote: Library) {
  const hacks = new Map(remote.hacks.map((hack) => [hack.id, hack.updatedAt]))
  const removed = new Map(remote.removed.map((item) => [item.id, item.at]))
  for (const hack of local.hacks) {
    const at = hacks.get(hack.id)
    if (at == null || hack.updatedAt > at) return true
  }
  for (const item of local.removed) {
    const at = removed.get(item.id)
    if (at == null || item.at > at) return true
  }
  return false
}

export function syncNow() {
  window.clearTimeout(timer)
  if (inflight) return inflight
  inflight = runSync().finally(() => {
    inflight = null
    if (queued) {
      queued = false
      scheduleSync()
    }
  })
  return inflight
}

export function scheduleSync() {
  const settings = readSettings()
  if (!settings.endpoint.trim() || !settings.token.trim()) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (inflight) {
      queued = true
      return
    }
    void syncNow()
  }, 600)
}
