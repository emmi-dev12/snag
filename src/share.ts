import type { Hack } from "./types.ts"
import { encodeCard } from "./incoming.ts"

export function sharePayload(hack: Hack) {
  return {
    id: hack.id,
    situation: hack.situation,
    title: hack.title,
    steps: hack.steps.filter((step) => step.trim()),
    caveat: hack.caveat,
    tags: hack.tags,
    ...(hack.category ? { category: hack.category } : {}),
    source: {
      kind: hack.source?.kind === "file" ? "typed" : (hack.source?.kind ?? "typed"),
      ...(hack.source?.label ? { label: hack.source.label } : {}),
      ...(hack.source?.url ? { url: hack.source.url } : {}),
    },
  }
}

export function shareHref(origin: string, hack: Hack) {
  return `${origin.replace(/\/$/, "")}/inbox#card=${encodeCard(sharePayload(hack))}`
}

export function cardUrl(cabinet: string | undefined, id: string) {
  if (!cabinet || !id) return ""
  try {
    const url = new URL(cabinet)
    if (url.protocol !== "https:") return ""
    return `${url.origin}/card/${id}`
  } catch {
    return ""
  }
}

export function shareTarget(origin: string, hack: Hack, cabinet?: string) {
  const remote = cardUrl(cabinet, hack.id)
  if (remote) return { href: remote, photos: true as const }
  return { href: shareHref(origin, hack), photos: false as const }
}

export async function fetchShared(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("That code is not a Snag card.")
  if (!/^\/(?:card|pack)\/[A-Za-z0-9_-]{1,80}$/.test(url.pathname)) throw new Error("That code is not a Snag card.")
  const headers: Record<string, string> = { accept: "application/json" }
  if (url.hostname.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "1"
  let response: Response
  try {
    response = await fetch(url.toString(), { headers, cache: "no-store", credentials: "omit" })
  } catch {
    throw new Error("Could not reach the computer that has this card.")
  }
  if (!response.ok) throw new Error("That computer did not have this card.")
  const data = (await response.json().catch(() => null)) as unknown
  if (!data) throw new Error("That computer did not have this card.")
  return JSON.stringify(data)
}

export async function publishPack(settings: { endpoint: string; token: string; share?: string }, ids: string[]) {
  const base = (settings.share || settings.endpoint || "").trim()
  let url: URL
  try {
    url = new URL(base)
  } catch {
    throw new Error("Turn on the computer that keeps the cabinet.")
  }
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost"
  if ((url.protocol !== "https:" && !local) || !settings.token.trim()) throw new Error("Turn on the computer that keeps the cabinet.")
  const headers: Record<string, string> = {
    authorization: `Bearer ${settings.token}`,
    "content-type": "application/json",
    accept: "application/json",
  }
  if (url.hostname.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "1"
  let response: Response
  try {
    response = await fetch(`${url.origin}/pack`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids }),
      cache: "no-store",
      credentials: "omit",
    })
  } catch {
    throw new Error("Could not reach the computer that keeps the cabinet.")
  }
  const payload = (await response.json().catch(() => null)) as { id?: unknown; error?: unknown } | null
  if (!response.ok || !payload || typeof payload.id !== "string") {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Could not make a code for those cards.")
  }
  let origin = ""
  const share = settings.share?.trim() || ""
  if (share) {
    try {
      const shared = new URL(share)
      if (shared.protocol === "https:") origin = shared.origin
    } catch {
      origin = ""
    }
  }
  if (!origin && url.protocol === "https:") origin = url.origin
  if (!origin) throw new Error("The computer has no public address yet. Leave it on for a moment and try again.")
  return `${origin}/pack/${payload.id}`
}
