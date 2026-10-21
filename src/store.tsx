import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Hack, HackDraft, HackSource, Verdict } from "./types.ts"
import * as db from "./db.ts"
import { makeHack } from "./cards.ts"
import { fileShared, persistIncoming, takeSharedUrl } from "./incoming.ts"
import { fetchShared } from "./share.ts"
import { bindSync, prepareSync, scheduleSync } from "./sync.ts"

type ToastAction = { label: string; run: () => void }

type Toast = { text: string; action?: ToastAction }

type Store = {
  ready: boolean
  hacks: Hack[]
  pending: Hack[]
  toast: Toast | null
  dismissToast: () => void
  saveHack: (draft: HackDraft, source?: HackSource) => Promise<Hack>
  updateHack: (id: string, draft: HackDraft) => Promise<void>
  setVerdict: (id: string, verdict: Verdict) => Promise<void>
  deleteHack: (id: string) => Promise<void>
  importIncoming: (raw: string, options?: { quiet?: boolean }) => Promise<number>
  keepPending: (id: string) => Promise<Hack | undefined>
  discardPending: (id: string) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [hacks, setHacks] = useState<Hack[]>([])
  const [pending, setPending] = useState<Hack[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef(0)

  const refresh = useCallback(async () => {
    const [nextHacks, nextPending] = await Promise.all([db.listHacks(), db.listPending()])
    setHacks(nextHacks)
    setPending(nextPending)
  }, [])

  const notify = useCallback((text: string, action?: ToastAction) => {
    window.clearTimeout(toastTimer.current)
    setToast({ text, action })
    toastTimer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current)
    setToast(null)
  }, [])

  useEffect(() => {
    let live = true
    const boot = () => {
      void persistIncoming().then(async () => {
        if (!live) return
        const shared = takeSharedUrl()
        if (shared) {
          try {
            const filed = await fileShared(await fetchShared(shared))
            const parts: string[] = []
            if (filed.updates) parts.push(filed.updates === 1 ? "Updated 1 hack." : `Updated ${filed.updates} hacks.`)
            if (filed.fresh) parts.push(filed.fresh === 1 ? "1 hack waiting." : `${filed.fresh} hacks waiting.`)
            if (parts.length) notify(parts.join(" "))
          } catch (error) {
            const message = error instanceof Error ? error.message : "That code did not include a card."
            sessionStorage.setItem("snag.incomingError", message)
          }
        }
        if (!live) return
        await prepareSync()
        await refresh()
        if (!live) return
        setReady(true)
        scheduleSync()
      })
    }
    boot()
    window.addEventListener("hashchange", boot)
    const unbind = bindSync(() => {
      void refresh()
    })
    return () => {
      live = false
      unbind()
      window.removeEventListener("hashchange", boot)
    }
  }, [notify, refresh])

  const value = useMemo<Store>(() => {
    return {
      ready,
      hacks,
      pending,
      toast,
      dismissToast,
      async saveHack(draft, source) {
        const hack = makeHack(draft, source)
        await db.putHack(hack)
        await refresh()
        scheduleSync()
        notify("Filed.")
        return hack
      },
      async updateHack(id, draft) {
        const current = (await db.listHacks()).find((item) => item.id === id)
        if (!current) return
        const next = makeHack(draft, current.source)
        const saved = { ...current, ...next, id: current.id, createdAt: current.createdAt, verdict: current.verdict, triedAt: current.triedAt, updatedAt: Date.now() }
        if (!next.category) delete saved.category
        await db.putHack(saved)
        await refresh()
        scheduleSync()
      },
      async setVerdict(id, verdict) {
        const current = (await db.listHacks()).find((item) => item.id === id)
        if (!current) return
        await db.putHack({
          ...current,
          verdict,
          triedAt: verdict === "untried" ? undefined : Date.now(),
          updatedAt: Date.now(),
        })
        await refresh()
        scheduleSync()
      },
      async deleteHack(id) {
        const current = (await db.listHacks()).find((item) => item.id === id)
        if (!current) return
        const at = Date.now()
        await db.putRemoval({ id, at })
        await db.deleteHack(id)
        await refresh()
        scheduleSync()
        notify("Deleted.", {
          label: "Undo",
          run: () => {
            const restored = { ...current, updatedAt: Math.max(Date.now(), at + 1) }
            void db.deleteRemoval(id).then(() => db.putHack(restored)).then(async () => {
              await refresh()
              scheduleSync()
            })
          },
        })
      },
      async keepPending(id) {
        const current = (await db.listPending()).find((item) => item.id === id)
        if (!current) return undefined
        const hack = makeHack(current, current.source)
        await db.putHack(hack)
        await db.deletePending(id)
        await refresh()
        scheduleSync()
        notify("Filed.")
        return hack
      },
      async discardPending(id) {
        await db.deletePending(id)
        await refresh()
      },
      async importIncoming(raw, options) {
        const { parseIncoming, splitIncoming, FILE_LIMIT } = await import("./incoming.ts")
        const items = parseIncoming(raw, { maxLength: FILE_LIMIT })
        const { updates, fresh } = splitIncoming(await db.listHacks(), items)
        for (const hack of updates) await db.putHack(hack)
        if (fresh.length) await db.putPending(fresh)
        if (updates.length) scheduleSync()
        await refresh()
        if (!options?.quiet) {
          const parts: string[] = []
          if (updates.length) parts.push(updates.length === 1 ? "Updated 1 hack." : `Updated ${updates.length} hacks.`)
          if (fresh.length) parts.push(fresh.length === 1 ? "1 hack waiting." : `${fresh.length} hacks waiting.`)
          if (parts.length) notify(parts.join(" "))
        }
        return updates.length + fresh.length
      },
    }
  }, [dismissToast, hacks, notify, pending, ready, refresh, toast])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error("Store missing")
  return store
}
