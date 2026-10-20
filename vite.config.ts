import react from "@vitejs/plugin-react"
import { defineConfig, type Connect, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"

function readBody(req: Connect.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString()))
    req.on("error", reject)
  })
}

function sourceApi(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use("/api/source", (req, res) => {
      void (async () => {
        if (req.method !== "POST") {
          res.statusCode = 405
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify({ ok: false, error: "Use POST." }))
          return
        }
        try {
          const { sourceResponse } = await import("./api/_lib/fetchSource.ts")
          const raw = await readBody(req)
          let url = ""
          try {
            const body = JSON.parse(raw || "{}") as { url?: unknown }
            url = typeof body.url === "string" ? body.url : ""
          } catch {
            url = ""
          }
          const result = await sourceResponse(url)
          res.statusCode = result.status
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify(result.body))
        } catch {
          res.statusCode = 500
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify({ ok: false, error: "Could not read that link." }))
        }
      })()
    })
  }
  return {
    name: "snag-source-api",
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    sourceApi(),
    ...VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Snag",
        short_name: "Snag",
        description: "A cabinet of lifehacks snagged from videos and agents. The app is here. The cabinet stays on the computer you leave on.",
        theme_color: "#e8ebe6",
        background_color: "#e8ebe6",
        display: "standalone",
        start_url: "/",
        share_target: {
          action: "/snag",
          method: "GET",
          params: {
            title: "title",
            text: "text",
            url: "url",
          },
        },
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ["cactus-needle"],
  },
})
