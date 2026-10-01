import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  build: { outDir: 'utools/dist' },
  plugins: [vue()],
})
