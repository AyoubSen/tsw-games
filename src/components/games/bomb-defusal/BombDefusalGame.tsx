import { BookOpen, Check, Clock, Radio, ShieldCheck, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  BOMB_STRIKE_LIMIT, BOMB_SYMBOLS, MODULE_LABELS,
  type BombManual, type BombSubmission, type BombSymbol,
  type PublicBombModule, type PublicBombState, type WireColor,
} from "@/lib/bombDefusal"

const WIRE_STYLES: Record<WireColor, string> = {
  red: "bg-rose-500", blue: "bg-blue-400", yellow: "bg-yellow-300",
  green: "bg-emerald-400", white: "bg-white", purple: "bg-violet-400",
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function DeviceModule({ module, disabled, onSubmit }: {
  module: PublicBombModule
  disabled: boolean
  onSubmit: (submission: BombSubmission, revision: number) => boolean
}) {
  const [wire, setWire] = useState<number | null>(null)
  const [sequence, setSequence] = useState<BombSymbol[]>([])
  const [positions, setPositions] = useState([false, false, false, false])
  const [pending, setPending] = useState(false)
  const device = module.device
  const locked = disabled || pending || module.solved

  useEffect(() => { setPending(false) }, [module.revision, disabled])
  useEffect(() => {
    if (!pending) return
    const timeout = window.setTimeout(() => setPending(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [pending])

  if (!device) return null
  const submit = (submission: BombSubmission) => {
    if (onSubmit(submission, module.revision)) setPending(true)
  }

  return (
    <section className={`rounded-xl border-2 p-4 sm:p-5 ${module.solved ? "border-teal-400/70 bg-teal-950/40" : "border-blue-800 bg-blue-950"}`}>
      <header className="mb-5 flex items-center justify-between gap-3 border-b border-blue-800 pb-3">
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider">{MODULE_LABELS[module.kind]}</h3>
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${module.solved ? "text-teal-300" : "text-orange-300"}`}>
          {module.solved ? <><Check className="h-4 w-4" />Safe</> : "Armed"}
        </span>
      </header>
      {device.kind === "wires" && <div className="space-y-3">
        <p className="rounded border border-blue-700 px-3 py-2 font-mono text-sm">SERIAL <strong className="float-right tracking-[0.25em]">{device.serial}</strong></p>
        <p className="text-xs text-blue-200">Describe the wires from top to bottom. Select one, then cut.</p>
        <div className="space-y-2">{device.colors.map((color, index) => <button key={index} type="button" disabled={locked}
          onClick={() => setWire(index + 1)} aria-pressed={wire === index + 1} aria-label={`Select wire ${index + 1}, ${color}`}
          className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-60 ${wire === index + 1 ? "border-orange-300 bg-blue-900" : "border-blue-800 hover:bg-blue-900/70"}`}>
          <span className="font-mono text-xs">{index + 1}</span>
          <span className={`h-2 flex-1 rounded-full ${WIRE_STYLES[color]}`} />
          <span className="w-12 text-left text-xs capitalize">{color}</span>
        </button>)}</div>
        <Button className="w-full bg-orange-300 text-blue-950 hover:bg-orange-200" disabled={locked || wire === null}
          onClick={() => { if (wire !== null) submit({ kind: "wires", position: wire }) }}>Cut selected wire</Button>
      </div>}
      {device.kind === "symbols" && <div className="space-y-4">
        <p className="text-xs text-blue-200">Describe these four symbols. Your expert knows their order.</p>
        <div className="grid grid-cols-2 gap-3">{device.symbols.map((symbol) => <button key={symbol} type="button"
          disabled={locked || sequence.includes(symbol)} onClick={() => setSequence((current) => [...current, symbol])}
          aria-label={`Add ${BOMB_SYMBOLS[symbol].label}`} className="relative rounded-lg border border-blue-700 bg-blue-900 p-3 text-center hover:border-orange-300 focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-50">
          <span aria-hidden="true" className="block font-mono text-4xl">{BOMB_SYMBOLS[symbol].glyph}</span>
          <span className="text-xs text-blue-200">{BOMB_SYMBOLS[symbol].label}</span>
          {sequence.includes(symbol) && <span className="absolute right-2 top-1 font-mono text-sm text-orange-300">{sequence.indexOf(symbol) + 1}</span>}
        </button>)}</div>
        <p aria-live="polite" className="min-h-7 text-center font-mono text-xl tracking-widest">{sequence.map((symbol) => BOMB_SYMBOLS[symbol].glyph).join(" → ") || "— → — → — → —"}</p>
        <div className="flex gap-2"><Button variant="ghost" disabled={locked || sequence.length === 0} onClick={() => setSequence([])} className="text-blue-100 hover:bg-blue-900 hover:text-white">Clear</Button>
          <Button disabled={locked || sequence.length !== 4} onClick={() => submit({ kind: "symbols", sequence })} className="flex-1 bg-orange-300 text-blue-950 hover:bg-orange-200">Enter sequence</Button></div>
      </div>}
      {device.kind === "switches" && <div className="space-y-5">
        <div className="flex justify-between gap-3 rounded-lg border border-blue-700 px-3 py-3 font-mono text-sm"><span>CHANNEL <strong>{device.channel}</strong></span><span className="uppercase text-orange-300">{device.signal}</span></div>
        <p className="text-xs text-blue-200">Read the channel and signal to your expert. Set A–D to their instructions.</p>
        <div className="grid grid-cols-4 gap-2">{positions.map((up, index) => <button key={index} type="button" role="switch" aria-checked={up}
          aria-label={`Switch ${String.fromCharCode(65 + index)}, ${up ? "up" : "down"}`} disabled={locked}
          onClick={() => setPositions((current) => current.map((value, position) => position === index ? !value : value))}
          className="flex min-h-32 flex-col items-center justify-between rounded-lg border border-blue-700 bg-blue-900/50 p-2 font-mono focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-50">
          <span className="text-sm">{String.fromCharCode(65 + index)}</span>
          <span className={`flex h-14 w-6 rounded-full bg-blue-950 p-1 ${up ? "items-start" : "items-end"}`}><span className={`h-5 w-4 rounded-sm ${up ? "bg-orange-300" : "bg-blue-300"}`} /></span>
          <span className="text-xs">{up ? "UP" : "DOWN"}</span>
        </button>)}</div>
        <Button disabled={locked} onClick={() => submit({ kind: "switches", positions })} className="w-full bg-orange-300 text-blue-950 hover:bg-orange-200">Apply switches</Button>
      </div>}
      {pending && <p role="status" className="mt-3 text-center text-xs text-blue-200">Checking…</p>}
    </section>
  )
}

