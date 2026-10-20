import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { hashtagsFrom, titleWithoutHashtags } from "../../src/cards.ts"
import type { FetchedSource } from "../../src/types.ts"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
const BYTE_LIMIT = 1_500_000

export class SourceError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "SourceError"
    this.status = status
  }
}

function isPrivate(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "")
  if (value.includes(":")) {
    if (value === "::1" || value === "::") return true
    if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")) return true
    const mapped = value.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivate(mapped[1]) : false
  }
  const parts = value.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true
  const [a, b] = parts
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SourceError("Use an http or https link.")
  }
  const host = url.hostname.replace(/\.$/, "").toLowerCase()
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new SourceError("That link points at a private address.")
  }
  if (isIP(host)) {
    if (isPrivate(host)) throw new SourceError("That link points at a private address.")
    return
  }
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new SourceError("That host didn't resolve.")
  }
  if (!records.length || records.some((record) => isPrivate(record.address))) {
    throw new SourceError("That link points at a private address.")
  }
}

async function fetchChecked(url: URL, init?: RequestInit, hops = 0): Promise<Response> {
  if (hops > 4) throw new SourceError("That link redirected too many times.")
  await assertPublic(url)
  const headers = new Headers(init?.headers)
  if (!headers.has("user-agent")) headers.set("user-agent", UA)
  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  })
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location")
    if (!location) throw new SourceError("That link redirected nowhere.")
    return fetchChecked(new URL(location, url), { method: "GET" }, hops + 1)
  }
  if (!response.ok) throw new SourceError("That page didn't open.")
  return response
}

async function readBytes(response: Response, max: number) {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  while (total <= max) {
    const { done, value } = await reader.read()
    if (done || !value) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  await reader.cancel().catch(() => undefined)
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer
}

async function imageDataUrl(url: URL) {
  try {
    const response = await fetchChecked(url)
    const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
    if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") return undefined
    const bytes = await readBytes(response, 180_000)
    if (!bytes || bytes.byteLength < 1500) return undefined
    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
  } catch {
    return undefined
  }
}

async function coverFrom(page: URL, image: string) {
  try {
    return await imageDataUrl(new URL(image, page))
  } catch {
    return undefined
  }
}

function withWords(source: FetchedSource, extra = ""): FetchedSource {
  const tags = hashtagsFrom(`${source.title}\n${extra}\n${source.text}`)
  const title = titleWithoutHashtags(source.title)
  if (!tags.length && title === source.title) return source
  return { ...source, title, ...(tags.length ? { tags } : {}) }
}

async function readText(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < BYTE_LIMIT) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    total += value.byteLength
  }
  await reader.cancel().catch(() => undefined)
  const buffer = new Uint8Array(Math.min(total, BYTE_LIMIT))
  let offset = 0
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, buffer.length - offset)
    buffer.set(chunk.subarray(0, take), offset)
    offset += take
    if (offset >= buffer.length) break
  }
  return new TextDecoder().decode(buffer)
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
}

function meta(html: string, key: string) {
  const pattern = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${key}["'][^>]*>`, "i")
  const reverse = new RegExp(`<meta\\b[^>]*content=["'][^"']*["'][^>]*(?:property|name)=["']${key}["'][^>]*>`, "i")
  const tag = html.match(pattern)?.[0] ?? html.match(reverse)?.[0]
  if (!tag) return ""
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1] ?? ""
  return decodeEntities(content).replace(/\s+/g, " ").trim()
}

function pageTitle(html: string) {
  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim()
}

function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function readableText(html: string) {
  const without = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
  return stripTags(without).slice(0, 8000)
}

function publicUrl(url: URL) {
  url.username = ""
  url.password = ""
  url.hash = ""
  return url.toString()
}

function normalizeInput(input: string) {
  const trimmed = input.trim()
  if (!trimmed) throw new SourceError("Paste a link first.")
  if (trimmed.length > 2000) throw new SourceError("That link is too long.")
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withScheme)
  } catch {
    throw new SourceError("That link isn't a URL.")
  }
}

