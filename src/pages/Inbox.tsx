import { useState, lazy, Suspense, useRef, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { categoryLabel, sourceLabel } from "../cards.ts"
import { chatgptPrompt } from "../agentCopy.ts"
import { filesFromTransfer } from "../dropFiles.ts"
import { sampleJson } from "../incoming.ts"
import { useStore } from "../store.tsx"

const QrScan = lazy(() => import("../components/QrScan.tsx").then((mod) => ({ default: mod.QrScan })))

const ERROR_KEY = "snag.incomingError"

export function InboxPage() {
  const { ready, hacks, pending, keepPending, discardPending, importIncoming } = useStore()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [paste, setPaste] = useState("")
  const [importError, setImportError] = useState("")
  const [copied, setCopied] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [landed, setLanded] = useState("")
  const problem = dismissed ? null : sessionStorage.getItem(ERROR_KEY)

  const takeDropped = useCallback(
    async (transfer: DataTransfer) => {
      setImportError("")
      setLanded("")
      let files: File[] = []
      try {
        files = await filesFromTransfer(transfer)
      } catch {
        setImportError("Drop a JSON file.")
        return
      }
      if (!files.length) {
        setImportError("Drop a JSON file.")
        return
      }
      const errors: string[] = []
      let total = 0
      for (const file of files) {
        try {
          const count = await importIncoming(await file.text(), { quiet: files.length > 1 })
          total += count
        } catch (error) {
          const message = error instanceof Error ? error.message : "That isn't JSON Snag can read."
          errors.push(files.length > 1 ? `${file.name}: ${message}` : message)
        }
      }
      if (files.length > 1 && total) setLanded(total === 1 ? "1 hack waiting." : `${total} hacks waiting.`)
      setImportError(errors.join(" "))
    },
    [importIncoming],
  )
  const dropRef = useRef(takeDropped)
  useEffect(() => {
    dropRef.current = takeDropped
  }, [takeDropped])

  useEffect(() => {
    let depth = 0

    function carryingFiles(event: DragEvent) {
      return [...(event.dataTransfer?.types ?? [])].includes("Files")
    }

    function enter(event: DragEvent) {
      if (!carryingFiles(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }

    function over(event: DragEvent) {
      if (!carryingFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    }

    function leave(event: DragEvent) {
      if (!carryingFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }

    function reset() {
      depth = 0
      setDragging(false)
    }

    async function drop(event: DragEvent) {
      if (!carryingFiles(event) || !event.dataTransfer) return
      event.preventDefault()
      reset()
      await dropRef.current(event.dataTransfer)
    }

    window.addEventListener("dragenter", enter)
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", drop)
    window.addEventListener("dragend", reset)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
      window.removeEventListener("dragend", reset)
    }
  }, [])

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
    <div className={dragging ? "inbox is-dropping" : "inbox"}>
      <h1>Inbox</h1>
      <p className="lede">An agent files a hack by opening a link. A friend can show you a code. Or drop a JSON file of hacks. They wait here until you keep them.</p>
      {dragging ? (
        <p className="drop-hint" role="status">
          Drop the JSON.
        </p>
      ) : null}
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
        <button
          type="button"
          className="quiet"
          onClick={() => {
            const drawers = hacks.map((hack) => hack.category).filter((name): name is string => Boolean(name))
            void navigator.clipboard.writeText(chatgptPrompt(drawers)).then(
              () => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              },
              () => setImportError("Could not copy the prompt."),
            )
          }}
        >
          {copied ? "Copied" : "Copy the ChatGPT prompt"}
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
      {landed ? <p className="status" role="status">{landed}</p> : null}
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
            {", or drop a JSON file."}
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
          {hack.category ? <p className="source-line">{categoryLabel(hack.category)}</p> : null}
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
    </div>
  )
}