function ManualPage({ manual }: { manual: BombManual }) {
  return (
    <section className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50 text-blue-950">
      <header className="flex items-center gap-3 border-b-2 border-blue-950 px-5 py-4">
        <BookOpen className="h-5 w-5 shrink-0" />
        <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Field manual / {manual.kind}</p><h3 className="text-xl font-black">{MODULE_LABELS[manual.kind]}</h3></div>
      </header>
      <div className="space-y-4 p-5 text-sm leading-relaxed">
        {manual.kind === "wires" && <>
          <p>Ask for the serial number and the five wire colors, from top to bottom. Wire positions start at <strong>1</strong>.</p>
          <p className="font-bold">Use the first rule that applies:</p>
          <ol className="list-decimal space-y-3 pl-5 marker:font-mono marker:font-bold">
            <li>If there are <strong>two or more {manual.repeatedColor} wires</strong>, cut the <strong>last {manual.repeatedColor} wire</strong> (nearest the bottom).</li>
            <li>Otherwise, if the serial number ends in an <strong>even digit</strong>, cut wire <strong>{manual.evenPosition}</strong>.</li>
            <li>Otherwise, cut wire <strong>{manual.oddPosition}</strong>.</li>
          </ol>
          <p className="border-t border-blue-200 pt-3 font-mono text-xs">Cut exactly one wire. A wrong cut adds a strike.</p>
        </>}
        {manual.kind === "symbols" && <>
          <p>Ask which <strong>four symbols</strong> appear on the keypad. Find them in this priority list, then tell the operator to enter them in this order. <strong>Skip symbols that aren’t on the device.</strong></p>
          <ol className="grid grid-cols-2 gap-2">{manual.order.map((symbol, index) => <li key={symbol} className="flex items-center gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2">
            <span className="font-mono text-xs text-blue-700">{index + 1}.</span><span aria-hidden="true" className="text-2xl">{BOMB_SYMBOLS[symbol].glyph}</span><span className="text-xs font-semibold">{BOMB_SYMBOLS[symbol].label}</span>
          </li>)}</ol>
          <p className="border-t border-blue-200 pt-3 font-mono text-xs">Read all four back before the operator submits.</p>
        </>}
        {manual.kind === "switches" && <>
          <p>Ask for the <strong>channel number</strong> and whether the signal says <strong>steady or pulsing</strong>. Read the matching row from A to D.</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <caption className="sr-only">Switch positions by channel and signal</caption>
            <thead><tr className="border-b-2 border-blue-950"><th scope="col" className="py-2">Ch.</th><th scope="col">Signal</th>{["A", "B", "C", "D"].map((label) => <th key={label} scope="col" className="px-1 text-center">{label}</th>)}</tr></thead>
            <tbody>{manual.rows.map((row) => <tr key={`${row.channel}-${row.signal}`} className="border-b border-blue-200 odd:bg-white/60">
              <th scope="row" className="py-3 pl-1 font-mono">{row.channel}</th><td className="capitalize">{row.signal}</td>
              {row.positions.map((up, index) => <td key={index} className={`px-1 text-center font-mono font-bold ${up ? "text-blue-900" : "text-blue-600"}`}>{up ? "UP" : "DN"}</td>)}
            </tr>)}</tbody>
          </table></div>
          <p className="font-mono text-xs">UP = up · DN = down. Set all four, then apply.</p>
        </>}
      </div>
    </section>
  )
}

