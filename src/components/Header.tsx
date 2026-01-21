import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Gamepad2,
  Home,
  Menu,
  X,
  LetterText,
  Sun,
  Moon,
  Settings,
  LayoutGrid,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettings, type Theme, type Layout } from '@/lib/useTheme'

interface GameLink {
  to: string
  icon: React.ReactNode
  label: string
}

const games: GameLink[] = [
  {
    to: '/games/wordle',
    icon: <LetterText size={20} />,
    label: 'Wordle',
  },
]

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, layout, setTheme, setLayout, mounted } = useSettings()

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-card border-b border-border">
        <div className="flex items-center">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <Link to="/" className="ml-4 flex items-center gap-2">
            <Gamepad2 className="w-8 h-8 text-primary" />
            <span className="text-xl font-bold">TSW Games</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Settings">
                <Settings size={20} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTheme('light')}>
                <Sun className="mr-2 h-4 w-4" />
                Light
                {theme === 'light' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                <Moon className="mr-2 h-4 w-4" />
                Dark
                {theme === 'dark' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel>Home Layout</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setLayout('cards')}>
                <Layers className="mr-2 h-4 w-4" />
                Cards
                {layout === 'cards' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLayout('grid')}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                Compact Grid
                {layout === 'grid' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-card border-r border-border z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-primary" />
            <span className="text-lg font-bold">TSW Games</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2',
            }}
            activeOptions={{ exact: true }}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>

          <div className="mt-4 mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Games
          </div>

          {games.map((game) => (
            <Link
              key={game.to}
              to={game.to}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-1"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-1',
              }}
            >
              {game.icon}
              <span className="font-medium">{game.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border text-center text-sm text-muted-foreground">
          Made for TSW crew
        </div>
      </aside>
    </>
  )
}
