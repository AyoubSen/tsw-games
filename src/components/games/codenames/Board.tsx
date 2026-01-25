import { Card } from "./Card"
import type { PublicCard } from "../../../../party/codenames"

interface BoardProps {
  cards: PublicCard[]
  isSpymaster: boolean
  canGuess: boolean
  onGuess: (cardIndex: number) => void
}

export function Board({ cards, isSpymaster, canGuess, onGuess }: BoardProps) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3 w-full max-w-3xl mx-auto">
      {cards.map((card, index) => (
        <Card
          key={index}
          word={card.word}
          type={card.type}
          revealed={card.revealed}
          isSpymaster={isSpymaster}
          canGuess={canGuess}
          onClick={() => onGuess(index)}
        />
      ))}
    </div>
  )
}
