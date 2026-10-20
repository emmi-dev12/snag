import { handleSync } from "../sync/library.mjs"

type HeaderValue = string | string[] | undefined

type RequestLike = {
  method?: string
  headers: { authorization?: HeaderValue }
  body?: unknown
}

type ResponseLike = {
  status: (code: number) => { json: (body: unknown) => void; end: () => void }
  setHeader: (name: string, value: string) => void
}

function header(value: HeaderValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  const result = await handleSync({
    method: req.method || "GET",
    authorization: header(req.headers.authorization),
    body: req.body,
  })
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
  if (result.status === 204) {
    res.status(204).end()
    return
  }
  res.status(result.status).json(result.body)
}
