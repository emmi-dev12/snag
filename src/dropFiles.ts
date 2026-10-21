export function isJsonName(name: string) {
  const lower = name.toLowerCase()
  return lower.endsWith(".json") || lower.endsWith(".jsonl") || lower.endsWith(".txt")
}

export function keepJson(files: File[]) {
  return files
    .filter((file) => isJsonName(file.name) || file.type === "application/json")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

function fileOf(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

function readAll(dir: FileSystemDirectoryEntry) {
  const reader = dir.createReader()
  const all: FileSystemEntry[] = []
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    const pull = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all)
          return
        }
        all.push(...batch)
        pull()
      }, reject)
    }
    pull()
  })
}

async function filesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await fileOf(entry as FileSystemFileEntry)]
  if (!entry.isDirectory) return []
  const children = await readAll(entry as FileSystemDirectoryEntry)
  const files = await Promise.all(children.filter((child) => child.isFile).map((child) => fileOf(child as FileSystemFileEntry)))
  return files
}

export async function filesFromTransfer(transfer: DataTransfer) {
  const items = [...transfer.items].filter((item) => item.kind === "file")
  const entries: FileSystemEntry[] = []
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  const found: File[] = []
  if (entries.length) {
    for (const entry of entries) found.push(...(await filesFromEntry(entry)))
  } else {
    found.push(...transfer.files)
  }
  return keepJson(found)
}
