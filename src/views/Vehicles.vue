<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getLatestTelemetry,
  sendVehicleCommand,
} from '../api/vehicle'
import { useAuthStore } from '../stores/auth'
import { fmtNum, fmtDateTime } from '../utils/format'

const auth = useAuthStore()
const canWrite = computed(() => auth.hasRole('ADMIN'))

const rows = ref([])
const loading = ref(true)
const error = ref('')

/* ---------------- 筛选 ---------------- */
const filter = reactive({ status: '', kw: '' })

const shown = computed(() =>
  rows.value.filter((r) => {
    if (filter.status === 'online' && !r.online) return false
    if (filter.status === 'offline' && r.online) return false
    if (filter.kw) {
      const k = filter.kw.trim().toLowerCase()
      const hay = `${r.code || ''} ${r.name || ''} ${r.model || ''} ${r.vehicleId || ''}`.toLowerCase()
      if (!hay.includes(k)) return false
    }
    return true
  })
)

const onlineCount = computed(() => rows.value.filter((r) => r.online).length)

/* ---------------- 列表加载 + 轮询 ---------------- */
async function load(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const data = await listVehicles({ silent: true })
    rows.value = data?.items || []
  } catch (e) {
    if (!silent) error.value = e.message || '车辆列表加载失败'
  } finally {
    loading.value = false
  }
}

let timer = null
onMounted(() => {
  load()
  timer = setInterval(() => load(true), 5000)
})
onBeforeUnmount(() => clearInterval(timer))

/* ---------------- 新增 / 编辑 ---------------- */
const dialogVisible = ref(false)
const dialogMode = ref('create')
const saving = ref(false)
const formRef = ref(null)
const current = ref(null)

const form = reactive({ code: '', name: '', model: 'SCOUT MINI' })

const rules = computed(() => ({
  code:
    dialogMode.value === 'create'
      ? [
          { required: true, message: '请输入车辆编号', trigger: 'blur' },
          { min: 2, max: 32, message: '编号 2-32 位', trigger: 'blur' },
          { pattern: /^[A-Za-z0-9_-]+$/, message: '仅支持字母、数字、下划线、短横线', trigger: 'blur' },
        ]
      : [],
  name: [{ required: true, message: '请输入车辆名称', trigger: 'blur' }],
}))

const dialogTitle = computed(() => (dialogMode.value === 'create' ? '新增车辆' : '编辑车辆'))

function openCreate() {
  dialogMode.value = 'create'
  current.value = null
  form.code = ''
  form.name = ''
  form.model = 'SCOUT MINI'
  dialogVisible.value = true
}

function openEdit(row) {
  dialogMode.value = 'edit'
  current.value = row
  form.code = row.code
  form.name = row.name
  form.model = row.model || 'SCOUT MINI'
  dialogVisible.value = true
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      await createVehicle({
        code: form.code.trim(),
        name: form.name.trim(),
        model: form.model.trim() || 'SCOUT MINI',
      })
      ElMessage.success('车辆已注册')
    } else {
      await updateVehicle(current.value.vehicleId, {
        name: form.name.trim(),
        model: form.model.trim() || 'SCOUT MINI',
      })
      ElMessage.success('车辆信息已更新')
    }
    dialogVisible.value = false
    load()
  } catch (e) {
    /* request 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `删除后该车辆将不再出现在列表与任务选择中，确定删除「${row.name}（${row.code}）」？`,
      '删除车辆',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  try {
    await deleteVehicle(row.vehicleId)
    ElMessage.success('已删除')
    if (detail.value?.vehicleId === row.vehicleId) drawer.value = false
    load()
  } catch (e) {
    /* 已提示 */
  }
}

/* ---------------- 详情抽屉 ---------------- */
const drawer = ref(false)
const detail = ref(null)
const telemetry = ref(null)
const telemError = ref('')
const cmdBusy = ref('')

async function openDetail(row) {
  detail.value = row
  telemetry.value = null
  telemError.value = ''
  drawer.value = true
  await loadTelemetry()
}

