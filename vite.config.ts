import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves under /<repo>/; Vercel and local dev serve at root.
const isGhPages = process.env.DEPLOY_TARGET === 'gh-pages'

export default defineConfig({
  base: isGhPages ? '/repo-x-ray/' : '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
  },
})