export function BombDefusalGame({ game, playerId, connected, error, onSubmit, onNext, onRestart, onLeave }: {
  game: PublicBombState
  playerId: string
  connected: boolean
  error: string | null
  onSubmit: (submission: BombSubmission, revision: number) => boolean
  onNext: () => void
  onRestart: () => void
  onLeave: () => void
}) {
  const [seconds, setSeconds] = useState(game.timeLimit)
  const playing = game.status === "playing"
  const isOperator = game.operatorId === playerId
  const operator = game.players[game.operatorId ?? ""]
  const assigned = game.modules.filter((module) => module.manual)
  const crew = Object.values(game.players)
  const away = crew.filter((player) => player.connected === false)
  const lastResult = game.history.at(-1)

  useEffect(() => {
    if (!game.deadline) return
    const receivedAt = Date.now()
    const update = () => setSeconds(Math.max(0, Math.ceil((game.deadline! - game.serverTime - (Date.now() - receivedAt)) / 1000)))
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [game.deadline, game.serverTime])

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <header className="rounded-2xl border border-blue-800 bg-blue-950 p-5 text-blue-50 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div><p className="font-mono text-xs uppercase tracking-widest text-blue-300">Device {game.round} / {game.totalRounds}</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">{playing ? isOperator ? "You have the device." : "You have the instructions." : game.outcome === "defused" ? "Device secured." : "Mission ended."}</h2>
            <p className="mt-2 max-w-xl text-sm text-blue-200">{playing ? isOperator ? "Describe what you see. Let your experts guide every move." : `Guide ${operator?.name ?? "the operator"} using your assigned manual sections.` : "Review the device and manuals together below."}</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-center"><p className="mb-1 flex items-center justify-center gap-1 text-xs text-blue-200"><Clock className="h-3 w-3" />{playing ? "Time left" : "Time remaining"}</p>
              <p role="timer" aria-label="Time remaining" className={`font-mono text-4xl font-bold tabular-nums sm:text-5xl ${playing && seconds <= 30 ? "text-rose-300" : "text-orange-300"}`}>{formatTime(playing ? seconds : lastResult?.secondsLeft ?? 0)}</p></div>
            <div className="border-l border-blue-800 pl-5 text-center"><p className="mb-2 text-xs text-blue-200">Strikes</p><p aria-label={`${game.strikes} of ${BOMB_STRIKE_LIMIT} strikes`} className="flex gap-1">{Array.from({ length: BOMB_STRIKE_LIMIT }, (_, index) => <span key={index} className={`flex h-7 w-7 items-center justify-center rounded border font-mono font-bold ${index < game.strikes ? "border-rose-400 bg-rose-500 text-white" : "border-blue-700 text-blue-400"}`}>{index < game.strikes ? "×" : "·"}</span>)}</p></div>
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{error}</p>}
      {playing && away.length > 0 && <p role="status" className="rounded-xl border p-3 text-sm text-muted-foreground">Waiting for {away.map((player) => player.name).join(", ")} to reconnect. Their roles are saved; the timer keeps running.</p>}
      {playing && game.lastAction && <p role="status" className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${game.lastAction.correct ? "border-teal-500/40 bg-teal-500/10" : "border-rose-500/40 bg-rose-500/10"}`}>
        {game.lastAction.correct ? <ShieldCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
        {MODULE_LABELS[game.lastAction.kind]}: {game.lastAction.correct ? "defused." : `incorrect. Strike ${game.strikes} of ${BOMB_STRIKE_LIMIT}. Check the manual before trying again.`}
      </p>}

      {!playing && <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h3 className="text-2xl font-black">{game.outcome === "defused" ? game.status === "finished" ? "The whole crew made it." : "One down. Time to swap roles." : game.outcome === "time" ? "Out of time." : game.outcome === "strikes" ? "Three strikes. Device lost." : "A crew member left."}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{game.status === "round-end" ? `${game.players[game.nextOperatorId ?? ""]?.name ?? "The next player"} takes the device next. The new timer starts when the host continues.` : game.outcome === "defused" ? "Every player operated a device, and the team defused them all." : game.outcome === "crew-left" ? "This mission needs its full crew. Return to the lobby to assemble a new team." : "The team shares the result. Compare the device with its manual, then try a fresh mission."}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {game.canControl ? <Button disabled={!connected || (game.status === "round-end" && away.length > 0)} onClick={game.status === "round-end" ? onNext : onRestart}>{game.status === "round-end" ? "Rotate roles & start" : "Return to lobby"}</Button> : <p className="py-2 text-sm text-muted-foreground">Waiting for the host…</p>}
          <Button variant="outline" onClick={onLeave}>Leave room</Button>
        </div>
      </section>}

      <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-5">
          {(isOperator || !playing) && <div className="grid gap-4 text-blue-50 md:grid-cols-2 2xl:grid-cols-3">{game.modules.map((module) => <DeviceModule key={`${game.missionId}-${module.kind}`} module={module} disabled={!playing || !connected || seconds <= 0 || !isOperator} onSubmit={onSubmit} />)}</div>}
          {(!isOperator || !playing) && <div className="grid items-start gap-4 lg:grid-cols-2">{assigned.map((module) => module.manual && <ManualPage key={`${game.missionId}-${module.kind}`} manual={module.manual} />)}</div>}
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h3 className="flex items-center gap-2 font-bold"><Radio className="h-4 w-4 text-primary" />Crew assignments</h3>
            <p className="mt-2 text-xs text-muted-foreground">Talk in person or on a voice call. Keep your screens private.</p>
            <div className="mt-4 space-y-3">
              <div><p className="text-xs text-muted-foreground">Operator</p><p className="font-semibold">{operator?.name ?? "Departed"}{isOperator ? " (you)" : ""}</p></div>
              {game.modules.map((module) => <div key={module.kind} className="border-t pt-3"><p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">{MODULE_LABELS[module.kind]}{module.solved && <Check aria-label="Defused" className="h-4 w-4 text-teal-500" />}</p><p className="text-sm font-semibold">{game.players[module.expertId]?.name ?? "Departed"}{module.expertId === playerId ? " (you)" : ""}</p></div>)}
            </div>
          </section>
          {game.history.length > 0 && <section className="rounded-xl border bg-card p-4"><h3 className="font-bold">Mission log</h3><ol className="mt-3 space-y-3">{game.history.map((result) => <li key={result.round} className="border-l-2 border-primary/40 pl-3 text-xs"><p className="font-semibold">{result.round}. {result.operatorName}</p><p className="mt-1 text-muted-foreground">{result.defused ? "Defused" : `${result.solvedModules}/3 modules safe`} · {result.strikes} strikes · {formatTime(result.secondsLeft)} left</p></li>)}</ol></section>}
        </aside>
      </div>
    </main>
  )
}
