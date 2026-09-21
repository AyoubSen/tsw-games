import { ArrowLeft, ArrowRight, Crown, RotateCcw, WifiOff } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import { canPlayUnoCard, type UnoCard as UnoCardData, type UnoColor } from "@/lib/uno"
import { cn } from "@/lib/utils"
import type { PublicUnoGameState } from "../../../../party/uno"

const COLOR_STYLES: Record<UnoColor | "wild", string> = {
  red: "bg-[#e84534] text-[#fff8e8]",
  yellow: "bg-[#f4c84b] text-[#171512]",
  green: "bg-[#26a269] text-[#fff8e8]",
  blue: "bg-[#3478d4] text-[#fff8e8]",
  wild: "bg-[conic-gradient(from_35deg,#3478d4_0_25%,#26a269_0_50%,#f4c84b_0_75%,#e84534_0)] text-[#fff8e8]",
}
const COLOR_LABELS: Record<UnoColor | "wild", string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue", wild: "Wild" }
const COLOR_MARKS: Record<UnoColor | "wild", string> = { red: "R", yellow: "Y", green: "G", blue: "B", wild: "W" }

function cardSymbol(value: string) {
  if (value === "skip") return "X"
  if (value === "reverse") return "REV"
  if (value === "draw-two") return "+2"
  if (value === "wild-draw-four") return "+4"
  if (value === "wild") return "W"
  return value
}

function cardName(card: UnoCardData) {
  return `${COLOR_LABELS[card.color ?? "wild"]} ${card.value.replaceAll("-", " ")}`
}