async function loadTelemetry() {
  if (!detail.value) return
  try {
    telemetry.value = await getLatestTelemetry(detail.value.vehicleId, { silent: true })
    telemError.value = ''
  } catch (e) {
    telemetry.value = null
    telemError.value = e?.response?.status === 404 ? '暂无遥测数据（车辆未上报）' : '遥测获取失败'
  }
}

/* 抽屉打开时按 2s 刷新遥测 */
let telemTimer = null
watch(drawer, (v) => {
  clearInterval(telemTimer)
  if (v) telemTimer = setInterval(loadTelemetry, 2000)
})
onBeforeUnmount(() => clearInterval(telemTimer))

/* ---------------- 下发控制指令 ---------------- */
const MOVES = [
  { key: 'forward', label: '前进', linear: 0.25, angular: 0, icon: 'Top' },
  { key: 'back', label: '后退', linear: -0.15, angular: 0, icon: 'Bottom' },
  { key: 'left', label: '左转', linear: 0, angular: 0.5, icon: 'Back' },
  { key: 'right', label: '右转', linear: 0, angular: -0.35, icon: 'Right' },
]

async function sendMove(m) {
  if (!detail.value) return
  cmdBusy.value = m.key
  try {
    await sendVehicleCommand(detail.value.vehicleId, {
      action: 'MOTION',
      linear: m.linear,
      angular: m.angular,
    })
    ElMessage.success(`已下发「${m.label}」`)
  } catch (e) {
    /* 已提示 */
  } finally {
    cmdBusy.value = ''
  }
}

async function sendStop() {
  if (!detail.value) return
  cmdBusy.value = 'stop'
  try {
    await sendVehicleCommand(detail.value.vehicleId, {
      action: 'MOTION',
      linear: 0,
      angular: 0,
    })
    ElMessage.success('已下发停止')
  } catch (e) {
    /* 已提示 */
  } finally {
    cmdBusy.value = ''
  }
}

async function sendEstop() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      '紧急停止会立即切断车辆运动输出，需在现场确认安全后解除。确定下发？',
      '紧急停止',
      { type: 'warning', confirmButtonText: '立即停止', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  cmdBusy.value = 'estop'
  try {
    await sendVehicleCommand(detail.value.vehicleId, { action: 'EMERGENCY_STOP' })
    ElMessage.warning('紧急停止已下发')
  } catch (e) {
    /* 已提示 */
  } finally {
    cmdBusy.value = ''
  }
}

/* ---------------- 展示辅助 ---------------- */
function statusText(row) {
  if (!row.online) return '离线'
  if (row.mode === 'patrol') return '巡逻中'
  if (row.mode === 'manual') return '遥控中'
  return '在线空闲'
}

function statusClass(row) {
  if (!row.online) return 'off'
  if (row.mode === 'patrol') return 'run'
  if (row.mode === 'manual') return 'manual'
  return 'idle'
}

function batteryClass(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  if (n < 21) return 'low'
  if (n < 22.5) return 'mid'
  return ''
}

function batteryPct(v) {
  /* SCOUT MINI 电池 24V 标称：22.0–25.2V 映射 0–100% */
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(((n - 22.0) / (25.2 - 22.0)) * 100)))
}

function posText(row) {
  const p = row.position
  if (!p || p.x == null) return '—'
  return `${fmtNum(p.x, 2)}, ${fmtNum(p.y, 2)}`
}

function lastSeenText(row) {
  if (row.lastSeenAgo == null) return '—'
  const s = row.lastSeenAgo
  if (s < 60) return `${Math.round(s)} 秒前`
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  return `${Math.floor(s / 3600)} 小时前`
}
</script>

