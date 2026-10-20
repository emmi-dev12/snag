import { useEffect, useState } from "react"
import { toDataURL } from "qrcode"
import type { Hack } from "../types.ts"
import { shareHref } from "../share.ts"

export function QrShare({ hack }: { hack: Hack }) {
  const [image, setImage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let live = true
    const href = shareHref(window.location.origin, hack)
    if (href.length > 1800) {
      setError("Too many words for a code. Shorten the steps.")
      setImage("")
      return
    }
    void toDataURL(href, {
      margin: 1,
      width: 280,
      errorCorrectionLevel: "M",
      color: { dark: "#1c1915", light: "#f7f8f6" },
    })
      .then((next) => {
        if (!live) return
        setError("")
        setImage(next)
      })
      .catch(() => {
        if (!live) return
        setImage("")
        setError("Too many words for a code. Shorten the steps.")
      })
    return () => {
      live = false
    }
  }, [hack.id, hack.updatedAt])

  return (
    <details className="share-code">
      <summary>Share as a code</summary>
      <div className="pair">
        {image ? <img className="pair-code" src={image} alt={`Code that files ${hack.title || hack.situation} into a friend's Snag`} /> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p>Photos stay on this device. The code is the steps.</p>
        )}
      </div>
    </details>
  )
}
