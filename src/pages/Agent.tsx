import { useState } from "react"
import { chatgptPrompt } from "../agentCopy.ts"
import { categoryLabel } from "../cards.ts"
import { sampleHash } from "../incoming.ts"
import { useStore } from "../store.tsx"

export function AgentPage() {
  const { hacks } = useStore()
  const drawers = [...new Set(hacks.map((hack) => hack.category).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b))
  const instructions = chatgptPrompt(drawers)
  const [copied, setCopied] = useState(false)

  return (
    <>
      <h1>For your agent</h1>
      <p className="lede">Paste this into ChatGPT. It names the drawers already in the cabinet. A hack with the same title updates that card, including its drawer.</p>
      {drawers.length ? <p className="note">Drawers: {drawers.map((name) => categoryLabel(name)).join(", ")}.</p> : null}
      <pre className="instructions">{instructions}</pre>
      <div className="row-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            void navigator.clipboard.writeText(instructions).then(
              () => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              },
              () => setCopied(false),
            )
          }}
        >
          {copied ? "Copied" : "Copy the ChatGPT prompt"}
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            window.location.assign(`/inbox#${sampleHash()}`)
          }}
        >
          File a sample
        </button>
      </div>
    </>
  )
}
