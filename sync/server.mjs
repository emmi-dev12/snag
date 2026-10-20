import { execFile, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { handleSync } from "./library.mjs"

const MAX_BODY = 8_000_000
const PORT = Number(process.env.PORT || 8787)

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
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

function routeOf(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === "/sync" || path.endsWith("/sync")) return "sync"
  if (path === "/setup" || path.endsWith("/setup")) return "setup"
  if (path === "/") return "home"
  return ""
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
      if (!route) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8", ...cors })
        res.end(JSON.stringify({ ok: false, error: "Sync lives at /sync." }))
        return
      }
      if (route === "setup" || route === "home") {
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
        if (route === "home") {
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
