import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getCorrectTimeline,
  nextRevealStage,
  pickTimelineEvents,
  publicTimelineEvents,
  revealStageMs,
  scoreTimelineOrder,
  TIMELINE_PACE_MS,
  type TimelineEvent,
  type TimelineRevealStage,
} from "@/lib/timelineChaos"
import type {
  PublicTimelineGameState,
  PublicTimelinePlayer,
  TimelineHistoryEntry,
  TimelineReveal,
  TimelineRoundResult,
  TimelineSettings,
} from "../../../../party/timeline-chaos"

export const SOLO_PLAYER_ID = "solo"

/** The same rounds and reveal beats as the server, run on a local timer for one player. */
interface SoloRun {
  settings: TimelineSettings
  events: TimelineEvent[]
  usedEventIds: string[]
  roundNumber: number
  roundId: string
  roundStartedAt: number
  roundEndsAt: number | null
  status: "playing" | "finished"
  phase: "ordering" | "reveal" | null
  reveal: TimelineReveal | null
  seq: number
  submission: { order: string[]; submittedAt: number; auto: boolean } | null
  draft: string[] | null
  result: TimelineRoundResult | null
  player: PublicTimelinePlayer
  history: TimelineHistoryEntry[]
  finishedAt: number | null
}

function deal(run: SoloRun, now: number): SoloRun {
  const picked = pickTimelineEvents(run.settings.pack, run.usedEventIds)
  const roundStartedAt = now + TIMELINE_PACE_MS.deal
  return {
    ...run,
    events: picked.events,
    usedEventIds: picked.usedEventIds,
    roundNumber: run.roundNumber + 1,
    roundId: `${now}:${run.roundNumber + 1}`,
    roundStartedAt,
    roundEndsAt: roundStartedAt + run.settings.roundSeconds * 1000,
    phase: "ordering",
    reveal: null,
    submission: null,
    draft: null,
    result: null,
  }
}

function enter(run: SoloRun, stage: TimelineRevealStage, now: number): SoloRun {
  const seq = run.seq + 1
  return { ...run, seq, reveal: { seq, stage, startedAt: now, endsAt: now + revealStageMs(stage, run.events.length) } }
}

function close(run: SoloRun, now: number): SoloRun {
  if (run.phase !== "ordering" || !run.roundEndsAt) return run
  const submission = run.submission ?? (run.draft ? { order: run.draft, submittedAt: run.roundEndsAt, auto: true } : null)
  const result = submission
    ? scoreTimelineOrder(submission.order, getCorrectTimeline(run.events), submission.submittedAt, run.roundStartedAt, run.roundEndsAt)
    : { points: 0, correctPairs: 0, correctPositions: 0, perfect: false }
  return enter({
    ...run,
    submission,
    phase: "reveal",
    roundEndsAt: null,
    result: {
      order: submission?.order ?? null,
      ...result,
      lockMs: submission && !submission.auto ? Math.max(0, submission.submittedAt - run.roundStartedAt) : null,
    },
  }, "tension", now)
}

function score(run: SoloRun): SoloRun {
  const result = run.result
  if (!result) return run
  const player = { ...run.player }
  player.score += result.points
  player.correctPairs += result.correctPairs
  player.correctPositions += result.correctPositions
  if (result.perfect) {
    player.perfectRounds += 1
    player.totalAnswerMs += result.lockMs ?? run.settings.roundSeconds * 1000
  }
  if (result.lockMs !== null) player.fastestLockMs = Math.min(player.fastestLockMs ?? Infinity, result.lockMs)
  return {
    ...run,
    player,
    history: [...run.history, {
      roundNumber: run.roundNumber,
      events: publicTimelineEvents(run.events, true),
      correctOrder: getCorrectTimeline(run.events),
      results: { [SOLO_PLAYER_ID]: result },
    }],
  }
}

function step(run: SoloRun, now: number): SoloRun {
  if (run.status !== "playing") return run
  if (run.phase === "ordering") return run.roundEndsAt && now >= run.roundEndsAt - 50 ? close(run, now) : run
  if (!run.reveal || now < run.reveal.endsAt - 50) return run
  const next = nextRevealStage(run.reveal.stage, false)
  if (next) return enter(next === "score" ? score(run) : run, next, now)
  if (run.roundNumber >= run.settings.rounds) return { ...run, status: "finished", phase: null, reveal: null, finishedAt: now }
  return deal(run, now)
}

function publicState(run: SoloRun): PublicTimelineGameState {
  const finished = run.status === "finished"
  const revealed = finished || (run.phase === "reveal" && run.reveal?.stage !== "tension")
  return {
    roomCode: "",
    hostId: SOLO_PLAYER_ID,
    players: { [SOLO_PLAYER_ID]: run.player },
    maxPlayers: 1,
    settings: run.settings,
    status: run.status,
    phase: run.phase,
    reveal: run.reveal,
    events: publicTimelineEvents(run.events, revealed),
    correctOrder: revealed ? getCorrectTimeline(run.events) : [],
    submittedPlayerIds: run.submission && !run.submission.auto ? [SOLO_PLAYER_ID] : [],
    myOrder: run.submission?.order ?? null,
    myDraft: run.phase === "ordering" ? run.draft : null,
    roundResults: run.result && (finished || run.reveal?.stage === "score") ? { [SOLO_PLAYER_ID]: run.result } : {},
    history: run.history,
    roundNumber: run.roundNumber,
    roundId: run.roundId,
    roundEndsAt: run.roundEndsAt,
    finishedAt: run.finishedAt,
    winnerIds: finished ? [SOLO_PLAYER_ID] : [],
    serverNow: Date.now(),
  }
}

export function useSoloTimeline(name = "You") {
  const [run, setRun] = useState<SoloRun | null>(null)

  useEffect(() => {
    if (!run || run.status !== "playing") return
    const due = run.phase === "ordering" ? run.roundEndsAt : run.reveal?.endsAt
    if (!due) return
    const timer = window.setTimeout(() => setRun((current) => current && step(current, Date.now())), Math.max(0, due - Date.now()))
    return () => window.clearTimeout(timer)
  }, [run])

  const start = useCallback((settings: TimelineSettings) => {
    const now = Date.now()
    setRun(deal({
      settings, events: [], usedEventIds: [], roundNumber: 0, roundId: "", roundStartedAt: now, roundEndsAt: null,
      status: "playing", phase: null, reveal: null, seq: 0, submission: null, draft: null, result: null,
      player: {
        id: SOLO_PLAYER_ID, name, score: 0, perfectRounds: 0, correctPositions: 0, correctPairs: 0, totalAnswerMs: 0,
        fastestLockMs: null, joinedAt: now, connected: true,
      },
      history: [], finishedAt: null,
    }, now))
  }, [name])

  const arrange = useCallback((roundId: string, order: string[] | null) => {
    setRun((current) => current?.phase === "ordering" && current.roundId === roundId && !current.submission ? { ...current, draft: order } : current)
  }, [])

  const lock = useCallback((roundId: string, order: string[]) => {
    setRun((current) => {
      if (current?.phase !== "ordering" || current.roundId !== roundId || current.submission) return current
      const now = Date.now()
      return close({ ...current, submission: { order, submittedAt: now, auto: false } }, now)
    })
  }, [])

  const stop = useCallback(() => setRun(null), [])
  const state = useMemo(() => (run ? publicState(run) : null), [run])
  return { state, settings: run?.settings ?? null, start, arrange, lock, stop }
}
