/** Shared by the Convex functions and the profile page. */
export const PROFILE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const

export const MAX_DISPLAY_NAME = 20

export const cleanDisplayName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, MAX_DISPLAY_NAME)
