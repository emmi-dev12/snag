import { useEffect, useRef, useState } from "react"
import { applyScan, interpretScan } from "../scan.ts"

type Detector = { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> }

function barcodeDetector(): Detector | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ["qr_code"] })
  } catch {
    return null
  }
}

async function readFromCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return ""
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return ""
  ctx.drawImage(video, 0, 0)
  const native = barcodeDetector()
  if (native) {
    const found = await native.detect(canvas)
    return found[0]?.rawValue ?? ""
  }
  const pixels = ctx.getImageData(0, 0, width, height)
  const { default: jsQR } = await import("jsqr")
  return jsQR(pixels.data, width, height)?.data ?? ""
}

async function readFromFile(file: File) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  ctx.drawImage(bitmap, 0, 0)
  const native = barcodeDetector()
  if (native) {
    const found = await native.detect(canvas)
    if (found[0]?.rawValue) return found[0].rawValue
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { default: jsQR } = await import("jsqr")
  return jsQR(pixels.data, canvas.width, canvas.height)?.data ?? ""
}

export function QrScan({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timer = useRef(0)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("Point the camera at a Snag code.")

  useEffect(() => {
    let live = true
    void (async () => {
      if (!window.isSecureContext) {
        setError("Scanning needs https, or localhost.")
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        })
        if (!live) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const tick = async () => {
          if (!live) return
          try {
            const canvas = canvasRef.current
            if (canvas && video.readyState >= 2) {
              const text = await readFromCanvas(canvas, video)
              if (text) {
                const message = applyScan(interpretScan(text))
                if (message) setError(message)
                else return
              }
            }
          } catch {
            /* keep looking */
          }
          timer.current = window.setTimeout(() => void tick(), 180)
        }
        void tick()
      } catch {
        setError("Allow the camera, or pick a photo of the code.")
        setStatus("No live camera on this device.")
      }
    })()
    return () => {
      live = false
      window.clearTimeout(timer.current)
      const stream = streamRef.current
      streamRef.current = null
      if (stream) for (const track of stream.getTracks()) track.stop()
    }
  }, [])

  return (
    <div className="stack">
      <p className="status">{status}</p>
      <div className="scan-frame">
        <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="sr-only" />
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-actions">
        <label className="quiet file-label">
          Pick a photo of a code
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (!file) return
              void readFromFile(file).then((text) => {
                if (!text) {
                  setError("No code in that photo.")
                  return
                }
                const message = applyScan(interpretScan(text))
                if (message) setError(message)
              })
            }}
          />
        </label>
        <button type="button" className="quiet" onClick={onClose}>
          Stop
        </button>
      </div>
    </div>
  )
}
