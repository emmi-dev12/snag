import { useEffect, useState } from "react"
import { toDataURL } from "qrcode"
import type { Hack } from "../types.ts"
import { shareTarget } from "../share.ts"
import { readSettings } from "../sync.ts"

export function QrShare({ hack }: { hack: Hack }) {
  const [open, setOpen] = useState(false)
  const [image, setImage] = useState("")
  const [error, setError] = useState("")
  const settings = readSettings()
  const target = shareTarget(window.location.origin, hack, settings.share || settings.endpoint)
  const note = target.photos
    ? "This code is only this card. A friend scans it in Snag, and the photos come with it."
    : "This code is only this card. A friend scans it in Snag. Turn on the computer that keeps the cabinet to send the photos too."
  const tooLong = open && !target.photos && target.href.length > 1800

  useEffect(() => {
    if (!open || tooLong) return
    let live = true
    void toDataURL(target.href, {
      margin: 2,
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
  }, [open, tooLong, target.href, target.photos])

  return (
    <details className="fold share-code" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Share this card</summary>
      {open ? (
        <div className="pair">
          {image ? <img className="pair-code" src={image} alt={`Code that files ${hack.title || hack.situation} into a friend's Snag`} /> : null}
          {tooLong || error ? (
            <p className="error" role="alert">
              {tooLong ? "Too many words for a code. Shorten the steps." : error}
            </p>
          ) : (
            <p>{note}</p>
          )}
        </div>
      ) : null}
    </details>
  )
}
