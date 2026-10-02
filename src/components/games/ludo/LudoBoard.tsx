import { useEffect, useRef, useState } from "react"
import { LUDO_COLORS } from "@/lib/ludo"
import {
  createLudoScene,
  type LudoScene,
  type LudoSceneState,
  type LudoSceneTarget,
  type LudoSceneToken,
} from "./ludoScene"

export type LudoMoveTarget = LudoSceneTarget
export type LudoTokenView = LudoSceneToken

export function LudoBoard({
  tokens,
  targets,
  activeSeats,
  viewSeat = null,
  turnSeat = null,
  dice = { values: null, rolling: false },
  selectedPawn = null,
  lastMove = null,
  onSelectPawn,
  onSelectTarget,
}: {
  tokens: LudoTokenView[]
  targets: LudoMoveTarget[]
  activeSeats: number[]
  viewSeat?: number | null
  turnSeat?: number | null
  dice?: { values: readonly [number, number] | null; rolling: boolean }
  selectedPawn?: string | null
  lastMove?: LudoSceneState["lastMove"]
  onSelectPawn: (seat: number, tokenIndex: number) => void
  onSelectTarget: (moveId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<LudoScene | null>(null)
  const handlersRef = useRef({ onSelectPawn, onSelectTarget })
  handlersRef.current = { onSelectPawn, onSelectTarget }
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let scene: LudoScene
    try {
      scene = createLudoScene(container, {
        onSelectPawn: (seat, tokenIndex) =>
          handlersRef.current.onSelectPawn(seat, tokenIndex),
        onSelectTarget: (moveId) => handlersRef.current.onSelectTarget(moveId),
      })
    } catch {
      setFailed(true)
      return
    }
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.update({
      tokens,
      targets,
      activeSeats,
      viewSeat,
      turnSeat,
      dice,
      selectedPawn,
      lastMove,
    })
  })

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
          Your browser could not start the 3D board. Use the move buttons to
          play.
        </div>
      )}
      {/* Keyboard and screen-reader access to the same moves as the canvas. */}
      <div className="sr-only">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => onSelectTarget(target.id)}
          >
            Move {LUDO_COLORS[target.seat].label} pawn {target.tokenIndex + 1}{" "}
            ({target.label})
          </button>
        ))}
      </div>
    </div>
  )
}
