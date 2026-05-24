import { defineConfig } from 'vite'
import { resolve } from 'path'
import { cpSync } from 'fs'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        arch: resolve(__dirname, '系统架构图_v11_10kV.html'),
        wiring: resolve(__dirname, '电气接线图_v11_10kV.html'),
      }
    }
  },
  publicDir: false,
  plugins: [{
    name: 'copy-images',
    closeBundle() {
      cpSync(resolve(__dirname, 'images'), resolve(__dirname, 'dist/images'), { recursive: true })
    }
  }]
})
