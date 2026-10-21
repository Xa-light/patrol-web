<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
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
const viewKey = ref(0)

const allMenus = [
  { path: '/dashboard', title: '运行总览', icon: 'Odometer' },
  { path: '/map', title: 'SLAM 建图', icon: 'MapLocation' },
  { path: '/control', title: '实时控制', icon: 'Aim', roles: ['ADMIN', 'OPERATOR'] },
  { path: '/vehicles', title: '车辆管理', icon: 'Van', roles: ['ADMIN', 'OPERATOR'] },
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

/* ---------- 多标签页（仿视频里的页签条） ---------- */
const tabs = ref([])

function syncTab() {
  if (!route.meta.title || route.path === '/login') return
  const exist = tabs.value.find((t) => t.path === route.path)
  if (!exist) {
    tabs.value.push({ path: route.path, title: route.meta.title })
    if (tabs.value.length > 8) tabs.value.shift()
  }
}
watch(() => route.path, syncTab, { immediate: true })

function closeTab(tab) {
  const i = tabs.value.findIndex((t) => t.path === tab.path)
  if (i < 0) return
  tabs.value.splice(i, 1)
  if (tab.path === route.path) {
    const next = tabs.value[i] || tabs.value[i - 1]
    router.push(next ? next.path : '/dashboard')
  }
}

/* ---------- 刷新当前页 ---------- */
function refreshView() {
  viewKey.value += 1
}

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
  tabs.value = []
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
        <div class="brand-mark">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <rect x="7" y="9" width="18" height="14" rx="5" fill="none" stroke="#fff" stroke-width="2" />
            <circle cx="13" cy="15" r="1.8" fill="#fff" />
            <circle cx="19" cy="15" r="1.8" fill="#fff" />
            <path d="M13 19.5h6" stroke="#fff" stroke-width="2" stroke-linecap="round" />
            <path d="M16 9V6" stroke="#fff" stroke-width="2" stroke-linecap="round" />
            <circle cx="16" cy="5" r="1.6" fill="#fff" />
          </svg>
        </div>
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

      <div v-show="!collapsed" class="side-user">
        <div class="su-avatar">{{ (auth.displayName || 'U').slice(0, 1) }}</div>
        <div class="su-meta">
          <b>{{ auth.displayName }}</b>
          <span>{{ auth.roleText }}</span>
        </div>
        <button class="su-out" title="退出登录" @click="onLogout">
          <el-icon><SwitchButton /></el-icon>
        </button>
      </div>

      <div class="sidebar-foot">
        <span v-show="!collapsed" class="ver">阶段 4 · 前后端联调</span>
        <button class="fold" @click="collapsed = !collapsed">
          <el-icon><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon>
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-btn" title="折叠菜单" @click="collapsed = !collapsed">
            <el-icon><Operation /></el-icon>
          </button>
          <button class="icon-btn" title="刷新当前页" @click="refreshView">
            <el-icon><Refresh /></el-icon>
          </button>

          <div class="tabs">
            <div
              v-for="t in tabs"
              :key="t.path"
              class="tab"
              :class="{ active: t.path === route.path }"
              @click="router.push(t.path)"
            >
              <span>{{ t.title }}</span>
              <i class="tab-x" @click.stop="closeTab(t)">×</i>
            </div>
          </div>
        </div>

        <div class="topbar-right">
          <div class="vehicle-chip" :title="`车辆 ${vehicle.sn}`">
            <span class="dot" :class="vehicle.online ? 'on' : 'off'" />
            <b>{{ vehicle.sn }}</b>
            <span class="sep" />
            <span>{{ vehicle.mode }}</span>
            <span class="sep" />
            <span>{{ batteryText }}</span>
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
            <component :is="Component" :key="route.path + '-' + viewKey" />
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

/* ---------- 侧边栏：深紫渐变 ---------- */
.sidebar {
  width: var(--sidebar-w);
  flex: none;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #3a0a5c 0%, #4c1279 45%, #5d1a92 100%);
  box-shadow: 2px 0 14px rgba(58, 10, 92, 0.18);
  transition: width 0.18s ease;
  position: relative;
  z-index: 10;
}
.collapsed .sidebar { width: 66px; }

.brand {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  flex: none;
}
.brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.brand-text { display: flex; flex-direction: column; line-height: 1.3; overflow: hidden; }
.brand-text b {
  font-size: 13.5px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.4px;
  white-space: nowrap;
}
.brand-text span { font-size: 11px; color: rgba(255, 255, 255, 0.62); white-space: nowrap; }

.menu {
  border-right: none;
  padding: 8px 10px;
  flex: 1;
  overflow-y: auto;
  background: transparent;
}
.menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  border-radius: 8px;
  margin-bottom: 4px;
  color: rgba(255, 255, 255, 0.78);
  background: transparent;
}
.menu :deep(.el-menu-item .el-icon) { color: rgba(255, 255, 255, 0.7); }
.menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.10);
  color: #fff;
}
.menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(167, 108, 246, 0.55), rgba(140, 82, 224, 0.38));
  color: #fff;
  font-weight: 500;
  box-shadow: inset 3px 0 0 #d8b4fe;
}
.menu :deep(.el-menu-item.is-active .el-icon) { color: #fff; }
.menu-text { flex: 1; }
.menu-badge { margin-left: auto; }
.menu-badge :deep(.el-badge__content) { font-size: 10px; }

.side-user {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 4px 12px 8px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.10);
}
.su-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f0abfc, #c084fc);
  color: #3a0a5c;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.su-meta { display: flex; flex-direction: column; line-height: 1.3; overflow: hidden; }