<template>
  <div class="page">
    <!-- 筛选条 -->
    <div class="filter-bar">
      <span class="fl">车辆状态：</span>
      <el-select v-model="filter.status" placeholder="全部" style="width: 132px" clearable>
        <el-option label="全部" value="" />
        <el-option label="在线" value="online" />
        <el-option label="离线" value="offline" />
      </el-select>

      <span class="fl kw">车辆编号：</span>
      <el-input
        v-model="filter.kw"
        placeholder="scout01 / 名称关键字"
        clearable
        style="width: 220px"
        :prefix-icon="'Search'"
      />

      <span class="stat">
        共 <b>{{ rows.length }}</b> 台 · 在线 <b class="ok">{{ onlineCount }}</b> 台
      </span>

      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load()">刷新</el-button>
      <el-button v-if="canWrite" type="primary" :icon="'Plus'" @click="openCreate">新增车辆</el-button>
    </div>

    <!-- 列表 -->
    <div class="card">
      <StateHint v-if="loading" type="loading" text="加载车辆列表…" />
      <StateHint v-else-if="error" type="error" :text="error" @retry="load()" />
      <StateHint v-else-if="!shown.length" type="empty" text="没有符合条件的车辆" />

      <el-table v-else :data="shown" style="width: 100%" row-key="vehicleId">
        <el-table-column label="车辆编号" min-width="160">
          <template #default="{ row }">
            <div class="code-cell">
              <span class="dot" :class="row.online ? 'on' : 'off'" />
              <b class="mono">{{ row.code }}</b>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="名称" min-width="150">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>

        <el-table-column prop="model" label="型号" min-width="130" />

        <el-table-column label="当前位置" min-width="150">
          <template #default="{ row }">
            <span class="mono muted">{{ posText(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="电量" width="150">
          <template #default="{ row }">
            <div class="bat" :class="batteryClass(row.battery)">
              <div class="bat-bar"><i :style="{ width: batteryPct(row.battery) + '%' }" /></div>
              <span class="bat-val">{{ row.battery != null ? fmtNum(row.battery, 2) + ' V' : '—' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="当前状态" width="118">
          <template #default="{ row }">
            <span class="st" :class="statusClass(row)">{{ statusText(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="最后心跳" width="110">
          <template #default="{ row }">
            <span class="muted small">{{ lastSeenText(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" align="right" class-name="op-cell">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="canWrite" text size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canWrite" text type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="470px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="86px">
        <el-form-item label="车辆编号" prop="code">
          <el-input
            v-model="form.code"
            :disabled="dialogMode === 'edit'"
            placeholder="如 scout01，需与车端 SN 一致"
            maxlength="32"
          />
        </el-form-item>
        <el-form-item label="车辆名称" prop="name">
          <el-input v-model="form.name" placeholder="如 园区巡逻车 1 号" maxlength="50" />
        </el-form-item>
        <el-form-item label="车辆型号">
          <el-input v-model="form.model" maxlength="50" />
        </el-form-item>
      </el-form>

      <div class="hint">
        <b>提示：</b>「车辆编号」即车端 MQTT 上报用的 SN，注册后由车端 <code>mqtt_bridge.py</code>
        以 <code>scout/&lt;编号&gt;/telemetry</code> 上报心跳，编号不一致会一直显示离线。
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawer" size="520px" :with-header="false" class="veh-drawer">
      <div v-if="detail" class="drawer-body">
        <div class="dr-head">
          <div class="dr-avatar">
            <svg viewBox="0 0 32 32" width="22" height="22">
              <rect x="7" y="9" width="18" height="14" rx="5" fill="none" stroke="currentColor" stroke-width="2" />
              <circle cx="13" cy="15" r="1.8" fill="currentColor" />
              <circle cx="19" cy="15" r="1.8" fill="currentColor" />
              <path d="M13 19.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <div class="dr-title">
            <b>{{ detail.name }}</b>
            <span class="mono">{{ detail.code }}</span>
          </div>
          <span class="st" :class="statusClass(detail)">{{ statusText(detail) }}</span>
          <button class="dr-close" @click="drawer = false">×</button>
        </div>

        <!-- 状态卡 -->
        <div class="sec-title">机器人状态</div>
        <div class="stat-grid">
          <div class="stat-box">
            <span class="k">电量</span>
            <div class="bat big" :class="batteryClass(detail.battery)">
              <div class="bat-bar"><i :style="{ width: batteryPct(detail.battery) + '%' }" /></div>
              <span class="bat-val">{{ detail.battery != null ? fmtNum(detail.battery, 2) + ' V' : '—' }}</span>
            </div>
          </div>
          <div class="stat-box">
            <span class="k">速度</span>
            <b class="v">{{ telemetry?.v != null ? fmtNum(telemetry.v, 2) + ' m/s' : '—' }}</b>
          </div>
          <div class="stat-box">
            <span class="k">位置 X / Y</span>
            <b class="v mono">{{ posText(detail) }}</b>
          </div>
          <div class="stat-box">
            <span class="k">朝向 yaw</span>
            <b class="v">{{ telemetry?.yaw != null ? fmtNum(telemetry.yaw, 2) + ' rad' : '—' }}</b>
          </div>
          <div class="stat-box">
            <span class="k">运行模式</span>
            <b class="v">{{ detail.mode || '—' }}</b>
          </div>
          <div class="stat-box">
            <span class="k">控制来源</span>
            <b class="v">{{ detail.control_mode || telemetry?.control_mode || '—' }}</b>
          </div>
        </div>

        <div class="meta-line">
          <span>型号 {{ detail.model || '—' }}</span>
          <span class="sep" />
          <span>ID {{ detail.vehicleId }}</span>
          <span class="sep" />
          <span>心跳 {{ lastSeenText(detail) }}</span>
        </div>

        <!-- 手动控制台 -->
        <div class="sec-title">手动控制台</div>
        <div class="pad">
          <div class="pad-grid">
            <button
              class="pad-btn up"
              :disabled="!!cmdBusy"
              @click="sendMove(MOVES[0])"
            >
              <el-icon><Top /></el-icon><span>前进</span>
            </button>
            <button class="pad-btn left" :disabled="!!cmdBusy" @click="sendMove(MOVES[2])">
              <el-icon><Back /></el-icon><span>左转</span>
            </button>
            <button class="pad-btn stop" :disabled="!!cmdBusy" @click="sendStop">
              <el-icon><VideoPause /></el-icon><span>停止</span>
            </button>
            <button class="pad-btn right" :disabled="!!cmdBusy" @click="sendMove(MOVES[3])">
              <span>右转</span><el-icon><Right /></el-icon>
            </button>
            <button class="pad-btn down" :disabled="!!cmdBusy" @click="sendMove(MOVES[1])">
              <el-icon><Bottom /></el-icon><span>后退</span>
            </button>
          </div>
        </div>

        <div class="cmd-row">
          <el-button type="danger" plain :icon="'CircleClose'" :loading="cmdBusy === 'estop'" @click="sendEstop">
            紧急停止
          </el-button>
          <el-button :icon="'Refresh'" @click="loadTelemetry">刷新遥测</el-button>
        </div>

        <div class="tip">
          指令通过 <code>scout/{{ detail.code }}/cmd/control</code> 下发，有效期 800&nbsp;ms；
          松开即停，请勿在人员密集处高速遥控。
        </div>

        <!-- 遥测原始数据 -->
        <div class="sec-title">最新遥测</div>
        <StateHint v-if="telemError" type="empty" :text="telemError" compact />
        <pre v-else-if="telemetry" class="raw">{{ JSON.stringify(telemetry, null, 2) }}</pre>
        <StateHint v-else type="loading" text="读取遥测…" compact />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.stat { font-size: 12.5px; color: var(--text-2); margin-left: 4px; }
.stat b { color: var(--text); font-weight: 600; }
.stat b.ok { color: var(--ok); }
.filter-bar .kw { margin-left: 6px; }

.code-cell { display: flex; align-items: center; gap: 8px; }
.code-cell b { font-size: 13px; font-weight: 600; }

.bat { display: flex; align-items: center; gap: 8px; }
.bat-bar {
  width: 62px;
  height: 6px;
  border-radius: 3px;
  background: #ece7f6;
  overflow: hidden;
  flex: none;
}
.bat-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #34d399, #16a34a);
  transition: width 0.3s ease;
}
.bat.mid .bat-bar i { background: linear-gradient(90deg, #fbbf24, #d97706); }
.bat.low .bat-bar i { background: linear-gradient(90deg, #f87171, #dc2626); }
.bat-val { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.bat.big .bat-bar { width: 100%; height: 8px; }
.bat.big { flex-direction: column; align-items: flex-start; gap: 6px; }

.st { font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px; color: var(--text-3); }
.st::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.st.idle { color: var(--ok); }
.st.run { color: var(--brand); }
.st.manual { color: var(--warn); }
.st.off { color: var(--text-3); }

.small { font-size: 12px; }
:deep(.op-cell .cell) { white-space: nowrap; }
:deep(.op-cell .el-button) { margin-left: 6px; }
:deep(.op-cell .el-button:first-child) { margin-left: 0; }

.hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
  background: #faf7fe;
  border: 1px solid var(--brand-line);
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.7;
}
.hint code, .tip code {
  font-family: ui-monospace, Consolas, monospace;
  background: #f1e9fc;
  color: var(--brand-dark);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 11.5px;
}

/* ---------- 抽屉 ---------- */
.drawer-body { padding: 4px 4px 20px; }
.dr-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.dr-avatar {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--brand-weak);
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.dr-title { display: flex; flex-direction: column; line-height: 1.4; min-width: 0; }
.dr-title b { font-size: 15px; font-weight: 600; }
.dr-title span { font-size: 11.5px; color: var(--text-3); }
.dr-head .st { margin-left: auto; }
.dr-close {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: var(--text-3);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.dr-close:hover { background: var(--brand-weak); color: var(--brand); }

.sec-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 18px 0 10px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.sec-title::before {
  content: "";
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: linear-gradient(180deg, #8b5cf6, #6d28d9);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.stat-box {
  background: #faf7fe;
  border: 1px solid var(--brand-line);
  border-radius: 9px;
  padding: 9px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-box .k { font-size: 11.5px; color: var(--text-3); }
.stat-box .v { font-size: 13px; font-weight: 600; color: var(--text); }

.meta-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--text-3);
}
.meta-line .sep { width: 1px; height: 10px; background: var(--border-strong); }

/* 方向盘 */
.pad { display: flex; justify-content: center; padding: 6px 0 2px; }
.pad-grid {
  display: grid;
  grid-template-columns: 92px 92px 92px;
  grid-template-rows: 62px 62px 62px;
  gap: 8px;
  grid-template-areas:
    ". up ."
    "left stop right"
    ". down .";
}
.pad-btn {
  border: 1px solid var(--brand-line);
  background: #fff;
  color: var(--brand-deep);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.14s ease;
  user-select: none;
}
.pad-btn .el-icon { font-size: 16px; }
.pad-btn:hover:not(:disabled) {
  background: var(--brand-weak);
  border-color: #c9aef5;
  transform: translateY(-1px);
}
.pad-btn:active:not(:disabled) { transform: translateY(0); background: #e9dbfc; }
.pad-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pad-btn.up { grid-area: up; }
.pad-btn.down { grid-area: down; }
.pad-btn.left { grid-area: left; }
.pad-btn.right { grid-area: right; }
.pad-btn.stop {
  grid-area: stop;
  background: #fdf3e3;
  border-color: #f3d9a8;
  color: #b45309;
}
.pad-btn.stop:hover:not(:disabled) { background: #fbe9cd; border-color: #eabf78; }

.cmd-row { display: flex; gap: 8px; margin-top: 14px; }

.tip {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.7;
  background: #fafbfd;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 11px;
}

.raw {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.6;
  background: #faf8fe;
  border: 1px solid var(--brand-line);
  border-radius: 9px;
  padding: 10px 12px;
  color: var(--text-2);
}
</style>
