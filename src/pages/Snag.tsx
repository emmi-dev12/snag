import { useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import type { DownloadProgress } from "cactus-needle/browser"
import { draftReady, emptyDraft, mergeTags } from "../cards.ts"
import { DraftForm } from "../components/DraftForm.tsx"
import { useStore } from "../store.tsx"
import type { FetchedSource, HackDraft, HackSource } from "../types.ts"

type Phase =
  | { name: "idle" }
  | { name: "working"; label: string; percent: number | null }
  | { name: "draft"; draft: HackDraft; source?: HackSource; note?: string; offers?: string[] }
  | { name: "error"; message: string }

async function describeModelError(error: unknown) {
  const { modelFailure } = await import("../models.ts")
  return modelFailure(error)
}

function firstUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"]+/i)
  return match?.[0]?.replace(/[),.;]+$/, "") ?? ""
}

async function readLink(url: string): Promise<FetchedSource> {
  const response = await fetch("/api/source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  })
  const body = (await response.json()) as { ok: boolean; source?: FetchedSource; error?: string }
  if (!response.ok || !body.ok || !body.source) throw new Error(body.error || "Could not read that link.")
  return body.source
}

export function SnagPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { saveHack } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const run = useRef(0)
  const shared = useRef(false)
  const [link, setLink] = useState("")
  const [phase, setPhase] = useState<Phase>({ name: "idle" })
  const [draftError, setDraftError] = useState("")

  function stop() {
    run.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setPhase({ name: "idle" })
  }

  function applyFetch(draft: HackDraft, source: FetchedSource) {
    return {
      ...draft,
      tags: mergeTags([source.tags ?? [], draft.tags]),
      cover: draft.cover || source.cover,
      link: source.url,
    }
  }

  async function pullSteps(
    title: string,
    text: string,
    source: HackSource,
    note?: string,
    extras?: { draft?: HackDraft; offers?: string[] },
  ) {
    const controller = new AbortController()
    abortRef.current = controller
    setPhase({ name: "working", label: "Loading Needle. The first time downloads about 35 MB.", percent: null })
    try {
      const { extractFromText } = await import("../models.ts")
      const extracted = await extractFromText(title, text, controller.signal, (progress: DownloadProgress) => {
        setPhase({
          name: "working",
          label: progress.percentage != null && progress.percentage < 100 ? "Downloading Needle" : "Pulling out the steps",
          percent: progress.percentage ?? null,
        })
      })
      if (controller.signal.aborted) return
      const carried = extras?.draft
      if (!extracted.draft) {
        setPhase({
          name: "draft",
          draft: {
            ...emptyDraft(),
            title: carried?.title || title,
            cover: carried?.cover,
            tags: carried?.tags ?? [],
            ...(carried?.link ? { link: carried.link } : {}),
          },
          source,
          offers: extras?.offers,
          note: note || "Needle didn't find a hack in those words. Write the moment and the steps.",
        })
        return
      }
      const caution = extracted.uncertain ? "Check this. Needle wasn't sure every line was in the source." : ""
      setPhase({
        name: "draft",
        draft: {
          ...extracted.draft,
          title: extracted.draft.title || carried?.title || title,
          cover: extracted.draft.cover || carried?.cover,
          tags: mergeTags([carried?.tags ?? [], extracted.draft.tags]),
          ...(carried?.link ? { link: carried.link } : {}),
        },
        source,
        offers: extras?.offers,
        note: [note, caution].filter(Boolean).join(" "),
      })
    } catch (error) {
      if (controller.signal.aborted) return
      setPhase({ name: "error", message: await describeModelError(error) })
    }
  }

  async function snagUrl(raw: string) {
    const ticket = ++run.current
    setPhase({ name: "working", label: "Reading the link", percent: null })
    try {
      const source = await readLink(raw)
      if (ticket !== run.current) return
      const note = [source.warning, source.text.length > 3200 ? "Needle reads the opening of a long transcript." : ""]
        .filter(Boolean)
        .join(" ")
      const origin = { kind: source.kind, url: source.url, label: source.author, textKind: source.textKind }
      const carried = applyFetch({ ...emptyDraft(), title: source.title }, source)
      if (source.text.trim().length < 80) {
        setPhase({
          name: "draft",
          draft: carried,
          source: origin,
          offers: source.stills,
          note: note || "There weren't enough words to pull steps from. Write the moment and the steps.",
        })
        return
      }
      if (ticket !== run.current) return
      await pullSteps(source.title, source.text, origin, note, { draft: carried, offers: source.stills })
    } catch (error) {
      if (ticket !== run.current) return
      setPhase({ name: "error", message: error instanceof Error ? error.message : "Could not read that link." })
    }
  }

  async function onLink(event: FormEvent) {
    event.preventDefault()
    await snagUrl(link)
  }

  useEffect(() => {
    if (shared.current) return
    const handed = params.get("url") || firstUrl(params.get("text") || "") || firstUrl(params.get("title") || "")
    if (!handed) return
    shared.current = true
    setLink(handed)
    void snagUrl(handed)
  }, [params])

  async function onFile(file: File) {
    const controller = new AbortController()
    abortRef.current = controller
    const clipTitle = file.name.replace(/\.[^.]+$/, "") || file.name
    let frames: string[] = []
    if (file.type.startsWith("video/")) {
      setPhase({ name: "working", label: "Pulling pictures from the clip", percent: null })
      try {
        const { framesFromFile } = await import("../images.ts")
        frames = await framesFromFile(file, controller.signal)
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return
        frames = []
      }
    }
    if (controller.signal.aborted) return
    const carried = { ...emptyDraft(), title: clipTitle, cover: frames[0], tags: [] as string[] }
    const offers = frames.slice(1)
    setPhase({ name: "working", label: "Loading Whistle. The first time downloads about 17 MB.", percent: null })
    try {
      const { transcribeFile } = await import("../models.ts")
      const transcript = await transcribeFile(file, controller.signal, (progress) => {
        const heard = "heard" in progress
        setPhase({
          name: "working",
          label: heard ? "Listening" : "Downloading Whistle",
          percent: progress.percentage ?? null,
        })
      })
      if (controller.signal.aborted) return
      if (!transcript) {
        if (!frames.length) {
          setPhase({ name: "error", message: "Whistle didn't catch any words. Try a clearer clip, or type the steps." })
          return
        }
        setPhase({
          name: "draft",
          draft: carried,
          offers,
          source: { kind: "file", label: file.name, textKind: "speech" },
          note: "No words in that clip. The pictures are here. Write the moment and the steps.",
        })
        return
      }
      await pullSteps(clipTitle, transcript, { kind: "file", label: file.name, textKind: "speech" }, "Heard on this device.", {
        draft: carried,
        offers,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      setPhase({ name: "error", message: await describeModelError(error) })
    }
  }

  return (
    <>
      <h1>Snag a hack</h1>
      <p className="lede">Paste a YouTube, Instagram, Facebook, or web link. YouTube captions work best. A clip you attach is heard on this device. Share a link into Snag from another app and it lands here.</p>
      {phase.name !== "draft" ? (
        <form className="stack" onSubmit={(event) => void onLink(event)}>
          <label className="field" htmlFor="hack-link">
            <span>Link</span>
            <input
              id="hack-link"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              disabled={phase.name === "working"}
            />
          </label>
          <div className="row-actions">
            <button className="primary" type="submit" disabled={phase.name === "working" || !link.trim()}>
              Snag it
            </button>
            <button className="quiet" type="button" onClick={() => fileRef.current?.click()} disabled={phase.name === "working"}>
              Attach a clip
            </button>
            <button
              className="quiet"
              type="button"
              onClick={() => setPhase({ name: "draft", draft: emptyDraft(), source: { kind: "typed" } })}
            >
              Type it
            </button>
          </div>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="video/*,audio/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void onFile(file)
            }}
          />
          <p className="note">A link is fetched so the words can come back. The card stays on this device until this computer is keeping the cabinet. The first snag downloads Needle.</p>
        </form>
      ) : null}
      {phase.name === "working" ? (
        <div className="stack" aria-live="polite">
          <p className="status">{phase.label}</p>
          <div className={phase.percent == null ? "progress is-busy" : "progress"} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.percent ?? undefined}>
            <span style={phase.percent == null ? undefined : { width: `${phase.percent}%` }} />
          </div>
          <button type="button" className="quiet" onClick={stop}>
            Stop
          </button>
        </div>
      ) : null}
      {phase.name === "error" ? (
        <div className="stack">
          <p className="error" role="alert">
            {phase.message}
          </p>
          <button type="button" className="quiet" onClick={() => setPhase({ name: "idle" })}>
            Try again
          </button>
        </div>
      ) : null}
      {phase.name === "draft" ? (
        <section className="sheet is-open">
          <h2 className="situation">Keep this hack</h2>
          <DraftForm
            value={phase.draft}
            note={phase.note}
            offers={phase.offers}
            error={draftError}
            submitLabel="Keep"
            cancelLabel="Discard"
            onChange={(draft) => setPhase({ ...phase, draft })}
            onCancel={() => {
              setDraftError("")
              setPhase({ name: "idle" })
            }}
            onSubmit={() => {
              if (!draftReady(phase.draft)) {
                setDraftError("Write the moment this is for.")
                return
              }
              void saveHack(phase.draft, phase.source).then((hack) => navigate(`/?open=${hack.id}`))
            }}
          />
        </section>
      ) : null}
    </>
  )
}
