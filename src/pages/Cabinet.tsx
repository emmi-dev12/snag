import { useEffect, useMemo, useState, lazy, Suspense } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Search } from "lucide-react"
import { toDataURL } from "qrcode"
import { categoryLabel, haystack } from "../cards.ts"
import { HackSheet } from "../components/HackSheet.tsx"
import { Mark } from "../components/Mark.tsx"
import { publishPack } from "../share.ts"
import { readSettings } from "../sync.ts"
import { useStore } from "../store.tsx"
import type { Verdict } from "../types.ts"

const QrScan = lazy(() => import("../components/QrScan.tsx").then((mod) => ({ default: mod.QrScan })))

const filters: { id: Verdict | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "untried", label: "Untried" },
  { id: "worked", label: "Worked" },
  { id: "failed", label: "Failed" },
]

export function Cabinet() {
  const { ready, hacks } = useStore()
  const [params, setParams] = useSearchParams()
  const query = params.get("q") ?? ""
  const verdict = (params.get("show") as Verdict | "all" | null) ?? "all"
  const category = params.get("cat") ?? ""
  const open = params.get("open")
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
    return ios && !standalone && localStorage.getItem("snag.install.dismissed") !== "1"
  })
  const [scanning, setScanning] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [packImage, setPackImage] = useState("")
  const [packError, setPackError] = useState("")
  const [packBusy, setPackBusy] = useState(false)
  const [packOpen, setPackOpen] = useState(false)
  const [drawersOpen, setDrawersOpen] = useState(() => Boolean(category))

  const categories = useMemo(() => {
    const names = new Set<string>()
    for (const hack of hacks) {
      if (hack.category) names.add(hack.category)
    }
    if (category && !names.has(category)) names.add(category)
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [hacks, category])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return hacks
      .filter((hack) => verdict === "all" || hack.verdict === verdict)
      .filter((hack) => !category || hack.category === category)
      .filter((hack) => !needle || haystack(hack).includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [hacks, query, verdict, category])

  function setOpen(id: string | null) {
    const copy = new URLSearchParams(params)
    if (id) copy.set("open", id)
    else copy.delete("open")
    setParams(copy, { replace: true })
  }

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstall(event as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (event.key === "/") {
        event.preventDefault()
        document.getElementById("find-hack")?.focus()
        return
      }
      const ids = shown.map((hack) => hack.id)
      if (!ids.length) return
      const index = open ? ids.indexOf(open) : -1
      if (event.key === "j") {
        event.preventDefault()
        setOpen(ids[Math.min(ids.length - 1, index + 1)])
      } else if (event.key === "k") {
        event.preventDefault()
        setOpen(ids[Math.max(0, index <= 0 ? 0 : index - 1)])
      } else if (event.key === "Escape" && open) {
        event.preventDefault()
        setOpen(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, shown])

  function setQuery(next: string) {
    const copy = new URLSearchParams(params)
    if (next) copy.set("q", next)
    else copy.delete("q")
    setParams(copy, { replace: true })
  }

  function setShow(next: Verdict | "all") {
    const copy = new URLSearchParams(params)
    if (next === "all") copy.delete("show")
    else copy.set("show", next)
    setParams(copy, { replace: true })
  }

  function setCategory(next: string) {
    const copy = new URLSearchParams(params)
    if (next) copy.set("cat", next)
    else copy.delete("cat")
    setParams(copy, { replace: true })
  }

  function togglePick(id: string) {
    setPackImage("")
    setPackError("")
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function makePack() {
    setPackError("")
    setPackBusy(true)
    try {
      const href = await publishPack(readSettings(), picked)
      const image = await toDataURL(href, {
        margin: 2,
        width: 280,
        errorCorrectionLevel: "M",
        color: { dark: "#1c1915", light: "#f7f8f6" },
      })
      setPackImage(image)
      setPackOpen(true)
    } catch (error) {
      setPackImage("")
      setPackError(error instanceof Error ? error.message : "Could not make a code for those cards.")
    } finally {
      setPackBusy(false)
    }
  }

  const empty = !shown.length
  const emptyCopy = !hacks.length
    ? "Nothing in the cabinet yet."
    : query
      ? "Nothing matches that."
      : category
        ? `Nothing in ${categoryLabel(category)}.`
        : `Nothing marked ${verdict} yet.`

  return (
    <>
      <h1 className="brand">
        <Mark />
        Snag
      </h1>
      <label className="search">
        <span className="sr-only">Find a hack</span>
        <Search aria-hidden="true" size={22} strokeWidth={1.75} />
        <input
          id="find-hack"
          value={query}
          placeholder="When the sink is leaking"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="filters" role="radiogroup" aria-label="Show">
        {filters.map((filter) => (
          <button key={filter.id} type="button" role="radio" aria-checked={verdict === filter.id} onClick={() => setShow(filter.id)}>
            {filter.label}
          </button>
        ))}
      </div>
      {categories.length ? (
        <details className="fold" open={drawersOpen} onToggle={(event) => setDrawersOpen(event.currentTarget.open)}>
          <summary>{category ? `Drawer · ${categoryLabel(category)}` : "Drawers"}</summary>
          <div className="filters categories" role="radiogroup" aria-label="Drawer">
            <button type="button" role="radio" aria-checked={!category} onClick={() => setCategory("")}>
              All
            </button>
            {categories.map((name) => (
              <button key={name} type="button" role="radio" aria-checked={category === name} onClick={() => setCategory(name)}>
                {categoryLabel(name)}
              </button>
            ))}
          </div>
        </details>
      ) : null}
      <p className="note">
        <button type="button" className="quiet" onClick={() => setScanning((on) => !on)}>
          {scanning ? "Stop scanning" : "Scan a code"}
        </button>
        {hacks.length ? (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setPicking((on) => {
                if (on) {
                  setPicked([])
                  setPackImage("")
                  setPackError("")
                }
                return !on
              })
            }}
          >
            {picking ? "Stop choosing" : "Share several"}
          </button>
        ) : null}
        <Link className="quiet" to="/sync">
          Sync between devices
        </Link>
      </p>
      {picking ? (
        <div className="stack">
          <button type="button" className="primary" disabled={!picked.length || packBusy} onClick={() => void makePack()}>
            {packBusy ? "Making the code" : picked.length === 1 ? "Share this 1 card" : picked.length ? `Share these ${picked.length} cards` : "Share these cards"}
          </button>
          {packError ? (
            <p className="error" role="alert">
              {packError}
            </p>
          ) : null}
          {packImage ? (
            <details className="fold share-code" open={packOpen} onToggle={(event) => setPackOpen(event.currentTarget.open)}>
              <summary>Share code</summary>
              <div className="pair">
                <img className="pair-code" src={packImage} alt="Code that files the chosen cards into a friend's Snag" />
                <p>A friend scans this one code in Snag. These cards, including the photos, wait in their inbox.</p>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      {scanning ? (
        <Suspense fallback={<p className="status">Opening the camera.</p>}>
          <QrScan onClose={() => setScanning(false)} />
        </Suspense>
      ) : null}
      {!ready ? <p className="status">Opening the cabinet.</p> : null}
      {ready && empty ? (
        <div className="empty">
          {!hacks.length ? (
            <Link className="ghost-link" to="/snag">
              <article className="sheet is-ghost">
                <span className="sr-only">Snag a hack</span>
              </article>
            </Link>
          ) : null}
          <p className="situation">{!hacks.length ? "The drawer is empty." : emptyCopy}</p>
          {!hacks.length ? (
            <p className="lede">
              <Link to="/snag">Snag a hack from a video</Link>
              {" or "}
              <Link to="/agent">let an agent file one</Link>
              . On a phone, share a YouTube link into Snag.
            </p>
          ) : null}
        </div>
      ) : null}
      {shown.map((hack) => (
        <HackSheet
          key={hack.id}
          hack={hack}
          open={open === hack.id}
          onToggle={() => setOpen(open === hack.id ? null : hack.id)}
          onTag={(tag) => setQuery(tag)}
          onCategory={(name) => setCategory(name)}
          picked={picked.includes(hack.id)}
          onPick={picking ? togglePick : undefined}
        />
      ))}
      {install ? (
        <p className="note">
          <button
            type="button"
            className="textish"
            onClick={() => {
              void install.prompt()
              setInstall(null)
            }}
          >
            Install on this device
          </button>
        </p>
      ) : null}
      {iosHint ? (
        <p className="note">
          To install, share this page and choose Add to Home Screen.{" "}
          <button
            type="button"
            className="textish"
            onClick={() => {
              localStorage.setItem("snag.install.dismissed", "1")
              setIosHint(false)
            }}
          >
            Dismiss
          </button>
        </p>
      ) : null}
    </>
  )
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
}
