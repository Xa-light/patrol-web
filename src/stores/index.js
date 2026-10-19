import { createPinia } from 'pinia'

// 单独导出实例，供 router 守卫在组件外使用
export const pinia = createPinia()
