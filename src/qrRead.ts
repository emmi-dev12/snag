export type Rgba = { data: Uint8ClampedArray; width: number; height: number }

export type QrDecode = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "attemptBoth" },
) => { data: string } | null

type Box = { sx: number; sy: number; sw: number; sh: number; maxEdge: number }

export function sample(src: Rgba, box: Box): Rgba {
  const sx = Math.max(0, Math.min(src.width - 1, Math.floor(box.sx)))
  const sy = Math.max(0, Math.min(src.height - 1, Math.floor(box.sy)))
  const sw = Math.max(1, Math.min(src.width - sx, Math.round(box.sw)))
  const sh = Math.max(1, Math.min(src.height - sy, Math.round(box.sh)))
  const edge = Math.max(sw, sh)
  const scale = edge > box.maxEdge ? box.maxEdge / edge : 1
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const py = Math.min(src.height - 1, sy + Math.floor(((y + 0.5) * sh) / height))
    for (let x = 0; x < width; x++) {
      const px = Math.min(src.width - 1, sx + Math.floor(((x + 0.5) * sw) / width))
      const from = (py * src.width + px) * 4
      const to = (y * width + x) * 4
      data[to] = src.data[from] ?? 0
      data[to + 1] = src.data[from + 1] ?? 0
      data[to + 2] = src.data[from + 2] ?? 0
      data[to + 3] = src.data[from + 3] ?? 255
    }
  }
  return { data, width, height }
}

// The center is tried first, large enough that a code on a phone screen still has a few pixels per module.
export function boxes(width: number, height: number): Box[] {
  return [
    { sx: width * 0.18, sy: height * 0.18, sw: width * 0.64, sh: height * 0.64, maxEdge: 1100 },
    { sx: width * 0.3, sy: height * 0.3, sw: width * 0.4, sh: height * 0.4, maxEdge: 900 },
    { sx: 0, sy: 0, sw: width, sh: height, maxEdge: 1000 },
  ]
}

export function decodeRgba(decode: QrDecode, frame: Rgba) {
  if (!frame.width || !frame.height) return ""
  for (const box of boxes(frame.width, frame.height)) {
    const view = sample(frame, box)
    const text = decode(view.data, view.width, view.height, { inversionAttempts: "attemptBoth" })?.data
    if (text) return text
  }
  return ""
}
