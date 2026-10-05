import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath, URL } from 'url'

import tailwindcss from '@tailwindcss/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'

const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // @clerk/tanstack-react-start isn't pre-bundled, so its React SDK must be: its swr
  // dependency imports the CommonJS use-sync-external-store shim.
  optimizeDeps: {
    include: [
      '@clerk/tanstack-react-start > @clerk/clerk-react',
      '@clerk/tanstack-react-start > @clerk/clerk-react/internal',
      '@clerk/tanstack-react-start > @clerk/clerk-react/errors',
    ],
  },
  plugins: [
    devtools({ eventBusConfig: { port: 42070 } }),
    netlify(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
