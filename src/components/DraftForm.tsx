import { useId, useState } from "react"
import { imageFileToDataUrl } from "../images.ts"
import type { HackDraft } from "../types.ts"

type Props = {
  value: HackDraft
  onChange: (next: HackDraft) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
  cancelLabel: string
  pending?: boolean
  error?: string
  note?: string
  offers?: string[]
}

export function DraftForm({ value, onChange, onSubmit, onCancel, submitLabel, cancelLabel, pending, error, note, offers = [] }: Props) {
  const base = useId()
  const [tagText, setTagText] = useState(() => value.tags.join(", "))
  const set = (patch: Partial<HackDraft>) => onChange({ ...value, ...patch })
  const pictures = value.pictures ?? []
  const choices = offers.filter((offer) => offer !== value.cover)

  async function addPhoto(file: File) {
    const image = await imageFileToDataUrl(file)
    if (!image) return
    if (!value.cover) set({ cover: image })
    else if (!pictures.includes(image) && pictures.length < 8) set({ pictures: [...pictures, image] })
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {note ? <p className="note">{note}</p> : null}
      <label className="field" htmlFor={`${base}-situation`}>
        <span>When</span>
        <textarea
          id={`${base}-situation`}
          value={value.situation}
          onChange={(event) => set({ situation: event.target.value })}
          required
        />
      </label>
      <label className="field" htmlFor={`${base}-title`}>
        <span>Name</span>
        <input id={`${base}-title`} value={value.title} onChange={(event) => set({ title: event.target.value })} />
      </label>
      <label className="field" htmlFor={`${base}-link`}>
        <span>Link</span>
        <input
          id={`${base}-link`}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={value.link ?? ""}
          onChange={(event) => set({ link: event.target.value })}
        />
      </label>
      <fieldset className="stack">
        <legend>Pictures</legend>
        {value.cover ? (
          <div className="photo-held">
            <img src={value.cover} alt="" />
            <button type="button" className="quiet" onClick={() => set({ cover: undefined })}>
              Remove photo
            </button>
          </div>
        ) : (
          <p className="note">No card photo yet. The card can stay text-only.</p>
        )}
        {pictures.length ? (
          <ul className="held-pictures">
            {pictures.map((src, index) => (
              <li key={`${src.slice(-24)}-${index}`}>
                <img src={src} alt={`Picture ${index + 1}`} />
                <button type="button" className="quiet" onClick={() => set({ cover: src })}>
                  Card photo
                </button>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => set({ pictures: pictures.filter((item) => item !== src) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {choices.length ? (
          <div className="picture-choices">
            {choices.map((src, index) => {
              const included = pictures.includes(src)
              return (
                <div className="offer" key={`${src.slice(-24)}-${index}`}>
                  <button
                    type="button"
                    aria-pressed={included}
                    aria-label={`${included ? "Remove" : "Include"} picture ${index + 1}`}
                    onClick={() =>
                      set({
                        pictures: included ? pictures.filter((item) => item !== src) : [...pictures, src].slice(0, 8),
                      })
                    }
                  >
                    <img src={src} alt="" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}
        <label className="quiet file-label">
          Add a photo
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void addPhoto(file)
            }}
          />
        </label>
      </fieldset>
      <fieldset className="stack">
        <legend>Steps</legend>
        {value.steps.map((step, index) => (
          <div className="step-edit" key={`${base}-step-${index}`}>
            <span className="step-index" aria-hidden="true">{index + 1}</span>
            <label className="field" htmlFor={`${base}-step-${index}`}>
              <span className="sr-only">Step {index + 1}</span>
              <textarea
                id={`${base}-step-${index}`}
                rows={2}
                value={step}
                onChange={(event) => {
                  const steps = [...value.steps]
                  steps[index] = event.target.value
                  set({ steps })
                }}
              />
            </label>
            <button
              type="button"
              className="quiet"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => set({ steps: value.steps.filter((_, item) => item !== index) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="textish" onClick={() => set({ steps: [...value.steps, ""] })}>
          Add a step
        </button>
      </fieldset>
      <label className="field" htmlFor={`${base}-caveat`}>
        <span>Where it goes wrong</span>
        <textarea id={`${base}-caveat`} value={value.caveat} onChange={(event) => set({ caveat: event.target.value })} />
      </label>
      <label className="field" htmlFor={`${base}-category`}>
        <span>Category</span>
        <input
          id={`${base}-category`}
          value={value.category ?? ""}
          placeholder="kitchen"
          onChange={(event) => set({ category: event.target.value })}
        />
      </label>
      <label className="field" htmlFor={`${base}-tags`}>
        <span>Tags</span>
        <input
          id={`${base}-tags`}
          value={tagText}
          onChange={(event) => {
            const raw = event.target.value
            setTagText(raw)
            set({ tags: raw.split(",") })
          }}
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-actions">
        <button className="primary" type="submit" disabled={pending}>
          {submitLabel}
        </button>
        <button className="quiet" type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </form>
  )
}