function UnoCard({ card, disabled, onClick, className }: { card: UnoCardData; disabled?: boolean; onClick?: () => void; className?: string }) {
  const color = card.color ?? "wild"
  const content = <>
    <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 border-current bg-[#fff8e8]/90 text-[10px] font-black text-[#171512]">{COLOR_MARKS[color]}</span>
    <span className="absolute -left-5 top-1/2 h-16 w-28 -translate-y-1/2 -rotate-[28deg] rounded-[50%] bg-[#fff8e8] shadow-inner sm:h-20 sm:w-36" />
    <span className="relative z-10 text-[1.7rem] font-black italic tracking-[-0.12em] text-[#171512] sm:text-4xl">{cardSymbol(card.value)}</span>
    <span className="absolute bottom-1.5 right-2 rotate-180 text-xs font-black">{cardSymbol(card.value)}</span>
  </>
  const classes = cn(
    "relative flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[0.85rem] border-[5px] border-[#fff8e8] shadow-[0_7px_0_#090807,0_14px_22px_rgb(0_0_0/.35)] sm:h-36 sm:w-24",
    COLOR_STYLES[color], className,
    onClick && "transition-[filter,transform] duration-150 hover:-translate-y-3 focus-visible:-translate-y-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f4c84b] motion-reduce:transform-none motion-reduce:transition-none",
    disabled && "cursor-not-allowed saturate-50 brightness-50 hover:translate-y-0",
  )
  return onClick
    ? <button type="button" className={classes} disabled={disabled} onClick={onClick} aria-label={`Play ${cardName(card)}`}>{content}</button>
    : <div className={classes} role="img" aria-label={cardName(card)}>{content}</div>
}

function CardBack({ className }: { className?: string }) {
  return <div className={cn("grid h-28 w-20 place-items-center overflow-hidden rounded-[0.85rem] border-[5px] border-[#fff8e8] bg-[#171512] shadow-[0_7px_0_#090807,0_14px_22px_rgb(0_0_0/.35)] sm:h-36 sm:w-24", className)}>
    <div className="grid size-14 -rotate-12 place-items-center rounded-full bg-[conic-gradient(#3478d4_0_25%,#26a269_0_50%,#f4c84b_0_75%,#e84534_0)] text-sm font-black italic text-white ring-4 ring-[#fff8e8] sm:size-16">PLAY</div>
  </div>
}

export interface UnoGameProps {
  state: PublicUnoGameState
  playerId: string
  isHost: boolean
  onPlayCard: (cardId: string, color?: UnoColor) => void
  onDrawCard: () => void
  onPass: () => void
  onRestart: () => void
}

export function UnoGame({ state, playerId, isHost, onPlayCard, onDrawCard, onPass, onRestart }: UnoGameProps) {
  const [wildCard, setWildCard] = useState<UnoCardData | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const colorDialogRef = useRef<HTMLDivElement>(null)
  const playTimeoutRef = useRef<number | null>(null)
  const selectionResetRef = useRef<number | null>(null)
  const previousHandIdsRef = useRef(new Set<string>())
  const opponents = state.seatOrder.filter((id) => id !== playerId).map((id) => state.players[id]).filter(Boolean)
  const currentPlayer = state.currentPlayerId ? state.players[state.currentPlayerId] : null
  const winner = state.winnerId ? state.players[state.winnerId] : null
  const myTurn = state.currentPlayerId === playerId
  const playable = (card: UnoCardData) => Boolean(!selectedCardId && myTurn && state.status === "playing" && state.topCard && state.activeColor && (!state.drawnCardId || state.drawnCardId === card.id) && canPlayUnoCard(card, state.topCard, state.activeColor, state.myHand))
  const play = (card: UnoCardData) => {
    if (selectedCardId) return
    setSelectedCardId(card.id)
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260
    playTimeoutRef.current = window.setTimeout(() => {
      if (card.color === null) setWildCard(card)
      else {
        onPlayCard(card.id)
        selectionResetRef.current = window.setTimeout(() => setSelectedCardId(null), 2_000)
      }
      playTimeoutRef.current = null
    }, delay)
  }
  const draw = () => {
    if (isDrawing) return
    setIsDrawing(true)
    onDrawCard()
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420
    window.setTimeout(() => setIsDrawing(false), delay)
  }

  useEffect(() => {
    if (!wildCard) return
    colorDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setWildCard(null); setSelectedCardId(null) }
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [wildCard])

  useEffect(() => {
    previousHandIdsRef.current = new Set(state.myHand.map((card) => card.id))
  }, [state.myHand])

  useEffect(() => {
    if (!selectedCardId) return
    const stillInHand = state.myHand.some((card) => card.id === selectedCardId)
    if (stillInHand && myTurn && state.status === "playing") return
    if (playTimeoutRef.current) window.clearTimeout(playTimeoutRef.current)
    if (selectionResetRef.current) window.clearTimeout(selectionResetRef.current)
    playTimeoutRef.current = null
    selectionResetRef.current = null
    setSelectedCardId(null)
    setWildCard(null)
  }, [myTurn, selectedCardId, state.myHand, state.status])

  useEffect(() => () => {
    if (playTimeoutRef.current) window.clearTimeout(playTimeoutRef.current)
    if (selectionResetRef.current) window.clearTimeout(selectionResetRef.current)
  }, [])

  return <section className="relative min-h-[calc(100svh-122px)] overflow-hidden bg-[#171512] text-[#fff8e8] sm:rounded-[2rem] sm:ring-1 sm:ring-white/10">
    <div className="pointer-events-none absolute -left-28 -top-28 size-72 rotate-12 bg-[#e84534]/20" />
    <div className="pointer-events-none absolute -right-24 -top-20 size-64 -rotate-12 bg-[#f4c84b]/15" />
    <div className="pointer-events-none absolute -bottom-32 -left-16 size-72 -rotate-12 bg-[#3478d4]/20" />
    <div className="pointer-events-none absolute -bottom-24 -right-24 size-72 rotate-12 bg-[#26a269]/20" />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,#39352f_0,#25221e_42%,#141310_78%)] opacity-90" />

    <div className="relative flex min-h-[calc(100svh-122px)] flex-col px-3 py-4 sm:px-6">
      <div className="flex snap-x gap-2 overflow-x-auto pb-3 md:justify-center">
        {opponents.map((player, index) => {
          const isCurrent = state.currentPlayerId === player.id
          return <div key={`${player.id}:${player.cardCount}`} aria-current={isCurrent ? "true" : undefined} className={cn("uno-seat-change relative min-w-36 snap-center overflow-hidden border-l-4 bg-[#24211d]/95 px-3 py-2 shadow-lg", isCurrent ? "border-[#f4c84b] ring-1 ring-[#f4c84b]/50" : "border-white/20", player.connected === false && "opacity-55")}>
            <span className="absolute right-2 top-1 text-[9px] font-black tracking-[0.2em] text-white/25">SEAT {index + 1}</span>
            <div className="mt-2 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-[#fff8e8] text-xs font-black text-[#171512]">{player.cardCount}</span><div className="min-w-0"><p className="flex items-center gap-1 truncate text-sm font-black">{player.name}{player.id === state.hostId && <Crown className="size-3 text-[#f4c84b]" />}</p><p className="text-[10px] font-bold uppercase tracking-wider text-white/50">{player.connected === false ? "Reconnecting" : isCurrent ? "Turn" : `${player.cardCount} cards`}</p></div>{player.connected === false && <WifiOff className="ml-auto size-3.5" />}</div>
          </div>
        })}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-3">
        <div key={state.currentPlayerId ?? state.status} aria-live="polite" className={cn("uno-turn-change mb-5 rounded-full border px-5 py-2 text-center text-xs font-black uppercase tracking-[0.16em] shadow-lg backdrop-blur", myTurn ? "border-[#f4c84b] bg-[#f4c84b] text-[#171512]" : "border-white/15 bg-black/55 text-[#fff8e8]")}>{state.status === "finished" ? `${winner?.name ?? "Player"} wins` : myTurn ? "Your move" : `${currentPlayer?.name ?? "Player"} is playing`}</div>

        <div className="relative grid w-full max-w-xl place-items-center rounded-[50%] border border-dashed border-white/20 bg-black/10 px-8 py-9 shadow-[inset_0_0_80px_rgb(0_0_0/.4)] sm:py-12">
          <div className="absolute left-4 top-1/2 hidden -translate-y-1/2 text-center sm:left-8 sm:block"><p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/35">Direction</p><div className="mx-auto mt-1 grid size-9 place-items-center rounded-full border border-white/20 bg-black/35">{state.direction === -1 ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}</div></div>
          <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 text-center sm:right-8 sm:block"><p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/35">Color</p><div className={cn("mx-auto mt-1 grid size-9 place-items-center rounded-full border-2 border-[#fff8e8] text-[10px] font-black", state.activeColor ? COLOR_STYLES[state.activeColor] : "bg-zinc-700")}>{state.activeColor?.slice(0, 1).toUpperCase() ?? "-"}</div></div>
          <div className="flex items-end justify-center gap-5 sm:gap-10">
            <div className="relative text-center"><CardBack className="pointer-events-none absolute -left-2 -top-2 rotate-[-4deg] opacity-35" /><button type="button" disabled={!myTurn || Boolean(state.drawnCardId) || state.status !== "playing" || isDrawing} onClick={draw} className={cn("relative disabled:cursor-not-allowed disabled:brightness-50", isDrawing && "uno-deck-draw")} aria-label={`Draw a card. ${state.deckCount} cards remain`}><CardBack /></button><p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Draw - {state.deckCount}</p></div>
            <div className="text-center"><div className="grid h-28 w-20 place-items-center rounded-[0.85rem] border-2 border-dashed border-white/15 sm:h-36 sm:w-24">{state.topCard && <UnoCard key={state.topCard.id} card={state.topCard} className="uno-discard-land rotate-[3deg]" />}</div><p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Discard</p></div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4 text-[10px] font-black uppercase tracking-wider text-white/55 sm:hidden"><span>{state.direction === -1 ? "Counter-clockwise" : "Clockwise"}</span><span className={cn("rounded-full border border-white/60 px-2 py-1", state.activeColor ? COLOR_STYLES[state.activeColor] : "bg-zinc-700")}>{state.activeColor ?? "No color"}</span></div>
        {myTurn && state.drawnCardId && <div className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl bg-[#fff8e8] px-4 py-2 text-center text-xs font-bold text-[#171512] sm:rounded-full"><span>Play the drawn card or pass.</span><Button size="sm" onClick={onPass} className="rounded-full bg-[#171512] text-[#fff8e8] hover:bg-black">Pass turn</Button></div>}
      </div>

      <div className="relative mt-auto border-t border-white/10 pt-3">
        <p className="text-center text-[10px] font-black uppercase tracking-[0.28em] text-white/45">Your hand - {state.myHand.length} cards</p>
        <div className="flex min-h-36 items-end overflow-x-auto overflow-y-hidden px-[calc(50%-2.5rem)] pb-4 pt-7 md:justify-center md:overflow-visible md:px-10">
          {state.myHand.map((card, index) => {
            const center = (state.myHand.length - 1) / 2
            const distance = index - center
            const isNewCard = !previousHandIdsRef.current.has(card.id)
            const delay = previousHandIdsRef.current.size === 0 ? Math.min(index, 7) * 70 : 0
            const style = { "--fan-rotation": `${Math.max(-10, Math.min(10, distance * 2.2))}deg`, "--fan-lift": `${Math.abs(distance) * 1.2}px`, "--deal-delay": `${delay}ms` } as CSSProperties
            return <div key={card.id} style={style} className={cn("-ml-5 first:ml-0 origin-bottom snap-center md:-ml-7 md:[transform:rotate(var(--fan-rotation))_translateY(var(--fan-lift))] md:hover:z-20 md:hover:[transform:rotate(var(--fan-rotation))_translateY(-14px)]", selectedCardId === card.id && "z-30")}><UnoCard card={card} disabled={selectedCardId === card.id ? false : !playable(card)} onClick={() => play(card)} className={cn(isNewCard && "uno-card-deal", selectedCardId === card.id && "uno-card-play")} /></div>
          })}
        </div>
      </div>
    </div>

    {wildCard && <div className="uno-dialog-backdrop absolute inset-0 z-30 grid place-items-center bg-[#171512]/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="uno-color-title"><div ref={colorDialogRef} className="uno-dialog-card w-full max-w-sm border-4 border-[#171512] bg-[#fff8e8] p-6 text-center text-[#171512] shadow-[12px_12px_0_#e84534]"><p className="text-xs font-black uppercase tracking-[0.25em] text-[#e84534]">Wild card</p><h2 id="uno-color-title" className="mt-2 text-3xl font-black uppercase">Pick a color</h2><div className="mt-5 grid grid-cols-2 gap-3">{(["red", "yellow", "green", "blue"] as const).map((color) => <button key={color} type="button" className={cn("h-20 border-4 border-[#171512] text-lg font-black uppercase shadow-[4px_4px_0_#171512] transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#171512]", COLOR_STYLES[color])} onClick={() => { onPlayCard(wildCard.id, color); setWildCard(null); setSelectedCardId(null) }}>{COLOR_LABELS[color]}</button>)}</div><Button className="mt-5" variant="ghost" onClick={() => { setWildCard(null); setSelectedCardId(null) }}>Cancel</Button></div></div>}

    {state.status === "finished" && <div className="uno-dialog-backdrop absolute inset-0 z-20 grid place-items-center bg-[#171512]/88 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="uno-winner"><div className="uno-winner-card w-full max-w-md border-4 border-[#171512] bg-[#fff8e8] p-8 text-center text-[#171512] shadow-[14px_14px_0_#f4c84b]"><Crown className="mx-auto size-12 text-[#e84534]" /><p className="mt-3 text-xs font-black uppercase tracking-[0.3em] text-[#e84534]">Hand winner</p><h2 id="uno-winner" className="mt-2 text-5xl font-black uppercase tracking-tight">{winner?.name ?? "Game complete"}</h2>{isHost ? <Button className="mt-7 h-12 rounded-none bg-[#171512] px-7 font-black uppercase text-[#fff8e8] hover:bg-black" onClick={onRestart}><RotateCcw />Play again</Button> : <p className="mt-5 text-sm font-bold text-[#171512]/60">Waiting for the host to restart</p>}</div></div>}
  </section>
}
