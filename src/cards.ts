import type { Hack, HackDraft, HackSource } from "./types.ts"

export function emptyDraft(): HackDraft {
  return { situation: "", title: "", steps: [""], caveat: "", tags: [] }
}

export function draftFromHack(hack: Hack): HackDraft {
  return {
    situation: hack.situation,
    title: hack.title,
    steps: hack.steps.length ? [...hack.steps] : [""],
    caveat: hack.caveat,
    tags: [...hack.tags],
    cover: hack.cover,
    pictures: hack.pictures ? [...hack.pictures] : undefined,
    link: hack.source?.url ?? "",
  }
}

const TAG_LIMIT = 8

function cleanTag(tag: string) {
  return tag.replace(/^#/, "").replace(/\s+/g, " ").trim().toLowerCase()
}

function cleanImage(value: string | undefined) {
  if (!value || value.length > 280_000) return undefined
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(value)
  if (!match) return undefined
  const body = match[2].replace(/\s+/g, "")
  if (body.length < 32) return undefined
  return `data:image/${match[1].toLowerCase()};base64,${body}`
}

function cleanPictures(values: string[] | undefined) {
  if (!values?.length) return undefined
  const pictures: string[] = []
  for (const value of values) {
    const image = cleanImage(value)
    if (!image || pictures.includes(image)) continue
    pictures.push(image)
    if (pictures.length === 8) break
  }
  return pictures.length ? pictures : undefined
}

export function mergeTags(groups: string[][]) {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const group of groups) {
    for (const raw of group) {
      const tag = cleanTag(raw)
      if (!tag || seen.has(tag)) continue
      seen.add(tag)
      tags.push(tag)
      if (tags.length === TAG_LIMIT) return tags
    }
  }
  return tags
}

export function titleWithoutHashtags(title: string) {
  const stripped = title.replace(/#[\p{L}\p{N}_]{2,24}/gu, " ").replace(/\s+/g, " ").trim()
  return stripped || title.replace(/\s+/g, " ").trim()
}

export function hashtagsFrom(text: string) {
  const tags: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(/#([\p{L}\p{N}_]{2,24})/gu)) {
    const tag = match[1].toLowerCase()
    if (seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
    if (tags.length === TAG_LIMIT) break
  }
  return tags
}

export function cleanDraft(draft: HackDraft): HackDraft {
  const cover = cleanImage(draft.cover)
  const pictures = cleanPictures(draft.pictures)
  const clean: HackDraft = {
    situation: draft.situation.replace(/\s+/g, " ").trim(),
    title: draft.title.replace(/\s+/g, " ").trim(),
    steps: draft.steps.map((step) => step.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12),
    caveat: draft.caveat.replace(/\s+/g, " ").trim(),
    tags: mergeTags([draft.tags]),
    cover,
    pictures,
  }
  if ("link" in draft) clean.link = safeHttpUrl(draft.link) ?? ""
  return clean
}

export function draftReady(draft: HackDraft) {
  return cleanDraft(draft).situation.length > 0
}

function asString(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

export function coerceHack(raw: unknown): HackDraft | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const situation = asString(record.situation, 180)
  const title = asString(record.title, 80)
  const steps = (Array.isArray(record.steps) ? record.steps : [])
    .map((step) => asString(step, 220))
    .filter(Boolean)
    .slice(0, 12)
  if (!situation && !title && steps.length === 0) return null
  const tags = (Array.isArray(record.tags) ? record.tags : [])
    .map((tag) => asString(tag, 24).toLowerCase())
    .filter(Boolean)
    .slice(0, 8)
  return {
    situation: situation || title,
    title: title || situation,
    steps,
    caveat: asString(record.caveat, 240),
    tags,
  }
}

export function passageForNeedle(title: string, text: string, limit = 3200) {
  const body = text.replace(/\s+/g, " ").trim()
  const clipped = body.length > limit ? body.slice(0, limit) : body
  return `Title: ${title}\n\n${clipped}`
}

function sourceWithLink(source: HackSource | undefined, link: string | undefined): HackSource | undefined {
  if (link) return { ...(source ?? { kind: "web" }), url: link }
  if (link !== "") return source
  if (!source) return undefined
  const rest = { ...source }
  delete rest.url
  return rest
}

export function makeHack(draft: HackDraft, source?: HackSource): Hack {
  const clean = cleanDraft(draft)
  const fields = { ...clean }
  delete fields.link
  const now = Date.now()
  return {
    ...fields,
    title: clean.title || clean.situation,
    id: crypto.randomUUID(),
    source: sourceWithLink(source, "link" in draft ? clean.link || "" : undefined),
    verdict: "untried",
    createdAt: now,
    updatedAt: now,
  }
}

export function sourceLabel(source?: HackSource) {
  if (!source) return ""
  if (source.kind === "agent") return source.label ? `Filed by ${source.label}` : "Filed by an agent"
  if (source.kind === "file") return "Heard on this device"
  if (source.kind === "typed") return "Typed on this device"
  if (source.textKind === "transcript") return "YouTube captions"
  if (source.textKind === "caption") return "The post caption"
  if (source.kind === "youtube") return "YouTube"
  if (source.kind === "instagram") return "Instagram"
  if (source.kind === "facebook") return "Facebook"
  return "The page"
}

export function safeHttpUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString()
  } catch {
    return undefined
  }
  return undefined
}

export function haystack(hack: Hack) {
  return [hack.situation, hack.title, hack.caveat, hack.steps.join(" "), hack.tags.join(" "), hack.source?.url ?? ""].join("\n").toLowerCase()
}

const HACK_SCHEMA = {
  type: "object",
  properties: {
    situation: { type: "string", description: "The moment this is useful. Start with When." },
    title: { type: "string", description: "Name of the hack, a few words." },
    steps: {
      type: "array",
      description: "Actions in order. Each item is one short step.",
      items: { type: "string" },
    },
    caveat: { type: "string", description: "The way it goes wrong. Empty string if none." },
    tags: { type: "array", items: { type: "string" }, description: "Up to three short topics." },
  },
  required: ["situation", "title", "steps", "caveat", "tags"],
} as const

export { HACK_SCHEMA }

export const NEEDLE_SYSTEM = [
  "Extract one practical lifehack from a transcript, caption, or page.",
  "Pick the single most useful procedure.",
  "situation is a sentence from the body that starts with When. Do not copy the Title line into situation.",
  "steps are the actions in order, including a don't when the source says not to do something.",
  "Do not invent tools or steps that were not mentioned.",
  "caveat is the failure the source mentions, or an empty string.",
].join(" ")
