import { cn } from "@/lib/utils"
import type { MafiaRole } from "../../../../../party/mafia"

interface PlayerAvatarProps {
  name: string
  alive: boolean
  role: MafiaRole | null
  isYou: boolean
  isTarget?: boolean
  isLover?: boolean
  connected: boolean
  onClick?: () => void
  disabled?: boolean
  size?: "sm" | "md"
  votesReceived?: number
}

const ROLE_COLORS: Record<MafiaRole, string> = {
  werewolf: "text-red-400",
  villager: "text-green-400",
  seer: "text-cyan-400",
  doctor: "text-emerald-400",
  hunter: "text-orange-400",
  witch: "text-purple-400",
  cupid: "text-pink-400",
  jester: "text-yellow-400",
}

export function PlayerAvatar({
  name,
  alive,
  role,
  isYou,
  isTarget = false,
  isLover = false,
  connected,
  onClick,
  disabled = false,
  size = "md",
  votesReceived,
}: PlayerAvatarProps) {
  const sizeClasses = size === "sm" ? "w-12 h-12" : "w-16 h-16"
  const textSize = size === "sm" ? "text-xs" : "text-sm"

  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        onClick && !disabled && "cursor-pointer hover:scale-105",
        (!onClick || disabled) && "cursor-default",
        isTarget && "ring-2 ring-red-500 rounded-xl",
      )}
    >
      <div className="relative">
        <div
          className={cn(
            sizeClasses,
            "rounded-xl flex items-center justify-center font-bold text-lg transition-all",
            alive
              ? "bg-zinc-700/80 text-zinc-100"
              : "bg-zinc-900/60 text-zinc-600",
            isYou && alive && "ring-2 ring-primary",
            !connected && alive && "opacity-50",
          )}
        >
          {alive ? (
            <span>{name.charAt(0).toUpperCase()}</span>
          ) : (
            <span className="text-2xl opacity-60">&#9760;</span>
          )}
        </div>
        {isLover && (
          <span className="absolute -top-1 -right-1 text-xs">&#10084;&#65039;</span>
        )}
        {votesReceived !== undefined && votesReceived > 0 && (
          <span className="absolute -bottom-1 -right-1 bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
            {votesReceived}
          </span>
        )}
      </div>
      <span className={cn(
        textSize,
        "font-medium truncate max-w-[80px]",
        alive ? "text-zinc-300" : "text-zinc-600"
      )}>
        {name}{isYou ? " (You)" : ""}
      </span>
      {!alive && role && (
        <span className={cn("text-[10px] font-medium", ROLE_COLORS[role])}>
          {role}
        </span>
      )}
    </button>
  )
}
