import { encodeCard } from "./incoming.ts"

export type ScanHit =
  | { kind: "card"; hash: string }
  | { kind: "fetch"; url: string }
  | { kind: "sync"; href: string }
  | { kind: "link"; url: string }
  | { kind: "fail"; message: string }

function asUrl(text: string) {
  try {
    return new URL(text)
  } catch {
    try {
      return new URL(`https://${text}`)
    } catch {
      return null
    }
  }
}

export function interpretScan(text: string): ScanHit {
  const raw = text.trim()
  if (!raw) return { kind: "fail", message: "That code was empty." }
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const card = JSON.parse(raw) as unknown
      if (card && typeof card === "object" && "situation" in card && typeof (card as { situation: unknown }).situation === "string") {
        return { kind: "card", hash: `card=${encodeCard(card)}` }
      }
    } catch {
      return { kind: "fail", message: "That code isn't a Snag card or a link." }
    }
  }
  const url = asUrl(raw)
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return { kind: "fail", message: "That code isn't a Snag card or a link." }
  }
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
  const params = new URLSearchParams(hash)
  if (params.get("card")) return { kind: "card", hash }
  if (params.get("setup")) {
    return { kind: "sync", href: `/sync#${hash}` }
  }
  const shared = url.pathname.match(/^\/(?:card|pack)\/([A-Za-z0-9_-]{1,80})$/)
  if (shared) return { kind: "fetch", url: `${url.origin}${url.pathname}` }
  return { kind: "link", url: url.toString() }
}

export function applyScan(hit: ScanHit) {
  if (hit.kind === "fail") return hit.message
  if (hit.kind === "card") {
    window.location.assign(`/inbox#${hit.hash}`)
    return ""
  }
  if (hit.kind === "sync") {
    window.location.assign(hit.href)
    return ""
  }
  if (hit.kind === "fetch") {
    window.location.assign(`/inbox#fetch=${encodeURIComponent(hit.url)}`)
    return ""
  }
  window.location.assign(`/snag?url=${encodeURIComponent(hit.url)}`)
  return ""
}
