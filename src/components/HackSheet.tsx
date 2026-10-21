import { useEffect, useId, useRef, useState } from "react"
import type { Hack, HackDraft, Verdict } from "../types.ts"
import { categoryLabel, draftFromHack, draftReady, safeHttpUrl, sourceLabel } from "../cards.ts"
import { useStore } from "../store.tsx"
import { DraftForm } from "./DraftForm.tsx"
import { QrShare } from "./QrShare.tsx"

const verdicts: Verdict[] = ["untried", "worked", "failed"]

export function HackSheet({ hack, open, onToggle, onTag, onCategory, picked, onPick }: { hack: Hack; open: boolean; onToggle: () => void; onTag: (tag: string) => void; onCategory: (category: string) => void; picked?: boolean; onPick?: (id: string) => void }) {
  const { updateHack, setVerdict, deleteHack } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<HackDraft>(() => draftFromHack(hack))
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState("")
  const ref = useRef<HTMLElement>(null)
  const bodyId = useId()

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "start" })
  }, [open])

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
                {hack.steps.map((step, index) => (
                  <li key={`${hack.id}-${index}`}>
                    {hack.pictures?.[index] ? <img className="step-photo" src={hack.pictures[index]} alt="" /> : null}
                    <span>{step}</span>
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
          </>
        )}
      </div> : null}
    </article>
  )
}
