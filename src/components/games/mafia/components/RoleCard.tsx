import { Moon, Eye, Shield, Crosshair, Sparkles, Heart, Laugh, Users } from "lucide-react"
import type { MafiaRole } from "../../../../../party/mafia"

interface RoleCardProps {
  role: MafiaRole
  mini?: boolean
}

const ROLE_CONFIG: Record<MafiaRole, {
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  description: string
}> = {
  werewolf: {
    label: "Werewolf",
    icon: <Moon className="w-6 h-6" />,
    color: "text-red-400",
    bg: "bg-red-950/40 border-red-900/50",
    description: "Kill a villager each night with your pack.",
  },
  villager: {
    label: "Villager",
    icon: <Users className="w-6 h-6" />,
    color: "text-green-400",
    bg: "bg-green-950/40 border-green-900/50",
    description: "Find and eliminate the werewolves through voting.",
  },
  seer: {
    label: "Seer",
    icon: <Eye className="w-6 h-6" />,
    color: "text-cyan-400",
    bg: "bg-cyan-950/40 border-cyan-900/50",
    description: "Inspect one player each night to learn if they're a werewolf.",
  },
  doctor: {
    label: "Doctor",
    icon: <Shield className="w-6 h-6" />,
    color: "text-emerald-400",
    bg: "bg-emerald-950/40 border-emerald-900/50",
    description: "Protect one player each night. Can't protect the same player twice in a row.",
  },
  hunter: {
    label: "Hunter",
    icon: <Crosshair className="w-6 h-6" />,
    color: "text-orange-400",
    bg: "bg-orange-950/40 border-orange-900/50",
    description: "When you die, take one player down with you.",
  },
  witch: {
    label: "Witch",
    icon: <Sparkles className="w-6 h-6" />,
    color: "text-purple-400",
    bg: "bg-purple-950/40 border-purple-900/50",
    description: "One heal potion and one kill potion for the entire game.",
  },
  cupid: {
    label: "Cupid",
    icon: <Heart className="w-6 h-6" />,
    color: "text-pink-400",
    bg: "bg-pink-950/40 border-pink-900/50",
    description: "On the first night, link two players as lovers. If one dies, both die.",
  },
  jester: {
    label: "Jester",
    icon: <Laugh className="w-6 h-6" />,
    color: "text-yellow-400",
    bg: "bg-yellow-950/40 border-yellow-900/50",
    description: "Win instantly if the village votes to eliminate you.",
  },
}

export function RoleCard({ role, mini = false }: RoleCardProps) {
  const config = ROLE_CONFIG[role]

  if (mini) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${config.bg} ${config.color}`}>
        <span className="scale-75">{config.icon}</span>
        <span className="text-xs font-medium">{config.label}</span>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-6 text-center space-y-3 ${config.bg}`}>
      <div className={`${config.color} flex justify-center`}>
        <div className="w-16 h-16 rounded-full bg-black/30 flex items-center justify-center">
          <span className="scale-150">{config.icon}</span>
        </div>
      </div>
      <h3 className={`text-xl font-bold ${config.color}`}>{config.label}</h3>
      <p className="text-sm text-zinc-400">{config.description}</p>
    </div>
  )
}