.su-meta b { font-size: 12.5px; color: #fff; font-weight: 500; white-space: nowrap; }
.su-meta span { font-size: 11px; color: rgba(255, 255, 255, 0.55); white-space: nowrap; }
.su-out {
  margin-left: auto;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.su-out:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }

.sidebar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 12px;
  flex: none;
}
.ver { font-size: 10.5px; color: rgba(255, 255, 255, 0.42); white-space: nowrap; }
.fold {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 6px;
}
.fold:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }

/* ---------- 顶栏 ---------- */
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.topbar {
  height: 56px;
  flex: none;
  background: #fff;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 12px;
  gap: 16px;
}
.topbar-left { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }

.icon-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: 7px;
  color: var(--text-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.icon-btn:hover { background: var(--brand-weak); color: var(--brand); }

.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  overflow: hidden;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 15px;
  font-size: 12.5px;
  color: var(--text-2);
  background: #f7f4fc;
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.tab:hover { background: var(--brand-weak); }
.tab.active {
  background: linear-gradient(90deg, #6d28d9, #8b5cf6);
  color: #fff;
  box-shadow: 0 2px 8px rgba(109, 40, 217, 0.28);
}
.tab-x {
  font-style: normal;
  font-size: 13px;
  line-height: 1;
  opacity: 0.55;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tab-x:hover { background: rgba(0, 0, 0, 0.12); opacity: 1; }
.tab.active .tab-x:hover { background: rgba(255, 255, 255, 0.25); }

.topbar-right { display: flex; align-items: center; gap: 12px; flex: none; }

.vehicle-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 5px 12px;
  background: #faf7fe;
  border: 1px solid var(--brand-line);
  border-radius: 16px;
  white-space: nowrap;
  color: var(--text-2);
}
.vehicle-chip b { font-weight: 600; font-size: 12px; color: var(--text); }
.vehicle-chip .sep { width: 1px; height: 11px; background: var(--border-strong); }

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
  outline: none;
}
.user-chip:hover { background: var(--brand-weak); }
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c084fc, #7c3aed);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}
.user-meta { display: flex; flex-direction: column; line-height: 1.25; }
.user-meta b { font-size: 13px; font-weight: 500; }
.user-meta span { font-size: 11px; color: var(--text-3); }

.content { flex: 1; overflow-y: auto; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.14s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 1100px) {
  .tabs { display: none; }
}
@media (max-width: 900px) {
  .sidebar { width: 66px; }
  .brand-text, .ver, .side-user { display: none; }
  .vehicle-chip { display: none; }
}
</style>
