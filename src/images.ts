function shot(video: HTMLVideoElement) {
  const width = video.videoWidth || 960
  const height = video.videoHeight || 540
  const maxWidth = 960
  const scale = Math.min(1, maxWidth / width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.72)
}

function fingerprint(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas")
  canvas.width = 24
  canvas.height = 14
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, 24, 14)
  return ctx.getImageData(0, 0, 24, 14).data
}

function distance(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let total = 0
  const count = Math.min(a.length, b.length) / 4
  for (let i = 0; i < count; i += 1) {
    const at = i * 4
    total += Math.abs(a[at] - b[at]) + Math.abs(a[at + 1] - b[at + 1]) + Math.abs(a[at + 2] - b[at + 2])
  }
  return total / (count * 3)
}

function seekTo(video: HTMLVideoElement, time: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.removeEventListener("seeked", finish)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.removeEventListener("seeked", finish)
      reject(new DOMException("Aborted", "AbortError"))
    }
    const timer = window.setTimeout(finish, 900)
    signal.addEventListener("abort", onAbort, { once: true })
    video.addEventListener("seeked", finish)
    if (Math.abs(video.currentTime - time) < 0.05 && video.readyState >= 2) finish()
    else video.currentTime = time
  })
}

export async function framesFromFile(file: File, signal: AbortSignal) {
  if (!file.type.startsWith("video/")) return []
  const url = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error("Could not read pictures from that file."))
      }
      const onAbort = () => {
        cleanup()
        reject(new DOMException("Aborted", "AbortError"))
      }
      const cleanup = () => {
        video.removeEventListener("loadeddata", onReady)
        video.removeEventListener("error", onError)
        signal.removeEventListener("abort", onAbort)
      }
      signal.addEventListener("abort", onAbort, { once: true })
      video.addEventListener("loadeddata", onReady)
      video.addEventListener("error", onError)
    })
    const duration = video.duration
    if (!Number.isFinite(duration) || duration < 0.2) return []
    try {
      await video.play()
      video.pause()
    } catch {
      // A seek still draws a frame when autoplay is refused.
    }
    const samples = Math.min(36, Math.max(6, Math.round(duration / 0.75)))
    const step = duration / samples
    const frames: string[] = []
    let previous: Uint8ClampedArray | null = null
    for (let index = 0; index < samples && frames.length < 12; index += 1) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      const time = Math.min(Math.max(duration - 0.05, 0), index * step + 0.04)
      await seekTo(video, time, signal)
      const print = fingerprint(video)
      if (previous && print && distance(previous, print) < 28) continue
      if (print) previous = print
      const image = shot(video)
      if (image.startsWith("data:image/jpeg") && image.length < 280_000) frames.push(image)
    }
    return frames
  } finally {
    video.src = ""
    URL.revokeObjectURL(url)
  }
}

export async function imageFileToDataUrl(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 960 / bitmap.width)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return ""
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL("image/jpeg", imageQuality(canvas))
    return image.length < 280_000 ? image : ""
  } finally {
    bitmap.close()
  }
}

function imageQuality(canvas: HTMLCanvasElement) {
  const estimate = canvas.width * canvas.height
  return estimate > 700_000 ? 0.62 : 0.72
}
