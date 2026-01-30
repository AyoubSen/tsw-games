export interface PotContribution {
  playerId: string
  amount: number
  folded: boolean
  allIn: boolean
}

export interface Pot {
  amount: number
  eligiblePlayerIds: string[]
}

// Calculate main pot and side pots based on player contributions
// This handles all-in scenarios where players can only win up to what they contributed
export function calculatePots(contributions: PotContribution[]): Pot[] {
  // Only consider players who contributed > 0
  const players = contributions.filter((c) => c.amount > 0)

  if (players.length === 0) {
    return []
  }

  // Sort by contribution amount (ascending)
  const sorted = [...players].sort((a, b) => a.amount - b.amount)

  const pots: Pot[] = []
  let previousLevel = 0

  // Track unique contribution levels from all-in players and the max
  const levels: number[] = []
  for (const p of sorted) {
    if (p.allIn && p.amount > previousLevel) {
      if (!levels.includes(p.amount)) {
        levels.push(p.amount)
      }
    }
  }
  // Add the max contribution as the final level
  const maxContribution = Math.max(...sorted.map((p) => p.amount))
  if (!levels.includes(maxContribution)) {
    levels.push(maxContribution)
  }
  levels.sort((a, b) => a - b)

  for (const level of levels) {
    const sliceAmount = level - previousLevel
    if (sliceAmount <= 0) continue

    let potAmount = 0
    const eligible: string[] = []

    for (const p of players) {
      const canContribute = Math.min(sliceAmount, Math.max(0, p.amount - previousLevel))
      potAmount += canContribute

      // Player is eligible if they contributed at this level AND didn't fold
      if (p.amount >= level && !p.folded) {
        eligible.push(p.playerId)
      }
    }

    if (potAmount > 0 && eligible.length > 0) {
      pots.push({ amount: potAmount, eligiblePlayerIds: eligible })
    } else if (potAmount > 0 && eligible.length === 0) {
      // Everyone eligible folded - add to previous pot or create with remaining players
      const nonFolded = players.filter((p) => !p.folded && p.amount >= previousLevel).map((p) => p.playerId)
      if (nonFolded.length > 0) {
        pots.push({ amount: potAmount, eligiblePlayerIds: nonFolded })
      } else if (pots.length > 0) {
        // Merge into previous pot
        pots[pots.length - 1].amount += potAmount
      }
    }

    previousLevel = level
  }

  // Merge consecutive pots that have the same eligible players
  const merged: Pot[] = []
  for (const pot of pots) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.eligiblePlayerIds.length === pot.eligiblePlayerIds.length &&
      last.eligiblePlayerIds.every((id) => pot.eligiblePlayerIds.includes(id))
    ) {
      last.amount += pot.amount
    } else {
      merged.push({ ...pot })
    }
  }

  return merged
}

// Simple total pot calculation (sum of all contributions)
export function totalPot(contributions: PotContribution[]): number {
  return contributions.reduce((sum, c) => sum + c.amount, 0)
}
