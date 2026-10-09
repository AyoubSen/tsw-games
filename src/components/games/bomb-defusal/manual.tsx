import { useState } from "react"
import {
  BOMB_SYMBOLS, BUTTON_COLORS, MODULE_LABELS, SIMON_COLORS,
  type BombManual, type ButtonRule, type PublicBombModule,
} from "@/lib/bombDefusal"
import { cn } from "@/lib/utils"
import { SIMON_HEX, WIRE_HEX } from "./bombScene"

const TAB_TINTS = ["#f59e0b", "#38bdf8", "#a78bfa", "#f472b6", "#34d399"]
const PAPER = {
  backgroundColor: "#f5f0e3",
  backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 27px, rgba(59,130,246,.13) 27px 28px), radial-gradient(ellipse at 30% 0%, rgba(255,255,255,.7), transparent 60%)",
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-black/15 bg-white px-1.5 py-0.5 text-xs font-bold capitalize">
      <span className="size-3 rounded-sm border border-black/25" style={{ background: color }} />{label}
    </span>
  )
}

function ruleText(rule: ButtonRule) {
  if (rule.color && rule.label) return <>the button is <strong>{rule.color}</strong> and says <strong>“{rule.label}”</strong></>
  if (rule.color) return <>the button is <strong>{rule.color}</strong></>
  return <>the button says <strong>“{rule.label}”</strong></>
}

function Action({ action }: { action: "tap" | "hold" }) {
  return <strong className={cn("rounded px-1.5 py-0.5 font-mono text-xs uppercase", action === "tap" ? "bg-sky-200 text-sky-950" : "bg-amber-200 text-amber-950")}>{action === "tap" ? "tap it" : "hold it"}</strong>
}

function ManualBody({ manual, strikes }: { manual: BombManual; strikes: number }) {
  switch (manual.kind) {
    case "wires":
      return <>
        <p>Ask for the <strong>serial number</strong> on the case sticker and the <strong>five wire colours</strong>, top to bottom. Wires are numbered from <strong>1</strong> at the top.</p>
        <p className="font-bold">Use the first rule that applies:</p>
        <ol className="list-decimal space-y-3 pl-5 marker:font-mono marker:font-bold">
          <li>If there are <strong>two or more</strong> <Swatch color={WIRE_HEX[manual.repeatedColor]} label={manual.repeatedColor} /> wires, cut the <strong>last</strong> one (nearest the bottom).</li>
          <li>Otherwise, if the serial number ends in an <strong>even digit</strong>, cut wire <strong className="font-mono text-base">{manual.evenPosition}</strong>.</li>
          <li>Otherwise, cut wire <strong className="font-mono text-base">{manual.oddPosition}</strong>.</li>
        </ol>
        <p className="border-t border-black/10 pt-3 font-mono text-xs">A wrong cut stays cut and adds a strike.</p>
      </>
    case "symbols":
      return <>
        <p>Ask which <strong>four symbols</strong> are on the keypad. Find them in this list and have them pressed <strong>in this order</strong>. Skip symbols that aren’t on the keypad.</p>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{manual.order.map((symbol, index) => (
          <li key={symbol} className="flex items-center gap-2 rounded-lg border border-black/15 bg-white/80 px-2 py-1.5">
            <span className="font-mono text-xs text-black/50">{index + 1}.</span>
            <span aria-hidden="true" className="text-2xl leading-none">{BOMB_SYMBOLS[symbol].glyph}</span>
            <span className="text-xs font-semibold">{BOMB_SYMBOLS[symbol].label}</span>
          </li>
        ))}</ol>
        <p className="border-t border-black/10 pt-3 font-mono text-xs">Read all four back before the operator enters them.</p>
      </>
    case "switches":
      return <>
        <p>Ask for the <strong>channel number</strong> and whether the display says <strong>steady or pulsing</strong>. Set switches A–D to the matching row.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <caption className="sr-only">Switch positions by channel and signal</caption>
          <thead><tr className="border-b-2 border-black/70"><th scope="col" className="py-2">Ch.</th><th scope="col">Signal</th>{["A", "B", "C", "D"].map((label) => <th key={label} scope="col" className="px-1 text-center">{label}</th>)}</tr></thead>
          <tbody>{manual.rows.map((row) => (
            <tr key={`${row.channel}-${row.signal}`} className="border-b border-black/10 odd:bg-white/50">
              <th scope="row" className="py-2.5 pl-1 font-mono">{row.channel}</th><td className="capitalize">{row.signal}</td>
              {row.positions.map((up, index) => <td key={index} className={cn("px-1 text-center font-mono font-bold", up ? "text-emerald-800" : "text-black/45")}>{up ? "▲ UP" : "▼ DN"}</td>)}
            </tr>
          ))}</tbody>
        </table></div>
      </>
    case "button":
      return <>
        <p>Have the operator <strong>lift the clear cover</strong> first. Ask for the button’s <strong>colour</strong> and its <strong>label</strong>, then use the first rule that matches:</p>
        <ol className="list-decimal space-y-2.5 pl-5 marker:font-mono marker:font-bold">
          {manual.rules.map((rule, index) => <li key={index}>If {ruleText(rule)}, <Action action={rule.action} />.</li>)}
          <li>Otherwise, <Action action={manual.fallback} />.</li>
        </ol>
        <div className="rounded-lg border border-black/15 bg-white/70 p-3">
          <p><strong>Tap:</strong> press and let go straight away.</p>
          <p className="mt-1"><strong>Hold:</strong> keep it pressed. A strip lights up beside it. Let go when the countdown shows this digit <strong>anywhere</strong>:</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{BUTTON_COLORS.map((color) => (
            <li key={color} className="flex items-center justify-between gap-2 rounded-md border border-black/10 bg-white px-2 py-1">
              <Swatch color={WIRE_HEX[color]} label={`${color} strip`} /><span className="font-mono text-lg font-black">{manual.release[color]}</span>
            </li>
          ))}</ul>
        </div>
      </>
    case "simon": {
      const row = Math.min(strikes, manual.table.length - 1)
      return <>
        <p>The lights flash a short sequence over and over. For <strong>each flash</strong>, the operator presses the colour in the row for the <strong>current number of strikes</strong>. Enter the whole sequence, then confirm.</p>
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <caption className="sr-only">Colour to press by flashed colour and strikes</caption>
          <thead><tr className="border-b-2 border-black/70"><th scope="col" className="py-2 text-left">Flash →</th>{SIMON_COLORS.map((color) => <th key={color} scope="col" className="px-1 py-2"><Swatch color={SIMON_HEX[color]} label={color} /></th>)}</tr></thead>
          <tbody>{manual.table.map((colors, strikeCount) => (
            <tr key={strikeCount} className={cn("border-b border-black/10", strikeCount === row && "bg-amber-200/70 outline outline-2 -outline-offset-2 outline-amber-500")}>
              <th scope="row" className="py-2.5 pl-1 text-left font-mono">{strikeCount} strike{strikeCount === 1 ? "" : "s"}{strikeCount === row && " ◀ now"}</th>
              {colors.map((color, index) => <td key={index} className="px-1 text-center"><Swatch color={SIMON_HEX[color]} label={color} /></td>)}
            </tr>
          ))}</tbody>
        </table></div>
        <p className="border-t border-black/10 pt-3 font-mono text-xs">A strike changes the row. Re-read it after every mistake.</p>
      </>
    }
  }
}

