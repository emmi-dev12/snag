import { useState } from "react"
import { agentInstructions } from "../agentCopy.ts"
import { sampleHash } from "../incoming.ts"

export function AgentPage() {
  const origin = window.location.origin
  const instructions = agentInstructions(origin)
  const [copied, setCopied] = useState(false)

  return (
    <>
      <h1>For your agent</h1>
      <p className="lede">Paste this into the agent that should file hacks. The card rides in the link. It is not stored on a server.</p>
      <pre className="instructions">{instructions}</pre>
      <div className="row-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            void navigator.clipboard.writeText(instructions).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? "Copied" : "Copy instructions"}
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
