import { useQuery } from "convex/react"
import { BadgeCheck } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { gameTitle } from "@/lib/gameCatalog"
import { cn } from "@/lib/utils"
import { api } from "../../../convex/_generated/api"
import type { Doc } from "../../../convex/_generated/dataModel"

type HighlightStats = Pick<Doc<"gameStats">, "game" | "wordle" | "typerace" | "pool">

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/** Game-specific stats (Wordle streak and guesses, TypeRace speed, Pool run-outs); nothing when there are none. */
export function GameHighlights({ stats, className }: { stats: HighlightStats[]; className?: string }) {
  const byGame = (game: string) => stats.find((stat) => stat.game === game)
  const wordle = byGame("wordle")?.wordle
  const typerace = byGame("typerace")?.typerace
  const pool = byGame("pool")?.pool
  if (!wordle && !typerace && !pool) return null
  const mostSolved = Math.max(1, ...(wordle?.solvedIn ?? []))
  return (
    <div className={cn("space-y-3 text-sm", className)}>
      {wordle && (
        <div>
          <p className="font-medium">
            {gameTitle("wordle")}{" "}
            <span className="font-normal text-muted-foreground">
              · streak {wordle.streak} · best {wordle.bestStreak}
            </span>
          </p>
          <div className="mt-1.5 space-y-0.5">
            {wordle.solvedIn.map((count, index) => (
              <div key={index} className="flex items-center gap-2 text-xs tabular-nums">
                <span className="w-2 text-muted-foreground">{index + 1}</span>
                <span
                  className={cn("rounded-sm px-1.5 text-right", count > 0 ? "bg-primary text-primary-foreground" : "bg-muted")}
                  style={{ width: `max(1.5rem, ${(count / mostSolved) * 100}%)` }}
                >
                  {count}
                </span>
              </div>
            ))}
            {wordle.failed > 0 && <p className="text-xs text-muted-foreground">{wordle.failed} not solved</p>}
          </div>
        </div>
      )}
      {typerace && typerace.timedRaces > 0 && (
        <p>
          <span className="font-medium">{gameTitle("typerace")}</span>{" "}
          <span className="text-muted-foreground">
            · best <span className="font-semibold text-foreground tabular-nums">{typerace.bestWpm}</span> WPM ·{" "}
            {Math.round(typerace.accuracyTotal / typerace.timedRaces)}% average accuracy
          </span>
        </p>
      )}
      {pool && (
        <p>
          <span className="font-medium">{gameTitle("pool")}</span>{" "}
          <span className="text-muted-foreground">
            · {plural(pool.runOuts, "run-out")} · {plural(pool.breakAndRuns, "break-and-run")}
          </span>
        </p>
      )}
    </div>
  )
}

/** The signed-in check next to a player's name; opens their profile card when the server sent a profile id. */
export function ProfileBadge({ profileId, color, className }: { profileId?: string; color?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const icon = <BadgeCheck aria-label="Signed in" className={className} style={{ color }} />
  if (!profileId) return icon
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="View profile" className="relative inline cursor-pointer align-baseline before:absolute before:-inset-3 before:content-['']">
        {icon}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">{open && <ProfileCard profileId={profileId} />}</DialogContent>
      </Dialog>
    </>
  )
}

function ProfileCard({ profileId }: { profileId: string }) {
  const card = useQuery(api.profiles.card, { profileId })
  if (card === undefined) return <DialogTitle className="text-muted-foreground">Loading…</DialogTitle>
  if (card === null) return <DialogTitle>Profile not found</DialogTitle>
  const played = card.stats.reduce((total, stat) => total + stat.played, 0)
  const wins = card.stats.reduce((total, stat) => total + stat.wins, 0)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: card.color }} />
          {card.displayName}
          {card.isYou && <span className="text-sm font-normal text-muted-foreground">(you)</span>}
        </DialogTitle>
        <DialogDescription>
          Member since {new Date(card.memberSince).toLocaleDateString()} · {played} {played === 1 ? "game" : "games"}, {wins}{" "}
          {wins === 1 ? "win" : "wins"}
        </DialogDescription>
      </DialogHeader>
      {card.vsYou && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          You vs them: <span className="font-semibold tabular-nums">{card.vsYou.wins}–{card.vsYou.losses}</span>
          <span className="text-muted-foreground"> in {card.vsYou.played} {card.vsYou.played === 1 ? "game" : "games"}</span>
        </p>
      )}
      {card.stats.length === 0 ? (
        <p className="text-sm text-muted-foreground">No finished games yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Game</th>
              <th className="pb-2 text-right font-medium">Played</th>
              <th className="pb-2 text-right font-medium">Wins</th>
            </tr>
          </thead>
          <tbody>
            {card.stats.slice(0, 8).map((stat) => (
              <tr key={stat.game} className="border-t">
                <td className="py-1.5 font-medium">{gameTitle(stat.game)}</td>
                <td className="py-1.5 text-right tabular-nums">{stat.played}</td>
                <td className={cn("py-1.5 text-right tabular-nums", stat.wins > 0 && "text-primary")}>{stat.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <GameHighlights stats={card.stats} className="border-t pt-3" />
    </>
  )
}
