import { useState, useEffect, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type Layout = 'cards' | 'grid'

interface Settings {
  theme: Theme
  layout: Layout
}

const STORAGE_KEY = 'tsw-games-settings'

function getInitialSettings(): Settings {
  if (typeof window === 'undefined') {
    return { theme: 'dark', layout: 'cards' }
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {}

  return { theme: 'dark', layout: 'cards' }
}

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return

  const root = document.documentElement

  let isDark = theme === 'dark'
  if (theme === 'system') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  if (isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(getInitialSettings)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setSettings(getInitialSettings())
  }, [])

  useEffect(() => {
    if (!mounted) return
    applyTheme(settings.theme)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings, mounted])

  useEffect(() => {
    if (!mounted || settings.theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [mounted, settings.theme])

  const setTheme = useCallback((theme: Theme) => {
    setSettings(prev => ({ ...prev, theme }))
  }, [])

  const setLayout = useCallback((layout: Layout) => {
    setSettings(prev => ({ ...prev, layout }))
  }, [])

  const toggleTheme = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark'
    }))
  }, [])

  return {
    theme: settings.theme,
    layout: settings.layout,
    setTheme,
    setLayout,
    toggleTheme,
    mounted,
  }
}
