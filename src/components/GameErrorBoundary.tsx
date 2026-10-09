import type { ErrorComponentProps } from "@tanstack/react-router"
import { Component, type ErrorInfo, type ReactNode, useEffect } from "react"
import { Button } from "@/components/ui/button"

function GameErrorPanel({ onReload }: { onReload: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="rounded-2xl border border-white/10 bg-black/70 p-5 text-center text-white shadow-xl backdrop-blur">
        <p className="mb-3 text-sm font-semibold">Something broke</p>
        <Button size="sm" onClick={onReload}>Reload game</Button>
      </div>
    </div>
  )
}

/**
 * Route-level fallback. A full reload keeps the room: the invite code stays in
 * the URL and the seat comes back from sessionStorage (see multiplayerSession).
 */
export function GameRouteError({ error }: ErrorComponentProps) {
  useEffect(() => {
    console.error("[game] route crashed", error)
  }, [error])
  return (
    <div className="relative min-h-[60vh]">
      <GameErrorPanel onReload={() => window.location.reload()} />
    </div>
  )
}

/**
 * Around a three.js canvas: unmounting the crashed subtree runs the scene's
 * dispose, and "Reload game" remounts just the canvas so the room socket,
 * which lives above it, never drops.
 */
export class GameErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[game] scene crashed", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <GameErrorPanel onReload={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}
