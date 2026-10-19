import axios from 'axios'
import { ElMessage } from 'element-plus'

// 统一请求封装：
// 1) 自动注入 Bearer Token
// 2) 统一解包后端 { code, message, data, traceId }
// 3) 401 自动清登录态并跳登录页；403 提示权限不足
// 4) 支持 { silent: true } 关闭全局错误提示（轮询场景）
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 15000,
})

service.interceptors.request.use((config) => {
  const token = localStorage.getItem('patrol_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

service.interceptors.response.use(
  (res) => {
    if (res.status === 204 || res.data === null || res.data === undefined) return null
    const body = res.data
    if (typeof body === 'object' && 'code' in body) {
      if (body.code === 200) return body.data
      if (!res.config.silent) ElMessage.error(body.message || '请求失败')
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return body
  },
  (err) => {
    const status = err.response?.status
    const body = err.response?.data
    const msg = body?.message || body?.detail?.message || err.message || '网络异常'

    if (status === 401) {
      localStorage.removeItem('patrol_token')
      localStorage.removeItem('patrol_user')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
      return Promise.reject(new Error('登录已过期，请重新登录'))
    }

    if (!err.config?.silent) {
      if (status === 403) ElMessage.error(`权限不足：${msg}`)
      else if (!err.response) ElMessage.error('无法连接后端服务，请确认 8000 端口已启动')
      else ElMessage.error(msg)
    }
    return Promise.reject(new Error(msg))
  }
)

export default service
