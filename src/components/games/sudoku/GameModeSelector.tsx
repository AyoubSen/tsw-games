import { useState } from 'react'
import { User, Users, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Difficulty, GameMode } from './useSudoku'

interface GameModeSelectorProps {
  onStartSinglePlayer: (difficulty: Difficulty, gameMode: GameMode) => void
  onCreateMultiplayer: (playerName: string, difficulty: Difficulty) => void
  onJoinMultiplayer: (roomCode: string, playerName: string) => void
  isConnecting: boolean
  error: string | null
}

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: 'easy', label: 'Easy', description: 'Perfect for beginners' },
  { value: 'medium', label: 'Medium', description: 'A balanced challenge' },
  { value: 'hard', label: 'Hard', description: 'For experienced players' },
  { value: 'expert', label: 'Expert', description: 'Ultimate brain teaser' },
]

export function GameModeSelector({
  onStartSinglePlayer,
  onCreateMultiplayer,
  onJoinMultiplayer,
  isConnecting,
  error,
}: GameModeSelectorProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium')
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('normal')
  const [mode, setMode] = useState<'select' | 'single' | 'create' | 'join'>('select')
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')

  const handleStartSinglePlayer = () => {
    onStartSinglePlayer(selectedDifficulty, selectedGameMode)
  }

  const handleCreateGame = (e: React.FormEvent) => {
    e.preventDefault()
    if (playerName.trim()) {
      onCreateMultiplayer(playerName.trim(), selectedDifficulty)
    }
  }

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault()
    if (playerName.trim() && roomCode.trim()) {
      onJoinMultiplayer(roomCode.trim(), playerName.trim())
    }
  }

  if (mode === 'select') {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Choose Game Mode</h2>
          <p className="text-muted-foreground">Play solo or race against friends</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setMode('single')}
          >
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>Single Player</CardTitle>
              <CardDescription>
                Solve puzzles at your own pace with timer, hints, and notes
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setMode('create')}
          >
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>Multiplayer Race</CardTitle>
              <CardDescription>
                Race against friends! First to complete the puzzle wins
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="text-center">
          <Button variant="link" onClick={() => setMode('join')}>
            Have a room code? Join a game
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'single') {
    return (
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold mb-2">Single Player</h2>
          <p className="text-muted-foreground">Select game mode and difficulty</p>
        </div>

        {/* Game Mode Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Game Mode</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedGameMode('normal')}
              className={`
                p-4 rounded-lg border-2 text-left transition-all
                ${selectedGameMode === 'normal'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
                }
              `}
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span className="font-semibold">Normal</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Shows mistakes in red</div>
            </button>
            <button
              type="button"
              onClick={() => setSelectedGameMode('hardcore')}
              className={`
                p-4 rounded-lg border-2 text-left transition-all
                ${selectedGameMode === 'hardcore'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
                }
              `}
            >
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4" />
                <span className="font-semibold">Hardcore</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">No error feedback</div>
            </button>
          </div>
        </div>

        {/* Difficulty Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Difficulty</label>
          <div className="grid grid-cols-2 gap-3">
            {DIFFICULTIES.map(diff => (
              <button
                type="button"
                key={diff.value}
                onClick={() => setSelectedDifficulty(diff.value)}
                className={`
                  p-4 rounded-lg border-2 text-left transition-all
                  ${selectedDifficulty === diff.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                  }
                `}
              >
                <div className="font-semibold">{diff.label}</div>
                <div className="text-xs text-muted-foreground">{diff.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setMode('select')} className="flex-1">
            Back
          </Button>
          <Button onClick={handleStartSinglePlayer} className="flex-1">
            Start Game
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold mb-2">Create Game</h2>
          <p className="text-muted-foreground">Set up a multiplayer race</p>
        </div>

        <form onSubmit={handleCreateGame} className="space-y-4">
          <div>
            <label htmlFor="playerName" className="block text-sm font-medium mb-2">
              Your Name
            </label>
            <Input
              id="playerName"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Difficulty</label>
            <div className="grid grid-cols-2 gap-2">
              {DIFFICULTIES.map(diff => (
                <button
                  type="button"
                  key={diff.value}
                  onClick={() => setSelectedDifficulty(diff.value)}
                  className={`
                    p-3 rounded-lg border text-sm transition-all
                    ${selectedDifficulty === diff.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  {diff.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => setMode('select')} className="flex-1">
              Back
            </Button>
            <Button type="submit" disabled={isConnecting || !playerName.trim()} className="flex-1">
              {isConnecting ? 'Creating...' : 'Create Game'}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold mb-2">Join Game</h2>
          <p className="text-muted-foreground">Enter the room code to join</p>
        </div>

        <form onSubmit={handleJoinGame} className="space-y-4">
          <div>
            <label htmlFor="playerNameJoin" className="block text-sm font-medium mb-2">
              Your Name
            </label>
            <Input
              id="playerNameJoin"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              required
            />
          </div>

          <div>
            <label htmlFor="roomCode" className="block text-sm font-medium mb-2">
              Room Code
            </label>
            <Input
              id="roomCode"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-character code"
              maxLength={6}
              className="text-center text-lg tracking-widest uppercase"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => setMode('select')} className="flex-1">
              Back
            </Button>
            <Button
              type="submit"
              disabled={isConnecting || !playerName.trim() || roomCode.length < 6}
              className="flex-1"
            >
              {isConnecting ? 'Joining...' : 'Join Game'}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return null
}
