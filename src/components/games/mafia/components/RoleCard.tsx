import type { CSSProperties } from "react"
import { Moon, Eye, Shield, Crosshair, Sparkles, Heart, Laugh, Users, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MafiaRole } from "../../../../../party/mafia"

export const ROLE_INFO: Record<MafiaRole, {
  label: string
  /** "the Seer", "a Villager": for sentences. */
  phrase: string
  Icon: LucideIcon
  hex: string
  team: string
  description: string
}> = {
  werewolf: { label: "Werewolf", phrase: "a Werewolf", Icon: Moon, hex: "#f87171", team: "Werewolves", description: "Kill a villager each night with your pack." },
  villager: { label: "Villager", phrase: "a Villager", Icon: Users, hex: "#4ade80", team: "Village", description: "Find and eliminate the werewolves through voting." },
  seer: { label: "Seer", phrase: "the Seer", Icon: Eye, hex: "#22d3ee", team: "Village", description: "Inspect one player each night to learn if they're a werewolf." },
  doctor: { label: "Doctor", phrase: "the Doctor", Icon: Shield, hex: "#34d399", team: "Village", description: "Protect one player each night. Can't protect the same player twice in a row." },
  hunter: { label: "Hunter", phrase: "the Hunter", Icon: Crosshair, hex: "#fb923c", team: "Village", description: "When you die, take one player down with you." },
  witch: { label: "Witch", phrase: "the Witch", Icon: Sparkles, hex: "#c084fc", team: "Village", description: "One heal potion and one kill potion for the entire game." },
  cupid: { label: "Cupid", phrase: "Cupid", Icon: Heart, hex: "#f472b6", team: "Village", description: "On the first night, link two players as lovers. If one dies, both die." },
  jester: { label: "Jester", phrase: "the Jester", Icon: Laugh, hex: "#facc15", team: "Alone", description: "Win instantly if the village votes to eliminate you." },
}

export type RoleCardSize = "sm" | "md" | "lg"

const SIZE: Record<RoleCardSize, string> = {
  sm: "w-12 h-[68px] rounded-lg",
  md: "w-28 h-40 rounded-xl",
  lg: "w-52 h-[18.5rem] rounded-2xl",
}

export function RoleFace({ role, size = "md" }: { role: MafiaRole; size?: RoleCardSize }) {
  const info = ROLE_INFO[role]
  const { Icon } = info
  return (
    <div
      className={cn("flex size-full flex-col items-center justify-center gap-1 border-2 text-center shadow-[0_14px_36px_rgb(0_0_0/.5)]", SIZE[size], size === "lg" && "gap-3 p-5", size === "md" && "p-2")}
      style={{ borderColor: info.hex, background: `radial-gradient(circle at 50% 30%, ${info.hex}40, #0d1018 72%)` }}
    >
      <span
        className={cn("grid place-items-center rounded-full bg-black/40", size === "sm" ? "size-7" : size === "md" ? "size-12" : "size-20")}
        style={{ color: info.hex, boxShadow: `0 0 24px ${info.hex}55` }}
      >
        <Icon className={size === "sm" ? "size-4" : size === "md" ? "size-6" : "size-10"} />
      </span>
      <span className={cn("font-black leading-none", size === "sm" ? "text-[9px]" : size === "md" ? "text-base" : "text-2xl")} style={{ color: info.hex }}>{info.label}</span>
      {size !== "sm" && <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">{info.team}</span>}
      {size === "lg" && <p className="text-sm leading-snug text-white/75">{info.description}</p>}
    </div>
  )
}

export function CardBack({ size = "md" }: { size?: RoleCardSize }) {
  return (
    <div
      className={cn("grid size-full place-items-center border-2 border-indigo-200/25 shadow-[0_14px_36px_rgb(0_0_0/.5)]", SIZE[size])}
      style={{ background: "repeating-linear-gradient(45deg, #1a1f3a 0 8px, #141830 8px 16px)" }}
    >
      <span className={cn("grid place-items-center rounded-full border border-indigo-200/30 bg-[#0d1020] text-indigo-200/80", size === "sm" ? "size-7" : size === "md" ? "size-12" : "size-20")}>
        <Moon className={size === "sm" ? "size-3.5" : size === "md" ? "size-6" : "size-9"} />
      </span>
    </div>
  )
}

/**
 * A role card that turns face up: after `delay` ms (CSS animation, so it replays on remount),
 * or following `faceUp` when it is controlled.
 */
export function RoleFlip({ role, size = "md", delay = 0, faceUp, className }: {
  role: MafiaRole | null
  size?: RoleCardSize
  delay?: number
  faceUp?: boolean
  className?: string
}) {
  const controlled = faceUp !== undefined
  return (
    <div className={cn("relative shrink-0 [perspective:900px]", SIZE[size], className)}>
      <div
        className={cn("relative size-full [transform-style:preserve-3d]", controlled ? "transition-transform duration-500" : "mafia-flip")}
        style={controlled ? { transform: faceUp ? "none" : "rotateY(180deg)" } : ({ "--d": `${delay}ms` } as CSSProperties)}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          {role ? <RoleFace role={role} size={size} /> : <CardBack size={size} />}
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardBack size={size} />
        </div>
      </div>
    </div>
  )
}
