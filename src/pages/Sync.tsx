import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { toDataURL } from "qrcode"
import { encodeSetup, endpointError, prepareSync, readSettings, syncNow, writeSettings, type SyncSettings } from "../sync.ts"

export function SyncPage() {
  const [settings, setSettings] = useState<SyncSettings>(readSettings)
  const [endpoint, setEndpoint] = useState(settings.endpoint)
  const [token, setToken] = useState(settings.token)
  const [qr, setQr] = useState("")
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      await prepareSync()
      if (!live) return
      const next = readSettings()
      setSettings(next)
      setEndpoint(next.endpoint)
      setToken(next.token)
      if (!next.endpoint || !next.token) return
      setPending(true)
      const result = await syncNow()
      if (!live) return
      setPending(false)
      if (result.ok) setStatus(result.message)
      else setError(result.message)
      const pairTarget = next.share || next.endpoint
      const pair = `${window.location.origin}/sync#setup=${encodeSetup({ endpoint: pairTarget, token: next.token })}`
      const image = await toDataURL(pair, { margin: 1, width: 280, color: { dark: "#1c1915", light: "#f7f8f6" } })
      if (live) setQr(image)
    })()
    return () => {
      live = false
    }
  }, [])

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
        <section className="pair">
          {qr ? <img className="pair-code" src={qr} alt="Code that connects another device to this cabinet" /> : <p className="status">Preparing the code.</p>}
          <p>
            {pending
              ? "Syncing."
              : error
                ? "The cabinet is on this computer."
                : `${(status || "Ready").replace(/\.$/, "")}. The cabinet is on this computer.`}
          </p>
          {tailnet ? <p>The other device needs Tailscale turned on.</p> : null}
        </section>
      ) : (
        <div className="stack">
          <p>This browser is not connected yet. On the computer that keeps the cabinet, Snag opens the connection itself.</p>
          <a className="primary" href="http://127.0.0.1:8787/">This is that computer</a>
        </div>
      )}
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
