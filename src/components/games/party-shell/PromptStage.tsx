import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

/** The round's prompt as a big card at centre stage; it re-deals when `dealKey` changes. */
export function PromptCard({ dealKey, eyebrow, tag, text, compact, className, style, children }: {
  dealKey: string | number
  eyebrow: string
  tag?: string
  text: string
  compact: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const long = text.length > 70
  return (
    <div
      key={dealKey}
      className={cn("uno-pop absolute z-[5] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/15 bg-gradient-to-b from-[#fdfbf6] to-[#ece4d4] px-5 text-center text-[#1b1712] shadow-[0_24px_60px_rgb(0_0_0/.55)]", compact ? "py-3" : "py-5", className)}
      style={style}
    >
      <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#1b1712]/55">
        <span>{eyebrow}</span>
        {tag && <span className="rounded-full bg-[#1b1712]/10 px-2 py-0.5 tracking-[0.16em]">{tag}</span>}
      </div>
      <p className={cn("mt-2 font-black leading-tight tracking-tight text-balance", compact ? (long ? "text-base" : "text-lg") : long ? "text-xl md:text-2xl" : "text-2xl md:text-3xl")}>
        {text}
      </p>
      {children}
    </div>
  )
}
