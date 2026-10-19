import { defineStore } from 'pinia'
import { login as loginApi, getMe, logout as logoutApi } from '../api/auth'

const TOKEN_KEY = 'patrol_token'
const USER_KEY = 'patrol_user'

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch (e) {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: readUser(),
    loading: false,
  }),

  getters: {
    isLoggedIn: (s) => !!s.token,
    role: (s) => s.user?.role || '',
    displayName: (s) => s.user?.displayName || s.user?.username || '',
    roleText: (s) => ({ ADMIN: '系统管理员', OPERATOR: '操作员', VIEWER: '观察员' }[s.user?.role] || '未分配'),
  },

  actions: {
    async login(username, password) {
      this.loading = true
      try {
        const data = await loginApi(username, password)
        this.token = data.token
        this.user = { userId: data.userId, username: data.username, role: data.role }
        localStorage.setItem(TOKEN_KEY, this.token)
        localStorage.setItem(USER_KEY, JSON.stringify(this.user))

        // 补全 displayName（登录接口不返回）
        try {
          const me = await getMe()
          this.user = { ...this.user, ...me }
          localStorage.setItem(USER_KEY, JSON.stringify(this.user))
        } catch (e) {
          /* 非致命 */
        }
        return this.user
      } finally {
        this.loading = false
      }
    },

    async logout() {
      try {
        await logoutApi()
      } catch (e) {
        /* 后端登出为简化实现，失败也继续清本地 */
      }
      this.clear()
    },

    clear() {
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    },

    hasRole(...roles) {
      if (!roles.length) return true
      return roles.includes(this.role)
    },
  },
})
