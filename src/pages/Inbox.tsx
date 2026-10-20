import { useState, lazy, Suspense, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { sourceLabel } from "../cards.ts"
import { sampleJson } from "../incoming.ts"
import { useStore } from "../store.tsx"

const QrScan = lazy(() => import("../components/QrScan.tsx").then((mod) => ({ default: mod.QrScan })))

const ERROR_KEY = "snag.incomingError"

export function InboxPage() {
  const { ready, pending, keepPending, discardPending, importIncoming } = useStore()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [paste, setPaste] = useState("")
  const [importError, setImportError] = useState("")
  const problem = dismissed ? null : sessionStorage.getItem(ERROR_KEY)

  async function takeJson(raw: string) {
    setImportError("")
    try {
      const count = await importIncoming(raw)
      setPaste("")
      if (!count) setImportError("No hacks in that JSON.")
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "That isn't JSON Snag can read.")
    }
  }

  return (
    <>
      <h1>Inbox</h1>
      <p className="lede">An agent files a hack by opening a link. A friend can show you a code. Or import a JSON file of hacks. They wait here until you keep them.</p>
      {scanning ? (
        <Suspense fallback={<p className="status">Opening the camera.</p>}>
          <QrScan onClose={() => setScanning(false)} />
        </Suspense>
      ) : null}
      <p className="note">
        <button type="button" className="quiet" onClick={() => setScanning((on) => !on)}>
          {scanning ? "Stop scanning" : "Scan a code"}
        </button>
        <button type="button" className="quiet" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
      </p>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="application/json,.json,.jsonl,.txt"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          void file.text().then((text) => takeJson(text))
        }}
      />
      <details className="manual">
        <summary>Paste JSON</summary>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault()
            void takeJson(paste)
          }}
        >
          <label className="field" htmlFor="json-paste">
            <span>Hacks</span>
            <textarea
              id="json-paste"
              value={paste}
              placeholder='{"hacks":[{"situation":"When …","title":"…","steps":["…"]}]}'
              onChange={(event) => setPaste(event.target.value)}
            />
          </label>
          <div className="row-actions">
            <button className="primary" type="submit" disabled={!paste.trim()}>
              Import
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setPaste(sampleJson())
                setImportError("")
              }}
            >
              Sample
            </button>
          </div>
        </form>
      </details>
      {importError ? (
        <p className="error" role="alert">
          {importError}
        </p>
      ) : null}
      {problem ? (
        <p className="error" role="alert">
          {problem}{" "}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              sessionStorage.removeItem(ERROR_KEY)
              setDismissed(true)
            }}
          >
            Dismiss
          </button>
        </p>
      ) : null}
      {!ready ? <p className="status">Opening the inbox.</p> : null}
      {ready && !pending.length ? (
        <div className="empty">
          <p className="situation">Nothing is waiting.</p>
          <p className="lede">
            <Link to="/agent">Set up filing from an agent</Link>
            {", or import JSON."}
          </p>
        </div>
      ) : null}
      {pending.map((hack) => (
        <article className="sheet is-open" key={hack.id}>
          <h2 className="situation">{hack.situation}</h2>
          {hack.title !== hack.situation ? <p className="title-line">{hack.title}</p> : null}
          {hack.steps.length ? (
            <ol className="steps">
              {hack.steps.map((step, index) => (
                <li key={`${hack.id}-${index}`}>{step}</li>
              ))}
            </ol>
          ) : null}
          {hack.caveat ? <p className="caveat">{hack.caveat}</p> : null}
          <p className="source-line">{sourceLabel(hack.source)}</p>
          <div className="row-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                void keepPending(hack.id).then((saved) => {
                  if (saved && pending.length === 1) navigate(`/?open=${saved.id}`)
                })
              }}
            >
              Keep
            </button>
            <button type="button" className="quiet" onClick={() => void discardPending(hack.id)}>
              Discard
            </button>
          </div>
        </article>
      ))}
    </>
  )
}
