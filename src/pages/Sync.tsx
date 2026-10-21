import { lazy, Suspense, useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { toDataURL } from "qrcode"
import { discoverDesk, encodeSetup, endpointError, linkCodeStartsOpen, prepareSync, readSettings, syncNow, writeSettings, type SyncSettings } from "../sync.ts"

const QrScan = lazy(() => import("../components/QrScan.tsx").then((mod) => ({ default: mod.QrScan })))

function onDesk() {
  const host = window.location.hostname
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]"
}

export function SyncPage() {
  const [settings, setSettings] = useState<SyncSettings>(readSettings)
  const [endpoint, setEndpoint] = useState(settings.endpoint)
  const [token, setToken] = useState(settings.token)
  const [qr, setQr] = useState("")
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [codeOpen, setCodeOpen] = useState(() => linkCodeStartsOpen(window.location.hostname, window.location.hash, false))
  const desk = onDesk()

  async function showCode(next: SyncSettings, reveal: boolean) {
    if (!next.endpoint || !next.token) return
    const pairTarget = next.share || next.endpoint
    const pair = `${window.location.origin}/sync#setup=${encodeSetup({ endpoint: pairTarget, token: next.token })}`
    const image = await toDataURL(pair, { margin: 2, width: 320, errorCorrectionLevel: "M", color: { dark: "#1c1915", light: "#f7f8f6" } })
    setQr(image)
    if (reveal) setCodeOpen(true)
  }

  useEffect(() => {
    let live = true
    const open = linkCodeStartsOpen(window.location.hostname, window.location.hash, false)
    void (async () => {
      const reached = await discoverDesk()
      await prepareSync()
      if (!live) return
      const next = readSettings()
      setSettings(next)
      setEndpoint(next.endpoint)
      setToken(next.token)
      const reveal = open || Boolean(reached)
      if (reveal) setCodeOpen(true)
      if (!next.endpoint || !next.token) return
      setPending(true)
      try {
        const result = await syncNow()
        if (!live) return
        setPending(false)
        if (result.ok) setStatus(result.message)
        else setError(result.message)
      } catch {
        if (!live) return
        setPending(false)
        setError("Could not sync yet. The link code is still here.")
      }
      if (!live) return
      await showCode(next, reveal)
    })()
    return () => {
      live = false
    }
  }, [])

  async function claimComputer() {
    setError("")
    const reached = await discoverDesk()
    if (!reached) {
      window.location.assign("http://127.0.0.1:8787/")
      return
    }
    await prepareSync()
    const next = readSettings()
    setSettings(next)
    setEndpoint(next.endpoint)
    setToken(next.token)
    setCodeOpen(true)
    setPending(true)
    try {
      const result = await syncNow()
      setPending(false)
      if (result.ok) setStatus(result.message)
      else setError(result.message)
    } catch {
      setPending(false)
      setError("Could not sync yet. The link code is still here.")
    }
    await showCode(next, true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const problem = endpointError(endpoint)
    if (problem) {
      setError(problem)
      setStatus("")
      return
    }
    if (!token.trim()) {
      setError("Add the token from the computer that keeps the cabinet.")
      setStatus("")
      return
    }
    writeSettings({ endpoint, token })
    const next = readSettings()
    setSettings(next)
    setError("")
    setPending(true)
    const result = await syncNow()
    setPending(false)
    if (result.ok) setStatus(result.message)
    else setError(result.message)
  }

  const connected = Boolean(settings.endpoint && settings.token)
  const reach = settings.share || settings.endpoint
  const tailnet = reach.includes(".ts.net")

  return (
    <>
      <h1>Sync</h1>
      <p className="lede">
        One computer keeps the cabinet. Open Snag there and it connects. Scan the code on the other device and the cards, including photos, meet on that computer.
      </p>
      {connected ? (
        <details className="fold" open={codeOpen} onToggle={(event) => setCodeOpen(event.currentTarget.open)}>
          <summary>Link code</summary>
          <section className="pair">
            {qr ? <img className="pair-code" src={qr} alt="Code that connects another device to this cabinet" /> : <p className="status">Preparing the code.</p>}
            <p>
              {pending
                ? "Syncing."
                : desk
                  ? "The cabinet is on this computer. The other device scans this code."
                  : "This device is linked. The cabinet stays on the computer."}
            </p>
            {status && !pending && !error ? <p>{status}</p> : null}
            {tailnet ? <p>The other device needs Tailscale turned on.</p> : null}
          </section>
        </details>
      ) : (
        <p>This browser is not connected yet. On the computer that keeps the cabinet, Snag opens the connection itself.</p>
      )}
      <div className="stack">
        <button type="button" className="primary" onClick={() => setScanning((on) => !on)}>
          {scanning ? "Stop scanning" : "Link to an existing computer"}
        </button>
        {scanning ? (
          <Suspense fallback={<p className="status">Opening the camera.</p>}>
            <QrScan onClose={() => setScanning(false)} />
          </Suspense>
        ) : null}
        <button type="button" className="primary" onClick={() => void claimComputer()}>
          This is that computer
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="note">
        <Link className="quiet" to="/">
          Back to the cabinet
        </Link>
      </p>
      <details className="manual">
        <summary>Set the address yourself</summary>
        <form className="stack" onSubmit={(event) => void save(event)}>
          <label className="field" htmlFor="sync-endpoint">
            <span>Backend address</span>
            <input
              id="sync-endpoint"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </label>
          <label className="field" htmlFor="sync-token">
            <span>Token</span>
            <input
              id="sync-token"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Syncing" : "Save and sync"}
          </button>
        </form>
      </details>
    </>
  )
}