function youtubeId(url: URL) {
  const host = url.hostname.replace(/^www\.|^m\./, "")
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v")
    const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)
    return match?.[1] ?? null
  }
  return null
}

type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string }

function pickTrack(tracks: CaptionTrack[]) {
  const manual = tracks.filter((track) => track.baseUrl && track.kind !== "asr")
  const pool = manual.length ? manual : tracks.filter((track) => track.baseUrl)
  return (
    pool.find((track) => track.languageCode === "en") ??
    pool.find((track) => track.languageCode?.startsWith("en")) ??
    pool[0]
  )
}

function json3ToText(body: string) {
  const data = JSON.parse(body) as { events?: { segs?: { utf8?: string }[] }[] }
  const parts: string[] = []
  for (const event of data.events ?? []) {
    for (const seg of event.segs ?? []) {
      if (seg.utf8) parts.push(seg.utf8)
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function xmlToText(body: string) {
  const parts: string[] = []
  for (const match of body.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)) {
    const line = decodeEntities(match[1]).replace(/\s+/g, " ").trim()
    if (line) parts.push(line)
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

async function transcriptFromTrack(baseUrl: string) {
  const url = new URL(baseUrl)
  url.searchParams.set("fmt", "json3")
  const response = await fetchChecked(url)
  const body = await readText(response)
  if (body.trim().startsWith("{") || body.trim().startsWith("[")) return json3ToText(body)
  return xmlToText(body)
}

async function playerResponse(videoId: string) {
  const endpoint = new URL("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
  const response = await fetchChecked(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", gl: "US" } },
    }),
  })
  return (await response.json()) as {
    videoDetails?: { title?: string; author?: string; shortDescription?: string }
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
  }
}

function playerFromHtml(html: string) {
  const marker = "ytInitialPlayerResponse"
  const start = html.indexOf(marker)
  if (start < 0) return null
  const brace = html.indexOf("{", start)
  if (brace < 0) return null
  let depth = 0
  for (let i = brace; i < html.length; i += 1) {
    const char = html[i]
    if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(brace, i + 1)) as Awaited<ReturnType<typeof playerResponse>>
        } catch {
          return null
        }
      }
    }
  }
  return null
}

async function readYouTube(url: URL, videoId: string): Promise<FetchedSource> {
  let player: Awaited<ReturnType<typeof playerResponse>> | null = null
  try {
    player = await playerResponse(videoId)
  } catch {
    player = null
  }
  if (!player?.videoDetails?.title) {
    const watch = new URL(`https://www.youtube.com/watch?v=${videoId}`)
    const response = await fetchChecked(watch, { headers: { cookie: "CONSENT=YES+1" } })
    player = playerFromHtml(await readText(response))
  }
  const title = player?.videoDetails?.title?.trim() || "YouTube video"
  const author = player?.videoDetails?.author?.trim() || ""
  const description = player?.videoDetails?.shortDescription?.trim() || ""
  const track = pickTrack(player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])
  let transcript = ""
  if (track?.baseUrl) {
    try {
      transcript = await transcriptFromTrack(track.baseUrl)
    } catch {
      transcript = ""
    }
  }
  const text = transcript || description
  let cover: string | undefined
  let stills: string[] | undefined
  if (/^[a-zA-Z0-9_-]{6,16}$/.test(videoId)) {
    const shots = await Promise.all([
      imageDataUrl(new URL(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)),
      imageDataUrl(new URL(`https://i.ytimg.com/vi/${videoId}/1.jpg`)),
      imageDataUrl(new URL(`https://i.ytimg.com/vi/${videoId}/2.jpg`)),
      imageDataUrl(new URL(`https://i.ytimg.com/vi/${videoId}/3.jpg`)),
    ])
    cover = shots[0]
    const rest = shots.slice(1).filter((shot): shot is string => Boolean(shot) && shot !== cover)
    stills = rest.length ? rest : undefined
  }
  return withWords(
    {
      kind: "youtube",
      url: publicUrl(url),
      title,
      author,
      text,
      textKind: transcript ? "transcript" : "page",
      warning: transcript
        ? undefined
        : "This video has no captions. Attach the video file to pull the pictures and the words, or type the steps.",
      cover,
      stills,
    },
    description,
  )
}

