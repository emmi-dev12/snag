const MAX_BYTES = 60 * 1024 * 1024
const MAX_SECONDS = 12 * 60

export async function fileToMono16k(file: File) {
  if (file.size > MAX_BYTES) {
    throw new Error("That file is over 60 MB. Use a shorter clip.")
  }
  const context = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer())
  } catch {
    throw new Error("This file didn't decode as audio. Try a clip with a soundtrack.")
  } finally {
    await context.close()
  }
  if (decoded.duration > MAX_SECONDS) {
    throw new Error("That clip is over 12 minutes. Cut it down to the part with the hack.")
  }
  const length = Math.max(1, Math.ceil(decoded.duration * 16000))
  const offline = new OfflineAudioContext(1, length, 16000)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return new Float32Array(rendered.getChannelData(0))
}

export function secondChunks(samples: Float32Array) {
  const chunks: Float32Array[] = []
  for (let index = 0; index < samples.length; index += 16000) {
    chunks.push(samples.slice(index, Math.min(index + 16000, samples.length)))
  }
  return chunks
}
