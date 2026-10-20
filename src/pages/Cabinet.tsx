import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Search } from "lucide-react"
import { haystack } from "../cards.ts"
import { HackSheet } from "../components/HackSheet.tsx"
import { useStore } from "../store.tsx"
import type { Verdict } from "../types.ts"

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
  const open = params.get("open")
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
    return ios && !standalone && localStorage.getItem("snag.install.dismissed") !== "1"
  })

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return hacks
      .filter((hack) => verdict === "all" || hack.verdict === verdict)
      .filter((hack) => !needle || haystack(hack).includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [hacks, query, verdict])

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

  const empty = !shown.length
  const emptyCopy = !hacks.length
    ? "Nothing in the cabinet yet."
    : query
      ? "Nothing matches that."
      : `Nothing marked ${verdict} yet.`

  return (
    <>
      <h1>Snag</h1>
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
      <p className="note">
        <Link className="quiet" to="/sync">
          Sync between devices
        </Link>
      </p>
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