function instagramCode(url: URL) {
  const match = url.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/)
  return match?.[1] ?? null
}

function loginWall(title: string, text: string) {
  const blob = `${title} ${text}`.toLowerCase()
  return (blob.includes("log in") || blob.includes("login") || blob.includes("sign up")) && text.length < 280
}

async function readEmbed(pageUrl: URL, embedUrl: URL, kind: "instagram" | "facebook"): Promise<FetchedSource> {
  const response = await fetchChecked(embedUrl, { headers: { cookie: "CONSENT=YES+1" } })
  const html = await readText(response)
  const title = meta(html, "og:title") || pageTitle(html)
  const description = meta(html, "og:description")
  const caption = stripTags(html.match(/class="Caption"[\s\S]*?<\/div>\s*<\/div>/i)?.[0] ?? "")
  const text = (caption || description || readableText(html)).slice(0, 8000)
  const image = meta(html, "og:image")
  const cover = image ? await coverFrom(pageUrl, image) : undefined
  if (loginWall(title, text) || text.length < 40) {
    return {
      kind,
      url: publicUrl(pageUrl),
      title: loginWall(title, text) ? "" : title,
      author: "",
      text: "",
      textKind: "caption",
      cover,
      warning:
        kind === "instagram"
          ? "Instagram didn't share this post. Paste the caption, or attach the video file."
          : "Facebook didn't share this post. Paste the caption, or attach the video file.",
    }
  }
  return withWords({
    kind,
    url: publicUrl(pageUrl),
    title,
    author: "",
    text,
    textKind: caption || description ? "caption" : "page",
    cover,
  })
}

async function readWeb(url: URL): Promise<FetchedSource> {
  const response = await fetchChecked(url)
  const type = response.headers.get("content-type") ?? ""
  if (type.startsWith("video/") || type.startsWith("audio/")) {
    return {
      kind: "web",
      url: publicUrl(url),
      title: "",
      author: "",
      text: "",
      textKind: "page",
      warning: "That link is a media file. Attach it and Whistle will listen.",
    }
  }
  const html = await readText(response)
  const title = meta(html, "og:title") || pageTitle(html)
  const description = meta(html, "og:description")
  const text = [description, readableText(html)].filter(Boolean).join("\n\n").slice(0, 8000)
  const image = meta(html, "og:image")
  const cover = image ? await coverFrom(url, image) : undefined
  return withWords({
    kind: "web",
    url: publicUrl(url),
    title,
    author: "",
    text,
    textKind: description && text.length < description.length + 80 ? "caption" : "page",
    warning: text.length < 40 ? "That page had almost no words. Type the steps, or attach a clip." : undefined,
    cover,
  })
}

export async function fetchSource(input: string): Promise<FetchedSource> {
  const url = normalizeInput(input)
  const host = url.hostname.replace(/^www\./, "")
  const videoId = youtubeId(url)
  if (videoId) return readYouTube(url, videoId)
  if (host.endsWith("instagram.com")) {
    const code = instagramCode(url)
    if (!code) throw new SourceError("That Instagram link needs a post or reel.")
    const kind = url.pathname.includes("/reel") ? "reel" : "p"
    return readEmbed(url, new URL(`https://www.instagram.com/${kind}/${code}/embed/captioned/`), "instagram")
  }
  if (host.endsWith("facebook.com") || host === "fb.watch" || host.endsWith("fb.com")) {
    return readEmbed(url, url, "facebook")
  }
  return readWeb(url)
}

export async function sourceResponse(input: string) {
  try {
    return { status: 200, body: { ok: true as const, source: await fetchSource(input) } }
  } catch (error) {
    const status = error instanceof SourceError ? error.status : 400
    const message = error instanceof Error ? error.message : "Could not read that link."
    return { status, body: { ok: false as const, error: message } }
  }
}
