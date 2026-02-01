import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PublicGameState } from "../../../../../party/mafia"

interface ChatPanelProps {
  gameState: PublicGameState
  onChat: (text: string) => void
}

export function ChatPanel({ gameState, onChat }: ChatPanelProps) {
  const [message, setMessage] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const me = gameState.players[gameState.myId]
  const canChat = me?.alive ?? false

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [gameState.chat.length])

  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed || !canChat) return
    onChat(trimmed)
    setMessage("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-400">
        Village Chat {!canChat && "(Dead - spectating)"}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-48 px-3 py-2 space-y-1.5">
        {gameState.chat.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-4">No messages yet. Start the discussion!</p>
        )}
        {gameState.chat.map((msg) => (
          <div key={msg.id} className="text-sm">
            <span className="font-medium text-zinc-300">{msg.playerName}</span>
            <span className="text-zinc-500">: </span>
            <span className="text-zinc-400">{msg.text}</span>
          </div>
        ))}
      </div>

      {canChat && (
        <div className="flex gap-2 p-2 border-t border-zinc-800">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            maxLength={200}
            className="bg-zinc-800 border-zinc-700 text-zinc-200 text-sm"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim()}
            className="shrink-0 bg-zinc-700 hover:bg-zinc-600"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
