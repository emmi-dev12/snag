import { execFile, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { authorized, handleSync, readLibrary } from "./library.mjs"

const MAX_BODY = 8_000_000
const PORT = Number(process.env.PORT || 8787)

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, ngrok-skip-browser-warning",
  "access-control-allow-private-network": "true",
  "cache-control": "no-store",
}

function serverFile() {
  if (process.env.SNAG_SERVER) return process.env.SNAG_SERVER
  return new URL("../data/server.json", import.meta.url).pathname
}

export async function ensureToken() {
  if (process.env.SYNC_TOKEN) return process.env.SYNC_TOKEN
  const file = serverFile()
  try {
    const saved = JSON.parse(await readFile(file, "utf8"))
    if (typeof saved.token === "string" && saved.token.length >= 16) {
      process.env.SYNC_TOKEN = saved.token
      return saved.token
    }
  } catch {
    // A missing file means this computer has not kept a cabinet yet.
  }
  const token = randomBytes(32).toString("base64url")
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({ token })}\n`)
  process.env.SYNC_TOKEN = token
  return token
}

function localHost(req) {
  const host = String(req.headers.host || "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase()
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 8000 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }))
      else resolve(String(stdout))
    })
  })
}

let sharePromise = null
let ngrokChild = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ngrokPublicUrl(port) {
  try {
    const response = await fetch("http://127.0.0.1:4040/api/tunnels", { signal: AbortSignal.timeout(1000) })
    if (!response.ok) return ""
    const data = await response.json()
    for (const tunnel of data.tunnels || []) {
      const addr = String(tunnel.config?.addr || "")
      const publicUrl = String(tunnel.public_url || "")
      if (!publicUrl.startsWith("https://")) continue
      if (addr.endsWith(`:${port}`)) return `${publicUrl.replace(/\/$/, "")}/sync`
    }
  } catch {
    return ""
  }
  return ""
}

function startNgrok(port) {
  if (ngrokChild) return
  const child = spawn("ngrok", ["http", `127.0.0.1:${port}`, "--log=false"], { stdio: "ignore", env: process.env })
  child.on("error", () => {
    if (ngrokChild === child) ngrokChild = null
  })
  child.on("exit", () => {
    if (ngrokChild === child) ngrokChild = null
  })
  ngrokChild = child
}

async function ngrokShare(port) {
  const existing = await ngrokPublicUrl(port)
  if (existing) return existing
  startNgrok(port)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500)
    const url = await ngrokPublicUrl(port)
    if (url) return url
  }
  return ""
}

async function tailscaleShare(port) {
  try {
    const status = JSON.parse(await exec("tailscale", ["status", "--json"]))
    const dns = String(status.Self?.DNSName || "").replace(/\.$/, "")
    if (!dns) return ""
    const serve = JSON.parse(await exec("tailscale", ["serve", "status", "--json"]))
    const proxy = serve?.Web?.[`${dns}:8443`]?.Handlers?.["/"]?.Proxy || ""
    if (!String(proxy).includes(`127.0.0.1:${port}`)) {
      await exec("tailscale", ["serve", "--bg", "--https=8443", "--yes", `http://127.0.0.1:${port}`])
    }
    return `https://${dns}:8443/sync`
  } catch {
    return ""
  }
}

async function resolveShare(port) {
  const tunneled = await ngrokShare(port)
  if (tunneled) return tunneled
  return tailscaleShare(port)
}

export function shareEndpoint(port) {
  if (process.env.SNAG_SYNC_URL) return Promise.resolve(process.env.SNAG_SYNC_URL)
  if (process.env.SNAG_NO_SHARE) return Promise.resolve("")
  if (!sharePromise) {
    sharePromise = resolveShare(port).then((url) => {
      if (!url) sharePromise = null
      return url || ""
    })
  }
  return sharePromise
}

function stopShare() {
  if (!ngrokChild) return
  ngrokChild.kill("SIGTERM")
  ngrokChild = null
}

async function maybeOpen(share) {
  if (!share || !process.env.SNAG_APP || process.env.SNAG_NO_OPEN) return
  const file = new URL("../data/public.json", import.meta.url)
  try {
    const saved = JSON.parse(await readFile(file, "utf8"))
    if (saved.share === share) return
  } catch {
    // The first time this address is ready, open Snag so this computer connects.
  }
  await mkdir(dirname(file.pathname), { recursive: true })
  await writeFile(file, `${JSON.stringify({ share })}\n`)
  const child = spawn("open", [`http://127.0.0.1:${PORT}/`], { stdio: "ignore", detached: true })
  child.on("error", () => {})
  child.unref()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("too big"), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString()))
    req.on("error", reject)
  })
}

function packsFile() {
  const data = process.env.SNAG_DATA || new URL("../data/library.json", import.meta.url).pathname
  return join(dirname(data), "packs.json")
}

