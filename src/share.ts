import type { Hack } from "./types.ts"
import { encodeCard } from "./incoming.ts"

export function sharePayload(hack: Hack) {
  return {
    situation: hack.situation,
    title: hack.title,
    steps: hack.steps.filter((step) => step.trim()),
    caveat: hack.caveat,
    tags: hack.tags,
    source: {
      kind: hack.source?.kind === "file" ? "typed" : (hack.source?.kind ?? "typed"),
      ...(hack.source?.label ? { label: hack.source.label } : {}),
      ...(hack.source?.url ? { url: hack.source.url } : {}),
    },
  }
}

export function shareHref(origin: string, hack: Hack) {
  return `${origin.replace(/\/$/, "")}/inbox#card=${encodeCard(sharePayload(hack))}`
}
