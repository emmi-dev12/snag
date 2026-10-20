import { sourceResponse } from "./_lib/fetchSource.ts"

type RequestLike = { method?: string; body?: unknown }
type ResponseLike = { status: (code: number) => { json: (body: unknown) => void } }

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Use POST." })
    return
  }
  const url = typeof req.body === "object" && req.body && "url" in req.body && typeof (req.body as { url?: unknown }).url === "string"
    ? (req.body as { url: string }).url
    : ""
  const result = await sourceResponse(url)
  res.status(result.status).json(result.body)
}
