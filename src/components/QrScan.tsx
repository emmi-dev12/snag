import { useEffect, useRef, useState } from "react"
import { applyScan, interpretScan } from "../scan.ts"
import { decodeRgba, type QrDecode, type Rgba } from "../qrRead.ts"

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

function needsGesture() {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  const nav = navigator as Navigator & { platform?: string }
  return nav.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

async function loadDecoder(): Promise<QrDecode> {
  const mod = await import("jsqr")
  const fn = mod.default
  if (typeof fn !== "function") throw new Error("reader")
  return fn
}

async function detectNative(source: CanvasImageSource) {
  const native = barcodeDetector()
  if (!native) return ""
  try {
    const found = await Promise.race([
      native.detect(source),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("slow")), 350)),
    ])
    return found[0]?.rawValue ?? ""
  } catch {
    return ""
  }
}

function grab(canvas: HTMLCanvasElement, source: CanvasImageSource, width: number, height: number): Rgba | null {
  if (!width || !height) return null
  const scale = Math.min(1, 1600 / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data: pixels.data, width: canvas.width, height: canvas.height }
}

async function openStream() {
  const choices: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: true },
  ]
  let last: unknown
  for (const constraints of choices) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      last = error
    }
  }
  throw last
}

export function QrScan({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timer = useRef(0)
  const liveRef = useRef(true)
  const scanGen = useRef(0)
  const decoderRef = useRef<QrDecode | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("Point the camera at a Snag code.")
  const [needTap, setNeedTap] = useState(needsGesture)
  const [needPlay, setNeedPlay] = useState(false)

  function stopLoop() {
    window.clearTimeout(timer.current)
  }

  function arm(video: HTMLVideoElement) {
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute("playsinline", "true")
    video.setAttribute("webkit-playsinline", "true")
  }

  async function look(gen: number) {
    if (!liveRef.current || gen !== scanGen.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    try {
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const native = await detectNative(video)
        const text = native || decodeRgba(await reader(), grab(canvas, video, video.videoWidth, video.videoHeight) ?? { data: new Uint8ClampedArray(), width: 0, height: 0 })
        if (text && liveRef.current && gen === scanGen.current) {
          const message = applyScan(interpretScan(text))
          if (message) setError(message)
          else return
        }
      }
    } catch {
      /* keep looking */
    }
    if (!liveRef.current || gen !== scanGen.current) return
    timer.current = window.setTimeout(() => void look(gen), 280)
  }

  async function reader() {
    if (!decoderRef.current) decoderRef.current = await loadDecoder()
    return decoderRef.current
  }

  async function startCamera() {
    const gen = scanGen.current + 1
    scanGen.current = gen
    stopLoop()
    if (!window.isSecureContext) {
      setError("Scanning needs https, or localhost.")
      return
    }
    const video = videoRef.current
    if (!video) return
    arm(video)
    setError("")
    setStatus("Starting the camera.")
    try {
      const stream = await openStream()
      if (!liveRef.current || gen !== scanGen.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      const previous = streamRef.current
      streamRef.current = stream
      if (previous) for (const track of previous.getTracks()) track.stop()
      video.srcObject = stream
      if (video.readyState < 1) {
        await new Promise<void>((resolve) => {
          const done = () => resolve()
          video.addEventListener("loadedmetadata", done, { once: true })
          window.setTimeout(done, 1200)
        })
      }
      try {
        await video.play()
        if (!liveRef.current || gen !== scanGen.current) return
        setNeedTap(false)
        setNeedPlay(false)
        setStatus("Fit the code in the square.")
      } catch {
        if (!liveRef.current || gen !== scanGen.current) return
        setNeedTap(false)
        setNeedPlay(true)
        setStatus("Tap the picture to start the camera.")
      }
      void reader().catch(() => setError("The reader didn't load. Take a photo of the code instead."))
      void look(gen)
    } catch {
      if (!liveRef.current || gen !== scanGen.current) return
      setNeedTap(true)
      setNeedPlay(false)
      setError("Allow the camera, or take a photo of the code.")
      setStatus("No live camera on this device.")
    }
  }

  function playPicture() {
    const video = videoRef.current
    if (!video) return
    arm(video)
    void video.play().then(() => {
      setNeedPlay(false)
      setStatus("Fit the code in the square.")
    }).catch(() => setError("Tap the picture again."))
  }

  async function readFile(file: File) {
    setError("")
    setStatus("Reading that photo.")
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = canvasRef.current ?? document.createElement("canvas")
      const frame = grab(canvas, bitmap, bitmap.width, bitmap.height)
      bitmap.close()
      const text = frame ? decodeRgba(await reader(), frame) : ""
      if (!text) {
        setError("No code in that photo.")
        setStatus("Point the camera at a Snag code.")
        return
      }
      const message = applyScan(interpretScan(text))
      if (message) setError(message)
    } catch {
      setError("No code in that photo.")
    }
  }

  useEffect(() => {
    liveRef.current = true
    if (!needsGesture()) void startCamera()
    return () => {
      liveRef.current = false
      scanGen.current += 1
      stopLoop()
      const stream = streamRef.current
      streamRef.current = null
      if (stream) for (const track of stream.getTracks()) track.stop()
    }
  }, [])

  return (
    <div className="stack">
      <p className="status">{status}</p>
      {needTap ? (
        <button type="button" className="primary" onClick={() => void startCamera()}>
          Start the camera
        </button>
      ) : null}
      <div className="scan-frame">
        <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
        <span className="scan-aim" aria-hidden="true" />
        <canvas ref={canvasRef} className="sr-only" />
        {needPlay ? (
          <button type="button" className="scan-play" onClick={playPicture}>
            Tap the picture
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-actions">
        <label className="quiet file-label">
          Take a photo of the code
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void readFile(file)
            }}
          />
        </label>
        <label className="quiet file-label">
          Choose a saved photo
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void readFile(file)
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
