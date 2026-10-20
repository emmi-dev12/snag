import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { Hack, Removal } from "./types.ts"

interface SnagDB extends DBSchema {
  hacks: { key: string; value: Hack }
  pending: { key: string; value: Hack }
  removed: { key: string; value: Removal }
}

let database: Promise<IDBPDatabase<SnagDB>> | null = null

function db() {
  database ??= openDB<SnagDB>("snag", 2, {
    upgrade(store, oldVersion) {
      if (oldVersion < 1) {
        store.createObjectStore("hacks", { keyPath: "id" })
        store.createObjectStore("pending", { keyPath: "id" })
      }
      if (oldVersion < 2) store.createObjectStore("removed", { keyPath: "id" })
    },
  })
  return database
}

export async function listHacks() {
  return (await db()).getAll("hacks")
}

export async function listPending() {
  return (await db()).getAll("pending")
}

export async function putHack(hack: Hack) {
  await (await db()).put("hacks", hack)
}

export async function deleteHack(id: string) {
  await (await db()).delete("hacks", id)
}

export async function putPending(items: Hack[]) {
  const database = await db()
  const tx = database.transaction("pending", "readwrite")
  await Promise.all([...items.map((item) => tx.store.put(item)), tx.done])
}

export async function deletePending(id: string) {
  await (await db()).delete("pending", id)
}

export async function listRemovals() {
  return (await db()).getAll("removed")
}

export async function putRemoval(removal: Removal) {
  await (await db()).put("removed", removal)
}

export async function deleteRemoval(id: string) {
  await (await db()).delete("removed", id)
}

export async function replaceLibrary(hacks: Hack[], removed: Removal[]) {
  const database = await db()
  const tx = database.transaction(["hacks", "removed"], "readwrite")
  await Promise.all([tx.objectStore("hacks").clear(), tx.objectStore("removed").clear()])
  await Promise.all([
    ...hacks.map((hack) => tx.objectStore("hacks").put(hack)),
    ...removed.map((removal) => tx.objectStore("removed").put(removal)),
    tx.done,
  ])
}
