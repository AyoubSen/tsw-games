import { createFileRoute, Link } from '@tanstack/react-router'
import { LetterText, Users, Zap, Play } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/useTheme'

export const Route = createFileRoute('/')({ component: HomePage })

interface Game {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  path: string
  players: string
  color: string
  isNew?: boolean
  comingSoon?: boolean
}

const games: Game[] = [
  {
    id: 'wordle',
    title: 'Wordle',
    description: 'Guess the 5-letter word in 6 tries. Green means correct, yellow means wrong position.',
    icon: <LetterText className="w-10 h-10" />,
    path: '/games/wordle',
    players: '1 player',
    color: 'from-emerald-500 to-green-600',
    isNew: true,
  },
  {
    id: 'coming-soon',
    title: 'More Coming',
    description: 'New games are being added. Stay tuned!',
    icon: <span className="text-3xl">?</span>,
    path: '#',
    players: 'TBD',
    color: 'from-zinc-500 to-zinc-600',
    comingSoon: true,
  },
]

function CardsLayout({ games }: { games: Game[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {games.map((game) => (
        <Card
          key={game.id}
          className={`relative overflow-hidden transition-all duration-300 ${
            game.comingSoon
              ? 'border-dashed opacity-60'
              : 'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1'
          }`}
        >
          {game.isNew && (
            <div className="absolute top-3 right-3 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded">
              NEW
            </div>
          )}
          <CardHeader>
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center text-white mb-3 shadow-lg`}>
              {game.icon}
            </div>
            <CardTitle className={game.comingSoon ? 'text-muted-foreground' : ''}>
              {game.title}
            </CardTitle>
            <CardDescription>{game.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{game.players}</span>
              {game.comingSoon ? (
                <Button disabled variant="secondary">Soon</Button>
              ) : (
                <Button asChild>
                  <Link to={game.path}>Play</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function GridLayout({ games }: { games: Game[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {games.map((game) => (
        <Link
          key={game.id}
          to={game.comingSoon ? '/' : game.path}
          className={`group relative flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 ${
            game.comingSoon
              ? 'border-dashed opacity-50 cursor-not-allowed'
              : 'hover:border-primary/50 hover:bg-accent/50 hover:-translate-y-1'
          }`}
          onClick={(e) => game.comingSoon && e.preventDefault()}
        >
          {game.isNew && (
            <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full">
              NEW
            </div>
          )}
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-white mb-3 shadow-md group-hover:scale-110 transition-transform`}>
            <span className="scale-75">{game.icon}</span>
          </div>
          <span className={`font-semibold text-center ${game.comingSoon ? 'text-muted-foreground' : ''}`}>
            {game.title}
          </span>
          <span className="text-xs text-muted-foreground mt-1">{game.players}</span>
          {!game.comingSoon && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/90 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-8 h-8 text-primary-foreground" fill="currentColor" />
            </div>
          )}
        </Link>
      ))}
    </div>
  )
}

function HomePage() {
  const { layout } = useSettings()

  return (
    <div className="min-h-[calc(100vh-73px)] bg-background">
      <section className="py-12 md:py-16 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
            TSW Games
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-6">
            Mini games for the crew. Challenge your friends and have fun!
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span>Quick to play</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span>Multiplayer soon</span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Games</h2>
          <span className="text-sm text-muted-foreground">{games.filter(g => !g.comingSoon).length} available</span>
        </div>

        {layout === 'cards' ? (
          <CardsLayout games={games} />
        ) : (
          <GridLayout games={games} />
        )}
      </section>
    </div>
  )
}
