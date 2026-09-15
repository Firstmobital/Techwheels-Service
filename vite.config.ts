import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Absolute asset URLs so `/` loads JS/CSS on mobile browsers.
  // `base: './'` resolves `./assets/*` from `/home` but breaks on many
  // phones at `https://domain/` (no trailing path segment).
  base: '/',
})
