import { createNeedle, createWhistle, NeedleError, tool, type DownloadProgress, type Needle, type Whistle } from "cactus-needle/browser"
import { fileToMono16k, secondChunks } from "./audio.ts"
import { coerceHack, HACK_SCHEMA, NEEDLE_SYSTEM, passageForNeedle } from "./cards.ts"

let needle: Needle | null = null
let needleLoad: Promise<Needle> | null = null
let whistle: Whistle | null = null
let whistleLoad: Promise<Whistle> | null = null
let progressSink: ((progress: DownloadProgress) => void) | null = null

async function closeNeedle() {
  const current = needle
  needle = null
  needleLoad = null
  if (current) await current.close().catch(() => undefined)
}

async function closeWhistle() {
  const current = whistle
  whistle = null
  whistleLoad = null
  if (current) await current.close().catch(() => undefined)
}

function loadNeedle() {
  needleLoad ??= createNeedle({
    system: NEEDLE_SYSTEM,
    stateless: true,
    maxOutputTokens: 700,
    onDownloadProgress: (progress) => progressSink?.(progress),
  })
    .then((session) => {
      needle = session
      return session
    })
    .catch(async (error: unknown) => {
      needleLoad = null
      throw error
    })
  return needleLoad
}

function loadWhistle() {
  whistleLoad ??= createWhistle({
    onDownloadProgress: (progress) => progressSink?.(progress),
  })
    .then((session) => {
      whistle = session
      return session
    })
    .catch(async (error: unknown) => {
      whistleLoad = null
      throw error
    })
  return whistleLoad
}

function withWhen(draft: ReturnType<typeof coerceHack>, passage: string) {
  if (!draft || /^when\b/i.test(draft.situation)) return draft
  const sentence = passage.match(/\bWhen\b[^,.!?]{8,140}/)
  if (!sentence) return draft
  return { ...draft, situation: sentence[0].replace(/\s+/g, " ").trim() }
}

async function extractOnce(text: string, signal: AbortSignal) {
  const session = needle ?? (await loadNeedle())
  const result = await session.complete(text, {
    tools: { extract: tool({ inputSchema: HACK_SCHEMA }) },
    maxNewTokens: 700,
    abortSignal: signal,
  })
  if (!result.success) throw new NeedleError("ENGINE_ERROR", result.error || "Needle couldn't read that.")
  const call = result.function_calls.find((item) => item.name === "extract") ?? result.suppressed_calls.find((item) => item.name === "extract")
  return {
    draft: coerceHack(call?.arguments),
    uncertain: Boolean(result.validation?.ungrounded?.length),
  }
}

export async function extractFromText(title: string, text: string, signal: AbortSignal, onProgress: (progress: DownloadProgress) => void) {
  progressSink = onProgress
  const full = passageForNeedle(title, text)
  const short = passageForNeedle(title, text, 1400)
  const passages = full === short ? [full] : [full, short]
  for (const passage of passages) {
    try {
      const found = await extractOnce(passage, signal)
      const draft = withWhen(found.draft, passage)
      if (!draft) continue
      const hasWhen = /^when\b/i.test(draft.situation)
      if (!hasWhen && draft.steps.length < 2) continue
      return { draft, uncertain: found.uncertain || !hasWhen }
    } catch (error) {
      await closeNeedle()
      if (signal.aborted) throw error
      const retryable = error instanceof NeedleError && (error.code === "ENGINE_ERROR" || error.code === "INVALID_RESPONSE")
      if (!retryable || passage === passages[passages.length - 1]) throw error
    }
  }
  return { draft: null, uncertain: false }
}

export async function transcribeFile(file: File, signal: AbortSignal, onProgress: (progress: DownloadProgress & { heard?: number }) => void) {
  progressSink = onProgress
  const samples = await fileToMono16k(file)
  if (signal.aborted) throw new DOMException("Aborted", "AbortError")
  const session = whistle ?? (await loadWhistle())
  const chunks = secondChunks(samples)
  const committed: string[] = []
  let pending = ""
  try {
    let index = 0
    for await (const part of session.stream(chunks, { abortSignal: signal })) {
      if (part.text) committed.push(part.text)
      pending = part.pending
      index += 1
      onProgress({ loaded: index, total: chunks.length, percentage: Math.round((index / chunks.length) * 100), heard: index })
    }
  } catch (error) {
    await closeWhistle()
    throw error
  }
  return [...committed, pending].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

export function modelFailure(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "Stopped."
  if (error instanceof NeedleError) {
    if (error.code === "DOWNLOAD_FAILED") return "Needle didn't download. Check the connection and try again."
    if (error.code === "UNSUPPORTED_ENVIRONMENT") return error.message
    return "Needle couldn't read that. Type the steps, or try a shorter clip."
  }
  return error instanceof Error ? error.message : "That didn't work."
}
