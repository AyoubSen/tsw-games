import { useEffect, useState } from "react"
import { ArrowRight, Clock, MessageSquare, Pencil, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type {
  PublicGameState,
  Stroke,
  TelephoneChain,
} from "../../../../party/drawing"
import { Canvas } from "./Canvas"
import { Toolbar } from "./Toolbar"

const REACTION_OPTIONS = [
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F92F}",
  "\u{2764}\u{FE0F}",
]

interface TelephoneGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onSubmit: (submission: { text?: string; strokes?: Stroke[] }) => void
  onRevealNext: () => void
  onReact: (emoji: string) => void
  onRestart: () => void
  onLeave: () => void
}

export function TelephoneGame({
  gameState,
  playerId,
  isHost,
  onSubmit,
  onRevealNext,
  onReact,
  onRestart,
  onLeave,
}: TelephoneGameProps) {
  const [text, setText] = useState("")
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [selectedColor, setSelectedColor] = useState("#000000")
  const [selectedSize, setSelectedSize] = useState(8)
  const [timeLeft, setTimeLeft] = useState(gameState.roundTimeLimit)
  const [revealPending, setRevealPending] = useState(false)

  const assignment = gameState.telephoneAssignment
  const hasSubmitted = gameState.telephoneSubmittedIds.includes(playerId)
  const isFinished = gameState.status === "finished"
  const currentRevealChain =
    gameState.telephoneChains[gameState.telephoneChains.length - 1]

  useEffect(() => {
    setText("")
    setStrokes([])
  }, [gameState.telephoneStage])

  useEffect(() => {
    if (gameState.status !== "playing" || !gameState.roundStartedAt) {
      setTimeLeft(gameState.roundTimeLimit)
      return
    }

    const updateTimer = () => {
      const elapsed = Math.floor(
        (Date.now() - gameState.roundStartedAt!) / 1000,
      )
      setTimeLeft(Math.max(0, gameState.roundTimeLimit - elapsed))
    }

    updateTimer()
    const interval = window.setInterval(updateTimer, 1000)
    return () => window.clearInterval(interval)
  }, [gameState.status, gameState.roundStartedAt, gameState.roundTimeLimit])

  useEffect(() => {
    setRevealPending(false)
  }, [
    gameState.telephoneRevealChainIndex,
    gameState.telephoneRevealEntryIndex,
    gameState.telephoneRevealComplete,
  ])

  useEffect(() => {
    if (!revealPending) return
    const timeout = window.setTimeout(() => setRevealPending(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [revealPending])

  if (isFinished && !gameState.telephoneRevealComplete) {
    const isLastEntry =
      gameState.telephoneRevealEntryIndex + 1 >= gameState.telephoneTotalStages
    const isLastChain =
      gameState.telephoneRevealChainIndex + 1 >= gameState.telephoneTotalStages
    const revealLabel = !isLastEntry
      ? "Reveal Next Entry"
      : !isLastChain
        ? "Reveal Next Chain"
        : "View All Chains"

    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
        <div className="text-center">
          <Badge variant="secondary">
            Chain {gameState.telephoneRevealChainIndex + 1}/
            {gameState.telephoneTotalStages}
          </Badge>
          <h2 className="mt-3 text-3xl font-bold">The big reveal</h2>
          <p className="mt-2 text-muted-foreground">
            Entries appear one at a time for everyone in the room.
          </p>
        </div>

        {currentRevealChain ? (
          <TelephoneChainCard chain={currentRevealChain} />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Preparing the first chain...
            </CardContent>
          </Card>
        )}

        {currentRevealChain && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {REACTION_OPTIONS.map((emoji) => {
              const matchingReactions = gameState.telephoneReactions.filter(
                (reaction) => reaction.emoji === emoji,
              )
              const selected = matchingReactions.some(
                (reaction) => reaction.playerId === playerId,
              )

              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  className={`flex min-w-12 items-center justify-center gap-1 rounded-full border px-3 py-2 text-lg transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                  title={matchingReactions
                    .map((reaction) => reaction.playerName)
                    .join(", ")}
                  aria-label={`React with ${emoji}`}
                >
                  <span>{emoji}</span>
                  {matchingReactions.length > 0 && (
                    <span className="text-xs font-semibold">
                      {matchingReactions.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div className="text-center">
          {isHost ? (
            <Button
              onClick={() => {
                setRevealPending(true)
                onRevealNext()
              }}
              disabled={!currentRevealChain || revealPending}
            >
              {revealLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting for the host to continue the reveal...
            </p>
          )}
        </div>
      </div>
    )
  }

  if (isFinished) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
        <div className="text-center">
          <Badge variant="secondary">Final reveal</Badge>
          <h2 className="mt-3 text-3xl font-bold">See how every story changed</h2>
          <p className="mt-2 text-muted-foreground">
            Each chain started as one prompt and passed through the whole room.
          </p>
        </div>

        <div className="space-y-6">
          {gameState.telephoneChains.map((chain) => (
            <TelephoneChainCard key={chain.id} chain={chain} />
          ))}
        </div>

        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          {isHost && (
            <Button onClick={onRestart}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Play Again
            </Button>
          )}
          <Button variant="outline" onClick={onLeave}>
            Back to Menu
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <Badge variant="outline">
          Turn {gameState.telephoneStage + 1}/{gameState.telephoneTotalStages}
        </Badge>
        <div
          className={`flex items-center gap-1 text-sm font-medium ${
            timeLeft <= 10 ? "text-destructive" : ""
          }`}
        >
          <Clock className="h-4 w-4" />
          {timeLeft}s
        </div>
        <Badge variant="secondary" className="font-mono">
          {gameState.roomCode}
        </Badge>
      </div>

      {hasSubmitted ? (
        <Card className="mx-auto w-full max-w-xl">
          <CardContent className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Passed along</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Waiting for {gameState.telephoneTotalStages - gameState.telephoneSubmittedIds.length} other player
              {gameState.telephoneTotalStages - gameState.telephoneSubmittedIds.length === 1 ? "" : "s"}.
            </p>
          </CardContent>
        </Card>
      ) : assignment?.type === "draw" ? (
        <div className="space-y-3">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Draw this prompt
              </p>
              <p className="mt-1 text-xl font-bold">{assignment.prompt}</p>
            </CardContent>
          </Card>
          <Canvas
            strokes={strokes}
            isDrawer
            onStroke={(stroke) => setStrokes((current) => [...current, stroke])}
            color={selectedColor}
            size={selectedSize}
          />
          <Toolbar
            selectedColor={selectedColor}
            selectedSize={selectedSize}
            onColorChange={setSelectedColor}
            onSizeChange={setSelectedSize}
            onClear={() => setStrokes([])}
            onUndo={() => setStrokes((current) => current.slice(0, -1))}
            canUndo={strokes.length > 0}
          />
          <Button
            className="mx-auto w-full max-w-sm"
            onClick={() => onSubmit({ strokes })}
            disabled={timeLeft <= 0}
          >
            Submit Drawing
          </Button>
        </div>
      ) : assignment?.type === "describe" ? (
        <div className="mx-auto w-full max-w-[1200px] space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-bold">What do you think this is?</h2>
            <p className="text-sm text-muted-foreground">
              Describe only what you see. You cannot view the earlier prompt.
            </p>
          </div>
          {assignment.strokes.length > 0 ? (
            <Canvas
              strokes={assignment.strokes}
              isDrawer={false}
              onStroke={() => {}}
              color="#000000"
              size={8}
              disabled
            />
          ) : (
            <div className="rounded-2xl border border-dashed px-5 py-24 text-center text-muted-foreground">
              The previous player submitted a blank drawing.
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (text.trim() && timeLeft > 0) onSubmit({ text: text.trim() })
            }}
          >
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={120}
              placeholder="Type your interpretation..."
              autoFocus
            />
            <Button type="submit" disabled={!text.trim() || timeLeft <= 0}>
              Submit
            </Button>
          </form>
        </div>
      ) : assignment?.type === "write-prompt" ? (
        <Card className="mx-auto w-full max-w-xl">
          <CardHeader className="text-center">
            <CardTitle>Start a chain</CardTitle>
            <p className="text-sm text-muted-foreground">
              Write something fun for another player to draw.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (text.trim() && timeLeft > 0) onSubmit({ text: text.trim() })
              }}
            >
              <Input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={120}
                placeholder="A penguin running a bakery..."
                autoFocus
              />
              <Button
                className="w-full"
                type="submit"
                disabled={!text.trim() || timeLeft <= 0}
              >
                Start My Chain
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="mx-auto w-full max-w-xl">
          <CardContent className="py-12 text-center text-muted-foreground">
            Preparing your next turn...
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TelephoneChainCard({ chain }: { chain: TelephoneChain }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/40">
        <CardTitle className="text-lg">
          {chain.originPlayerName}&apos;s chain
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6">
        {chain.entries.map((entry, index) => (
          <div key={`${entry.authorId}-${index}`}>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              {entry.type === "text" ? (
                <MessageSquare className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              <span>{entry.authorName}</span>
            </div>
            {entry.type === "text" ? (
              <div className="rounded-2xl border bg-background px-5 py-6 text-center text-xl font-semibold">
                {entry.text}
              </div>
            ) : entry.strokes.length > 0 ? (
              <div className="mx-auto max-w-4xl">
                <Canvas
                  strokes={entry.strokes}
                  isDrawer={false}
                  onStroke={() => {}}
                  color="#000000"
                  size={8}
                  disabled
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed px-5 py-10 text-center text-muted-foreground">
                No drawing submitted
              </div>
            )}
            {index < chain.entries.length - 1 && (
              <ArrowRight className="mx-auto mt-4 h-5 w-5 rotate-90 text-muted-foreground" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
