import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from '../stores'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('../layouts/DefaultLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '运行总览', icon: 'Odometer' },
      },
      {
        path: 'map',
        name: 'map',
        component: () => import('../views/SlamMap.vue'),
        meta: { title: 'SLAM 建图', icon: 'MapLocation' },
      },
      {
        path: 'photos',
        name: 'photos',
        component: () => import('../views/Photos.vue'),
        meta: { title: '抓拍相册', icon: 'Camera' },
      },
      {
        path: 'control',
        name: 'control',
        component: () => import('../views/Control.vue'),
        meta: { title: '实时控制', icon: 'Aim', roles: ['ADMIN', 'OPERATOR'] },
      },
      {
        path: 'routes',
        name: 'routes',
        component: () => import('../views/Routes.vue'),
        meta: { title: '路线管理', icon: 'Guide', roles: ['ADMIN', 'OPERATOR'] },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: () => import('../views/Tasks.vue'),
        meta: { title: '任务管理', icon: 'List', roles: ['ADMIN', 'OPERATOR'] },
      },
      {
        path: 'alarms',
        name: 'alarms',
        component: () => import('../views/Alarms.vue'),
        meta: { title: '报警中心', icon: 'Warning' },
      },
      {
        path: 'logs',
        name: 'logs',
        component: () => import('../views/Logs.vue'),
        meta: { title: '操作日志', icon: 'Document', roles: ['ADMIN', 'OPERATOR'] },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('../views/Users.vue'),
        meta: { title: '用户管理', icon: 'User', roles: ['ADMIN'] },
      },
    ],
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('../views/Forbidden.vue'),
    meta: { public: true, title: '无访问权限' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('../views/NotFound.vue'),
    meta: { public: true, title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const auth = useAuthStore(pinia)
  document.title = `${to.meta.title ? to.meta.title + ' · ' : ''}SCOUT MINI 巡逻管控平台`

  if (to.meta.public) {
    if (to.path === '/login' && auth.isLoggedIn) return '/dashboard'
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }

  if (to.meta.roles && !to.meta.roles.includes(auth.role)) {
    return '/403'
  }

  return true
})

export default router
