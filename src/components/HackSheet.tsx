import { useEffect, useId, useRef, useState } from "react"
import type { Hack, HackDraft, Verdict } from "../types.ts"
import { categoryLabel, draftFromHack, draftReady, safeHttpUrl, sourceLabel } from "../cards.ts"
import { useStore } from "../store.tsx"
import { DraftForm } from "./DraftForm.tsx"
import { QrShare } from "./QrShare.tsx"

const verdicts: Verdict[] = ["untried", "worked", "failed"]
const awakeKey = "snag.awake"

function screenCanStayOn() {
  return "wakeLock" in navigator
}

function readStayOn() {
  try {
    return localStorage.getItem(awakeKey) === "1"
  } catch {
    return false
  }
}

function writeStayOn(on: boolean) {
  try {
    if (on) localStorage.setItem(awakeKey, "1")
    else localStorage.removeItem(awakeKey)
  } catch {
    // Private mode can refuse the write. The switch still works for this visit.
  }
}

export function HackSheet({ hack, open, onToggle, onTag, onCategory, picked, onPick }: { hack: Hack; open: boolean; onToggle: () => void; onTag: (tag: string) => void; onCategory: (category: string) => void; picked?: boolean; onPick?: (id: string) => void }) {
  const { updateHack, setVerdict, deleteHack } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<HackDraft>(() => draftFromHack(hack))
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState("")
  const followKey = open ? hack.id : ""
  const [follow, setFollow] = useState({ key: followKey, step: 0, moved: false })
  if (follow.key !== followKey) setFollow({ key: followKey, step: 0, moved: false })
  const step = follow.step
  const moved = follow.moved
  const [stayOn, setStayOn] = useState(readStayOn)
  const [stayNote, setStayNote] = useState("")
  const ref = useRef<HTMLElement>(null)
  const nowRef = useRef<HTMLLIElement>(null)
  const lockRef = useRef<WakeLockSentinel | null>(null)
  const holdRef = useRef(0)
  const bodyId = useId()
  const canStay = screenCanStayOn()
  const following = open && !editing && hack.steps.length > 0
  const index = Math.min(step, Math.max(0, hack.steps.length - 1))
  const last = index >= hack.steps.length - 1

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "start" })
  }, [open])

  useEffect(() => {
    if (!following) return
    document.documentElement.dataset.follow = "1"
    return () => {
      delete document.documentElement.dataset.follow
    }
  }, [following])

  useEffect(() => {
    if (!moved) return
    nowRef.current?.scrollIntoView({ block: "nearest" })
  }, [index, moved])

  useEffect(() => {
    if (!following) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
      event.preventDefault()
      const dir = event.key === "ArrowRight" ? 1 : -1
      setFollow((current) => {
        const at = Math.min(current.step, hack.steps.length - 1)
        return { ...current, moved: true, step: Math.min(hack.steps.length - 1, Math.max(0, at + dir)) }
      })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [following, hack.steps.length])

  function go(next: number) {
    setFollow((current) => ({ ...current, moved: true, step: Math.min(hack.steps.length - 1, Math.max(0, next)) }))
  }

  async function claimScreen() {
    if (!screenCanStayOn()) return false
    if (document.visibilityState !== "visible" || lockRef.current) return true
    const hold = holdRef.current
    try {
      const sentinel = await navigator.wakeLock.request("screen")
      if (hold !== holdRef.current || lockRef.current) {
        await sentinel.release()
        return false
      }
      lockRef.current = sentinel
      sentinel.addEventListener("release", () => {
        if (lockRef.current === sentinel) lockRef.current = null
      })
      return true
    } catch {
      return false
    }
  }

  async function releaseScreen() {
    holdRef.current += 1
    const current = lockRef.current
    lockRef.current = null
    try {
      await current?.release()
    } catch {
      // The browser already dropped the lock.
    }
  }

  useEffect(() => {
    if (!following || !stayOn) {
      void releaseScreen()
      return
    }
    let stopped = false
    const claim = () => {
      if (!stopped) void claimScreen()
    }
    claim()
    document.addEventListener("visibilitychange", claim)
    return () => {
      stopped = true
      document.removeEventListener("visibilitychange", claim)
      void releaseScreen()
    }
  }, [following, stayOn])

  async function toggleStay() {
    if (stayOn) {
      setStayOn(false)
      setStayNote("")
      writeStayOn(false)
      await releaseScreen()
      return
    }
    const ok = await claimScreen()
    if (!ok) {
      setStayNote("This browser did not keep the screen on.")
      return
    }
    setStayOn(true)
    setStayNote("")
    writeStayOn(true)
  }

  const href = safeHttpUrl(hack.source?.url)
  const label = sourceLabel(hack.source)

  return (
    <article className={open ? "sheet is-open" : "sheet"} ref={ref}>
      <h2 className={onPick ? "card-head" : undefined}>
        {onPick ? (
          <label className="pick">
            <input type="checkbox" checked={Boolean(picked)} onChange={() => onPick(hack.id)} />
            <span className="sr-only">Include {hack.title || hack.situation}</span>
          </label>
        ) : null}
        <button className="card-face" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={onToggle}>
          {hack.cover ? <img className="card-photo" alt="" src={hack.cover} /> : null}
          <span className="card-copy">
            <span className="card-title">{hack.title || hack.situation}</span>
            {hack.situation && hack.situation !== hack.title ? <span className="card-blurb">{hack.situation}</span> : null}
            {hack.category ? <span className="card-category">{categoryLabel(hack.category)}</span> : null}
            <span className={`verdict-word is-${hack.verdict}`}>{hack.verdict === "untried" ? "Untried" : hack.verdict === "worked" ? "Worked" : "Failed"}</span>
          </span>
        </button>
      </h2>
      {open ? <div className="sheet-body" id={bodyId}>
        {editing ? (
          <DraftForm
            value={draft}
            onChange={setDraft}
            submitLabel="Save"
            cancelLabel="Cancel"
            error={error}
            onCancel={() => {
              setEditing(false)
              setError("")
              setDraft(draftFromHack(hack))
            }}
            onSubmit={() => {
              if (!draftReady(draft)) {
                setError("Write the moment this is for.")
                return
              }
              void updateHack(hack.id, draft).then(() => setEditing(false))
            }}
          />
        ) : (
          <>
            {hack.steps.length ? (
              <ol className="steps">
                {hack.steps.map((line, item) => (
                  <li key={`${hack.id}-${item}`} className={item === index ? "is-now" : undefined} aria-current={item === index ? "step" : undefined} ref={item === index ? nowRef : undefined}>
                    {hack.pictures?.[item] ? <img className="step-photo" src={hack.pictures[item]} alt="" /> : null}
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {hack.caveat ? <p className="caveat">{hack.caveat}</p> : null}
            {hack.category ? (
              <p className="note">
                <button type="button" className="tag" onClick={() => onCategory(hack.category ?? "")}>
                  {categoryLabel(hack.category)}
                </button>
              </p>
            ) : null}
            {hack.tags.length ? (
              <div className="tags">
                {hack.tags.map((tag) => (
                  <button key={tag} type="button" className="tag" onClick={() => onTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
            {href ? (
              <p className="source-line">
                <a href={href} target="_blank" rel="noreferrer">
                  {href}
                </a>
              </p>
            ) : label ? (
              <p className="source-line">{label}</p>
            ) : null}
            <QrShare hack={hack} />
            <div className="verdict" role="radiogroup" aria-label="Did it work">
              {verdicts.map((verdict) => (
                <button
                  key={verdict}
                  type="button"
                  role="radio"
                  aria-checked={hack.verdict === verdict}
                  className={hack.verdict === verdict ? `verdict-word is-${verdict}` : undefined}
                  onClick={() => void setVerdict(hack.id, verdict)}
                >
                  {verdict === "untried" ? "Untried" : verdict === "worked" ? "Worked" : "Failed"}
                </button>
              ))}
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setDraft(draftFromHack(hack))
                  setError("")
                  setEditing(true)
                }}
              >
                Edit
              </button>
              {confirming ? (
                <button type="button" className="danger-button" onClick={() => void deleteHack(hack.id)}>
                  Delete this hack
                </button>
              ) : (
                <button type="button" className="quiet" onClick={() => setConfirming(true)}>
                  Delete
                </button>
              )}
            </div>
            {following ? (
              <div className="follow" role="region" aria-label="Follow this hack">
                <div className="follow-inner">
                  <div className="follow-head">
                    <p className="follow-count">{index + 1} of {hack.steps.length}</p>
                    {canStay ? (
                      <button type="button" className={stayOn ? "quiet is-on" : "quiet"} aria-pressed={stayOn} onClick={() => void toggleStay()}>
                        {stayOn ? "Screen stays on" : "Keep the screen on"}
                      </button>
                    ) : null}
                  </div>
                  {stayNote ? (
                    <p className="follow-note" role="alert">{stayNote}</p>
                  ) : null}
                  <p className="follow-line" aria-live="polite">
                    <span className="sr-only">Step {index + 1} of {hack.steps.length}. </span>
                    {hack.pictures?.[index] ? <img className="step-photo" src={hack.pictures[index]} alt="" /> : null}
                    {hack.steps[index]}
                  </p>
                  <div className="follow-actions">
                    <button type="button" className="quiet" disabled={index === 0} onClick={() => go(index - 1)}>
                      Back
                    </button>
                    {last ? (
                      <>
                        <button
                          type="button"
                          className={hack.verdict === "failed" ? "quiet verdict-word is-failed" : "quiet"}
                          aria-pressed={hack.verdict === "failed"}
                          onClick={() => void setVerdict(hack.id, "failed")}
                        >
                          Failed
                        </button>
                        <button
                          type="button"
                          className="primary"
                          aria-pressed={hack.verdict === "worked"}
                          onClick={() => void setVerdict(hack.id, "worked")}
                        >
                          Worked
                        </button>
                      </>
                    ) : (
                      <button type="button" className="primary" onClick={() => go(index + 1)}>
                        Next
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div> : null}
    </article>
  )
}
