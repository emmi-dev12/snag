import assert from "node:assert/strict"
import test from "node:test"
import QRCode from "qrcode"
import jsQR from "jsqr"
import { decodeRgba, type Rgba } from "../src/qrRead.ts"

const payload = "https://snag.example/sync#setup=abc123_dense-enough"

function paint(size: number, draw: (x: number, y: number) => boolean): Rgba {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dark = draw(x, y)
      const v = dark ? 0 : 255
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width: size, height: size }
}

function qrAt(canvas: number, modulePx: number) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" })
  const n = qr.modules.size
  const quiet = 4
  const qrPx = (n + quiet * 2) * modulePx
  const ox = Math.floor((canvas - qrPx) / 2)
  const oy = ox
  return paint(canvas, (x, y) => {
    const mx = Math.floor((x - ox) / modulePx) - quiet
    const my = Math.floor((y - oy) / modulePx) - quiet
    if (mx < 0 || my < 0 || mx >= n || my >= n) return false
    return Boolean(qr.modules.data[my * n + mx])
  })
}

test("jsQR reads a code that sits small in a large frame", () => {
  const frame = qrAt(1400, 5)
  assert.equal(typeof jsQR, "function")
  assert.equal(decodeRgba(jsQR, frame), payload)
})
