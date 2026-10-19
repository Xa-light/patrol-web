<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { useVehicleStore } from '../stores/vehicle'
import { useAlarmStore } from '../stores/alarm'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const vehicle = useVehicleStore()
const alarm = useAlarmStore()

const collapsed = ref(false)

const allMenus = [
  { path: '/dashboard', title: '运行总览', icon: 'Odometer' },
  { path: '/map', title: 'SLAM 建图', icon: 'MapLocation' },
  { path: '/control', title: '实时控制', icon: 'Aim', roles: ['ADMIN', 'OPERATOR'] },
  { path: '/routes', title: '路线管理', icon: 'Guide', roles: ['ADMIN', 'OPERATOR'] },
  { path: '/tasks', title: '任务管理', icon: 'List', roles: ['ADMIN', 'OPERATOR'] },
  { path: '/alarms', title: '报警中心', icon: 'Warning' },
  { path: '/photos', title: '抓拍相册', icon: 'Camera' },
  { path: '/logs', title: '操作日志', icon: 'Document', roles: ['ADMIN', 'OPERATOR'] },
  { path: '/users', title: '用户管理', icon: 'User', roles: ['ADMIN'] },
]

const menus = computed(() =>
  allMenus.filter((m) => !m.roles || m.roles.includes(auth.role))
)

const pageTitle = computed(() => route.meta.title || '')
const batteryText = computed(() =>
  vehicle.battery != null ? `${Number(vehicle.battery).toFixed(1)} V` : '—'
)
const updatedText = computed(() => {
  if (!vehicle.lastUpdated) return '等待数据'
  const s = Math.max(0, Math.round((Date.now() - vehicle.lastUpdated) / 1000))
  return s <= 1 ? '刚刚更新' : `${s}s 前更新`
})

async function onLogout() {
  try {
    await ElMessageBox.confirm('确定退出当前账号？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch (e) {
    return
  }
  await auth.logout()
  router.push('/login')
}

onMounted(() => {
  vehicle.startPolling(1000)
  alarm.startPolling(5000)
})

onBeforeUnmount(() => {
  vehicle.stopPolling()
  alarm.stopPolling()
})
</script>

<template>
  <div class="layout" :class="{ collapsed }">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">S</div>
        <div v-show="!collapsed" class="brand-text">
          <b>SCOUT MINI</b>
          <span>巡逻管控平台</span>
        </div>
      </div>

      <el-menu :default-active="route.path" router :collapse="collapsed" class="menu">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <template #title>
            <span class="menu-text">{{ m.title }}</span>
            <el-badge
              v-if="m.path === '/alarms' && alarm.pending > 0"
              :value="alarm.pending"
              :max="99"
              class="menu-badge"
            />
          </template>
        </el-menu-item>
      </el-menu>

      <div class="sidebar-foot">
        <span v-show="!collapsed" class="ver">阶段4 · 前后端联调</span>
        <el-button text size="small" @click="collapsed = !collapsed">
          <el-icon><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon>
        </el-button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>{{ pageTitle }}</h1>
          <span class="crumb">阶段4 / {{ pageTitle }}</span>
        </div>

        <div class="topbar-right">
          <div class="vehicle-chip">
            <span class="dot" :class="vehicle.online ? 'on' : 'off'" />
            <b>{{ vehicle.sn }}</b>
            <span class="sep" />
            <span class="muted">{{ vehicle.mode }}</span>
            <span class="sep" />
            <span class="muted">{{ batteryText }}</span>
            <span class="sep" />
            <span class="muted">{{ updatedText }}</span>
          </div>

          <el-dropdown trigger="click">
            <div class="user-chip">
              <div class="avatar">{{ (auth.displayName || 'U').slice(0, 1) }}</div>
              <div class="user-meta">
                <b>{{ auth.displayName }}</b>
                <span>{{ auth.roleText }}</span>
              </div>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  {{ auth.user?.username }} · {{ auth.role }}
                </el-dropdown-item>
                <el-dropdown-item divided @click="onLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

/* ---------- 侧边栏 ---------- */
.sidebar {
  width: var(--sidebar-w);
  flex: none;
  background: #fff;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width 0.18s ease;
}
.collapsed .sidebar { width: 64px; }

.brand {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
}
.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.brand-text { display: flex; flex-direction: column; line-height: 1.25; overflow: hidden; }
.brand-text b { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; }
.brand-text span { font-size: 11px; color: var(--text-3); white-space: nowrap; }

.menu { border-right: none; padding: 10px 8px; flex: 1; overflow-y: auto; }
.menu :deep(.el-menu-item) {
  height: 42px;
  border-radius: 8px;
  margin-bottom: 4px;
  color: var(--text-2);
}
.menu :deep(.el-menu-item:hover) { background: #f5f7fb; color: var(--text); }
.menu :deep(.el-menu-item.is-active) {
  background: var(--brand-weak);
  color: var(--brand);
  font-weight: 500;
}
.menu-text { flex: 1; }
.menu-badge { margin-left: auto; }
.menu-badge :deep(.el-badge__content) { font-size: 10px; }

.sidebar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
}
.ver { font-size: 11px; color: var(--text-3); white-space: nowrap; }

/* ---------- 顶栏 ---------- */
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.topbar {
  height: 60px;
  flex: none;
  background: #fff;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  gap: 16px;
}
.topbar-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.topbar-left h1 { font-size: 17px; font-weight: 500; margin: 0; }
.crumb { font-size: 12px; color: var(--text-3); }

.topbar-right { display: flex; align-items: center; gap: 14px; }

.vehicle-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 6px 12px;
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 20px;
  white-space: nowrap;
}
.vehicle-chip b { font-weight: 500; font-size: 12px; }
.vehicle-chip .sep { width: 1px; height: 12px; background: var(--border-strong); }

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
  outline: none;
}
.user-chip:hover { background: #f5f7fb; }
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--brand-weak);
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
}
.user-meta { display: flex; flex-direction: column; line-height: 1.25; }
.user-meta b { font-size: 13px; font-weight: 500; }
.user-meta span { font-size: 11px; color: var(--text-3); }

.content { flex: 1; overflow-y: auto; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.14s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 900px) {
  .sidebar { width: 64px; }
  .brand-text, .ver { display: none; }
  .crumb { display: none; }
  .vehicle-chip { display: none; }
}
</style>