async function readPacks() {
  try {
    const parsed = JSON.parse(await readFile(packsFile(), "utf8"))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function writePacks(packs) {
  const file = packsFile()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(packs)}\n`)
}

function routeOf(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/"
  const card = /^\/card\/([A-Za-z0-9_-]{1,80})$/.exec(path)
  if (card) return { kind: "card", id: card[1] }
  if (path === "/pack") return { kind: "pack" }
  const pack = /^\/pack\/([A-Za-z0-9_-]{1,80})$/.exec(path)
  if (pack) return { kind: "pack", id: pack[1] }
  if (path === "/sync" || path.endsWith("/sync")) return { kind: "sync" }
  if (path === "/setup" || path.endsWith("/setup")) return { kind: "setup" }
  if (path === "/") return { kind: "home" }
  return { kind: "" }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...cors })
  res.end(JSON.stringify(body))
}

function landing(share, token) {
  const app = (process.env.SNAG_APP || "").replace(/\/$/, "")
  const endpoint = share || `http://127.0.0.1:${PORT}/sync`
  if (!app || !token) {
    return "<!doctype html><meta charset=\"utf-8\"><title>Snag</title><p>This computer keeps the cabinet. Open Snag and it connects on its own.</p>"
  }
  const payload = Buffer.from(JSON.stringify({ endpoint, token })).toString("base64url")
  const target = `${app}/sync#setup=${payload}`
  return `<!doctype html><meta charset="utf-8"><title>Snag</title><p>Connecting the cabinet.</p><script>location.replace(${JSON.stringify(target)})</script>`
}

export function createSyncServer(options = {}) {
  const port = options.port || PORT
  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || "/", "http://127.0.0.1")
      const route = routeOf(url.pathname)
      if (!route.kind) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8", ...cors })
        res.end(JSON.stringify({ ok: false, error: "Sync lives at /sync." }))
        return
      }
      if (route.kind === "card" || route.kind === "pack") {
        if (req.method === "OPTIONS") {
          res.writeHead(204, cors)
          res.end()
          return
        }
        const library = await readLibrary()
        if (route.kind === "card") {
          if (req.method !== "GET") {
            sendJson(res, 405, { ok: false, error: "Use GET." })
            return
          }
          const hack = library.hacks.find((item) => item.id === route.id)
          if (!hack) {
            sendJson(res, 404, { ok: false, error: "That card is not on this computer." })
            return
          }
          sendJson(res, 200, { hacks: [hack] })
          return
        }
        if (req.method === "GET" && route.id) {
          const packs = await readPacks()
          const pack = packs[route.id]
          const ids = pack && Array.isArray(pack.ids) ? pack.ids : null
          if (!ids) {
            sendJson(res, 404, { ok: false, error: "That pack is not on this computer." })
            return
          }
          const byId = new Map(library.hacks.map((item) => [item.id, item]))
          sendJson(res, 200, { hacks: ids.map((id) => byId.get(id)).filter(Boolean) })
          return
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Use GET or POST." })
          return
        }
        if (!process.env.SYNC_TOKEN) {
          sendJson(res, 503, { ok: false, error: "Set SYNC_TOKEN on the backend before syncing." })
          return
        }
        if (!authorized(req.headers.authorization || "")) {
          sendJson(res, 401, { ok: false, error: "That token was refused." })
          return
        }
        let parsed = {}
        try {
          parsed = JSON.parse((await readBody(req)) || "{}")
        } catch {
          sendJson(res, 400, { ok: false, error: "That pack was not JSON." })
          return
        }
        const ids = (Array.isArray(parsed.ids) ? parsed.ids : [])
          .filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id))
          .slice(0, 40)
        const known = new Set(library.hacks.map((item) => item.id))
        const kept = ids.filter((id) => known.has(id))
        if (!kept.length) {
          sendJson(res, 400, { ok: false, error: "Choose a card that is on this computer." })
          return
        }
        const packs = await readPacks()
        const id = randomBytes(9).toString("base64url")
        packs[id] = { ids: kept, at: Date.now() }
        const oldest = Object.entries(packs).sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))
        while (oldest.length > 80) {
          const drop = oldest.shift()
          if (drop) delete packs[drop[0]]
        }
        await writePacks(packs)
        sendJson(res, 200, { ok: true, id, count: kept.length })
        return
      }
      if (route.kind === "setup" || route.kind === "home") {
        if (!localHost(req)) {
          res.writeHead(404, { "content-type": "application/json; charset=utf-8" })
          res.end(JSON.stringify({ ok: false, error: "Sync lives at /sync." }))
          return
        }
        if (req.method === "OPTIONS") {
          res.writeHead(204, cors)
          res.end()
          return
        }
        if (req.method !== "GET") {
          res.writeHead(405, { "content-type": "application/json; charset=utf-8", ...cors })
          res.end(JSON.stringify({ ok: false, error: "Use GET." }))
          return
        }
        const token = process.env.SYNC_TOKEN || ""
        const share = await shareEndpoint(port)
        if (route.kind === "home") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
          res.end(landing(share, token))
          return
        }
        const body = {
          ok: true,
          token,
          endpoint: `http://127.0.0.1:${port}/sync`,
          ...(share ? { share } : {}),
          ...((process.env.SNAG_APP || "") ? { app: process.env.SNAG_APP } : {}),
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", ...cors })
        res.end(JSON.stringify(body))
        return
      }
      let body = ""
      try {
        body = req.method === "PUT" ? await readBody(req) : ""
      } catch (error) {
        const status = error && error.status === 413 ? 413 : 400
        res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...cors })
        res.end(JSON.stringify({ ok: false, error: status === 413 ? "That sync is too big." : "Could not read the sync." }))
        return
      }
      const result = await handleSync({
        method: req.method || "GET",
        authorization: req.headers.authorization || "",
        body,
      })
      res.writeHead(result.status, result.headers)
      res.end(result.body == null ? "" : JSON.stringify(result.body))
    })()
  })
}

const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (main) {
  await ensureToken()
  const server = createSyncServer({ port: PORT })
  const shutdown = () => {
    stopShare()
    const timer = setTimeout(() => process.exit(0), 1500)
    server.close(() => {
      clearTimeout(timer)
      process.exit(0)
    })
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
  server.listen(PORT, "127.0.0.1", () => {
    void shareEndpoint(PORT).then((share) => {
      console.log(`Snag cabinet listening on 127.0.0.1:${PORT}`)
      if (share) console.log(`Other devices reach it at ${share}`)
      return maybeOpen(share)
    })
  })
}
