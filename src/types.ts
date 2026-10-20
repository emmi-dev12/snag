export type Verdict = "untried" | "worked" | "failed"

export type SourceKind = "youtube" | "instagram" | "facebook" | "web" | "agent" | "file" | "typed"

export type TextKind = "transcript" | "caption" | "page" | "speech"

export type HackSource = {
  kind: SourceKind
  url?: string
  label?: string
  textKind?: TextKind
}

export type HackDraft = {
  situation: string
  title: string
  steps: string[]
  caveat: string
  tags: string[]
  /** The page this hack came from. Empty string clears a saved link. */
  link?: string
  cover?: string
  pictures?: string[]
}

export type Removal = { id: string; at: number }

export type Hack = HackDraft & {
  id: string
  source?: HackSource
  verdict: Verdict
  createdAt: number
  updatedAt: number
  triedAt?: number
}

export type FetchedSource = {
  kind: "youtube" | "instagram" | "facebook" | "web"
  url: string
  title: string
  author: string
  text: string
  textKind: "transcript" | "caption" | "page"
  warning?: string
  tags?: string[]
  cover?: string
  stills?: string[]
}
