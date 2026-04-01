import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts'))            return 'vendor-charts'
          if (id.includes('lucide-react'))        return 'vendor-icons'
          if (id.includes('@tanstack'))           return 'vendor-query'
          if (id.includes('react'))               return 'vendor-react'
          if (id.includes('axios'))               return 'vendor-misc'
        },
      },
    },
  },
})
