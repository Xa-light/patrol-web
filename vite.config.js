import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 加载 .env / .env.local 中 VITE_ 前缀变量
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyTarget = env.VITE_API_PROXY || 'http://127.0.0.1:8000'

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/static': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      // 生产构建：按路由分包，减少首屏体积
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('echarts')) return 'echarts'
            if (id.includes('element-plus')) return 'element-plus'
            if (id.includes('node_modules')) return 'vendor'
          },
        },
      },
      // 超过 4KB 的资源转 base64（减少小图请求数）
      assetsInlineLimit: 4096,
    },
  }
})
