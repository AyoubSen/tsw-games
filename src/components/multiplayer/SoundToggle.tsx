import { Volume2, VolumeX } from "lucide-react"
import { setMuted, useSoundMuted } from "@/lib/sounds"
import { cn } from "@/lib/utils"

/** Mute switch for table sounds, styled to sit beside the reaction picker. */
export function SoundToggle({ className }: { className?: string }) {
  const muted = useSoundMuted()
  const label = muted ? "Unmute sounds" : "Mute sounds"
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={muted}
      title={label}
      onClick={() => setMuted(!muted)}
      className={cn(
        "pointer-events-auto grid size-11 place-items-center rounded-2xl border border-white/10 bg-black/45 text-white shadow-2xl backdrop-blur-md transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        muted && "text-white/55",
        className,
      )}
    >
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
    </button>
  )
}
