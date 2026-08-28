import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos ao index.html em vez de absolutos à raiz do domínio.
  // A estação não vive sempre na raiz: no GitHub Pages está numa subpasta com
  // o nome do repositório, e pode ainda vir a correr a partir de um ficheiro
  // local. É a mesma razão que levou ao HashRouter — ver src/main.tsx.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    // O quiosque corre num ecrã dedicado: preferimos poucos ficheiros grandes
    // a muitos pedidos pequenos numa rede instável.
    chunkSizeWarningLimit: 800,
  },
})