/** Ring binder with a page tab per module; the expert's only view of the bomb. */
export function ManualBinder({ modules, strikes, className }: { modules: PublicBombModule[]; strikes: number; className?: string }) {
  const pages = modules.filter((module) => module.manual)
  const [tab, setTab] = useState(0)
  const active = pages[Math.min(tab, pages.length - 1)]
  if (!active?.manual) return null
  return (
    <div className={cn("relative flex min-h-0", className)}>
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-l-md rounded-r-2xl shadow-[0_30px_60px_-20px_rgb(0_0_0/.8)]" style={PAPER}>
        {/* Binder spine with rings */}
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-9 border-r border-black/15 bg-gradient-to-r from-[#1e293b] to-[#334155]">
          {[18, 50, 82].map((top) => <span key={top} className="absolute left-1/2 size-5 -translate-x-1/2 rounded-full border-[3px] border-[#cbd5e1] bg-[#0f172a] shadow-inner" style={{ top: `${top}%` }} />)}
        </div>
        <article className="relative h-full overflow-y-auto py-5 pl-14 pr-5 text-[#1c1a17] sm:pr-8">
          <header className="mb-4 flex items-start justify-between gap-3 border-b-2 border-black/70 pb-3">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-black/55">Field manual · section {modules.indexOf(active) + 1}</p>
              <h3 className="text-2xl font-black tracking-tight">{MODULE_LABELS[active.kind]}</h3>
            </div>
            {active.solved && <span className="shrink-0 -rotate-6 rounded-md border-[3px] border-emerald-700 px-2 py-1 font-mono text-sm font-black uppercase tracking-widest text-emerald-700">Defused</span>}
          </header>
          <div className={cn("space-y-4 text-sm leading-relaxed", active.solved && "opacity-60")}>
            <ManualBody manual={active.manual} strikes={strikes} />
          </div>
        </article>
      </div>
      {pages.length > 1 && (
        <div role="tablist" aria-label="Manual sections" className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pt-6">
          {pages.map((module, index) => {
            const selected = module === active
            return (
              <button
                key={module.kind}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(index)}
                className={cn(
                  "-ml-1 min-w-10 shrink-0 rounded-r-lg py-3 pl-2 pr-1.5 text-xs font-black text-[#1c1a17] shadow-md transition [writing-mode:vertical-rl] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                  selected ? "translate-x-0.5 brightness-110" : "opacity-75 hover:opacity-100",
                )}
                style={{ background: TAB_TINTS[modules.indexOf(module) % TAB_TINTS.length] }}
              >
                {module.solved ? "✓ " : ""}{MODULE_LABELS[module.kind]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
