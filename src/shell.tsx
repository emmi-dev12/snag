import { Inbox, Library, Plus } from "lucide-react"
import { NavLink, Outlet } from "react-router-dom"
import { useStore } from "./store.tsx"

export function Shell() {
  const { pending, toast, dismissToast } = useStore()
  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <main id="content" className="column">
        <Outlet />
      </main>
      <nav className="nav" aria-label="Primary">
        <NavLink to="/" end>
          <Library aria-hidden="true" size={22} strokeWidth={1.75} />
          Cabinet
        </NavLink>
        <NavLink to="/snag">
          <Plus aria-hidden="true" size={22} strokeWidth={1.75} />
          Snag
        </NavLink>
        <NavLink to="/inbox">
          <Inbox aria-hidden="true" size={22} strokeWidth={1.75} />
          {pending.length ? `Inbox ${pending.length}` : "Inbox"}
        </NavLink>
      </nav>
      {toast ? (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.run()
                dismissToast()
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
