import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom"
import { Shell } from "./shell.tsx"
import { StoreProvider } from "./store.tsx"
import { Cabinet } from "./pages/Cabinet.tsx"
import { InboxPage } from "./pages/Inbox.tsx"
import { AgentPage } from "./pages/Agent.tsx"
import { SyncPage } from "./pages/Sync.tsx"

const SnagPage = lazy(() => import("./pages/Snag.tsx").then((mod) => ({ default: mod.SnagPage })))

function OpenHack() {
  const { id } = useParams()
  return <Navigate to={id ? `/?open=${id}` : "/"} replace />
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Cabinet />} />
            <Route
              path="snag"
              element={
                <Suspense fallback={<p className="status">Opening.</p>}>
                  <SnagPage />
                </Suspense>
              }
            />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="agent" element={<AgentPage />} />
            <Route path="sync" element={<SyncPage />} />
            <Route path="h/:id" element={<OpenHack />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
