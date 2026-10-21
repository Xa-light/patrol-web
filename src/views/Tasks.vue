<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import { listTasks, createTask, updateTaskStatus, getTask } from '../api/task'
import { listRoutes } from '../api/route'
import { getMapMeta } from '../api/map'
import { useVehicleStore } from '../stores/vehicle'
import { useAuthStore } from '../stores/auth'
import { fmtDateTime, TASK_STATUS_TEXT, TASK_MODE_TEXT } from '../utils/format'

const vehicle = useVehicleStore()
const auth = useAuthStore()

const rows = ref([])
const routes = ref([])
const loading = ref(true)
const error = ref('')
const statusFilter = ref('')
const busyId = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref(null)

const form = reactive({
  name: '',
  vehicleId: '',
  routeId: '',
  mode: 'IMMEDIATE',
  scheduledAt: '',
})

const rules = {
  vehicleId: [{ required: true, message: '请选择车辆', trigger: 'change' }],
  routeId: [{ required: true, message: '请选择路线', trigger: 'change' }],
  mode: [{ required: true, message: '请选择执行方式', trigger: 'change' }],
}

const canEdit = computed(() => auth.hasRole('ADMIN', 'OPERATOR'))

const routeName = computed(() => {
  const map = {}
  routes.value.forEach((r) => { map[r.routeId] = r.name })
  return map
})

const filtered = computed(() =>
  statusFilter.value ? rows.value.filter((t) => t.status === statusFilter.value) : rows.value
)

const counts = computed(() => {
  const c = { '': rows.value.length }
  rows.value.forEach((t) => { c[t.status] = (c[t.status] || 0) + 1 })
  return c
})

const actionsOf = (status) => ({
  PENDING: ['START', 'TERMINATE'],
  RUNNING: ['PAUSE', 'TERMINATE'],
  PAUSED: ['RESUME', 'TERMINATE'],
  FINISHED: [],
  TERMINATED: [],
}[status] || [])

const ACTION_TEXT = { START: '启动', PAUSE: '暂停', RESUME: '继续', TERMINATE: '终止' }

function statusType(s) {
  return { RUNNING: 'success', PENDING: 'primary', PAUSED: 'warning', FINISHED: 'info', TERMINATED: 'danger' }[s] || 'info'
}
function progressColor(row) {
  // 进度条配色跟随任务状态，避免「已终止」还显示绿色
  if (row.status === 'TERMINATED') return '#c8ced8'
  if (row.status === 'FINISHED') return '#1c9a63'
  if (row.status === 'PAUSED') return '#e6a23c'
  return '#7c3aed'
}

async function load(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const data = await listTasks({}, { silent: true })
    rows.value = data?.items || []
  } catch (e) {
    if (!silent) error.value = e.message || '任务列表加载失败'
  } finally {
    loading.value = false
  }
}

async function loadRoutes() {
  try {
    const data = await listRoutes({ silent: true })
    routes.value = data?.items || []
  } catch (e) {
    /* 静默 */
  }
}

function openCreate() {
  form.name = ''
  form.vehicleId = vehicle.vehicles?.[0]?.vehicleId || ''
  form.routeId = routes.value[0]?.routeId || ''
  form.mode = 'IMMEDIATE'
  form.scheduledAt = ''
  dialogVisible.value = true
  loadMapMeta()
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  if (form.mode === 'SCHEDULED' && !form.scheduledAt) {
    ElMessage.warning('定时任务需要选择执行时间')
    return
  }
  saving.value = true
  try {
    await createTask({
      name: form.name.trim() || null,
      vehicleId: form.vehicleId,
      routeId: form.routeId,
      mode: form.mode,
      scheduledAt: form.mode === 'SCHEDULED' ? form.scheduledAt : null,
      cronExpr: null,
    })
    ElMessage.success('任务已创建')
    dialogVisible.value = false
    load(true)
  } catch (e) {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}

async function act(row, action) {
  if (action === 'TERMINATE') {
    try {
      await ElMessageBox.confirm(`确定终止任务「${row.name}」？`, '终止任务', {
        type: 'warning', confirmButtonText: '终止', cancelButtonText: '取消',
      })
    } catch (e) {
      return
    }
  }
  busyId.value = row.taskId
  try {
    await updateTaskStatus(row.taskId, action)
    ElMessage.success(`已${ACTION_TEXT[action]}`)
    load(true)
  } catch (e) {
    /* 已提示 */
  } finally {
    busyId.value = ''
  }
}

let timer = null
onMounted(() => {
  load()
  loadRoutes()
  if (!vehicle.vehicles.length) vehicle.refresh()
  timer = setInterval(() => load(true), 5000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

/* ---------------- 任务详情 ---------------- */
const detailVisible = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')

async function openDetail(row) {
  detail.value = row
  detailError.value = ''
  detailLoading.value = true
  detailVisible.value = true
  try {
    const data = await getTask(row.taskId)
    if (data) detail.value = { ...row, ...data }
  } catch (e) {
    detailError.value = '任务详情加载失败，当前展示列表数据'
  } finally {
    detailLoading.value = false
  }
}

function vehicleLabel(id) {
  const v = (vehicle.vehicles || []).find((x) => x.vehicleId === id)
  return v ? `${v.name}（${v.code}）` : id || '—'
}

/* ---------------- 新建任务：路线预览小地图 ---------------- */
const mapMeta = ref(null)
const mapError = ref('')

async function loadMapMeta() {
  if (mapMeta.value || mapError.value) return
  try {
    mapMeta.value = await getMapMeta({ silent: true })
  } catch (e) {
    mapError.value = '地图元信息加载失败'
  }
}

const selectedRoute = computed(() =>
  routes.value.find((r) => r.routeId === form.routeId) || null
)

/* 航点 → 地图像素 */
function toPx(m) {
  const meta = mapMeta.value
  return {
    x: (m.x - meta.origin.x) / meta.resolution,
    y: meta.height - (m.y - meta.origin.y) / meta.resolution,
  }
}

const routePreview = computed(() => {
  const meta = mapMeta.value
  const r = selectedRoute.value
  if (!meta || !r?.waypoints?.length) return null

  const pts = r.waypoints.map(toPx)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const pad = Math.max(90, (maxX - minX) * 0.35, (maxY - minY) * 0.35)
  const w = Math.max(maxX - minX + pad * 2, 220)
  const h = Math.max(maxY - minY + pad * 2, 160)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  return {
    viewBox: `${cx - w / 2} ${cy - h / 2} ${w} ${h}`,
    poly: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    closed: pts.length > 2,
    start: pts[0],
    end: pts[pts.length - 1],
    points: pts,
  }
})
</script>

<template>
  <div class="page">
    <div class="filter-bar">
      <span class="fl">任务状态：</span>
      <el-radio-group v-model="statusFilter" size="default">
        <el-radio-button value="">全部 {{ counts[''] || 0 }}</el-radio-button>
        <el-radio-button value="RUNNING">执行中 {{ counts.RUNNING || 0 }}</el-radio-button>
        <el-radio-button value="PENDING">待执行 {{ counts.PENDING || 0 }}</el-radio-button>
        <el-radio-button value="PAUSED">已暂停 {{ counts.PAUSED || 0 }}</el-radio-button>
        <el-radio-button value="FINISHED">已完成 {{ counts.FINISHED || 0 }}</el-radio-button>
      </el-radio-group>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load()">刷新</el-button>
      <el-button v-if="canEdit" type="primary" :icon="'Plus'" @click="openCreate">新建任务</el-button>
    </div>

    <div class="card">
      <StateHint v-if="loading" type="loading" text="加载任务列表…" />
      <StateHint v-else-if="error" type="error" :text="error" @retry="load()" />
      <StateHint v-else-if="!filtered.length" type="empty" :text="statusFilter ? '该状态下暂无任务' : '还没有任务，先创建一个'">
        <el-button v-if="canEdit && !statusFilter" type="primary" size="small" @click="openCreate">新建任务</el-button>
      </StateHint>

      <el-table v-else :data="filtered" style="width: 100%">
        <el-table-column label="任务" min-width="200">
          <template #default="{ row }">
            <div class="task-cell">
              <b>{{ row.name }}</b>
              <span class="sub">{{ row.taskId }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="路线" min-width="150">
          <template #default="{ row }">
            {{ routeName[row.routeId] || row.routeId }}
          </template>
        </el-table-column>
        <el-table-column label="方式" width="110">
          <template #default="{ row }">
            <span class="mode-text">{{ TASK_MODE_TEXT[row.mode] || row.mode }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="light">
              {{ TASK_STATUS_TEXT[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="170">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round(row.progress || 0)"
              :stroke-width="8"
              :color="progressColor(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <span class="mono time">{{ fmtDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="right" class-name="op-cell">
          <template #default="{ row }">
            <el-button text size="small" @click="openDetail(row)">详情</el-button>
            <template v-if="canEdit">
              <el-button
                v-for="a in actionsOf(row.status)"
                :key="a"
                text
                size="small"
                :type="a === 'TERMINATE' ? 'danger' : 'primary'"
                :loading="busyId === row.taskId"
                @click="act(row, a)"
              >
                {{ ACTION_TEXT[a] }}
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新建任务" width="880px" top="6vh" destroy-on-close>
      <div class="create-grid">
        <!-- 左：表单 -->
        <div class="create-form">
          <div class="form-sec">
            <el-icon><InfoFilled /></el-icon><span>基础信息</span>
          </div>
          <el-form ref="formRef" :model="form" :rules="rules" label-width="82px">
            <el-form-item label="任务名称">
              <el-input v-model="form.name" maxlength="50" placeholder="留空则自动按路线命名" />
            </el-form-item>
            <el-form-item label="执行车辆" prop="vehicleId">
              <el-select v-model="form.vehicleId" placeholder="选择车辆" style="width: 100%">
                <el-option
                  v-for="v in vehicle.vehicles"
                  :key="v.vehicleId"
                  :label="`${v.name}（${v.code}）· ${v.online ? '在线' : '离线'}`"
                  :value="v.vehicleId"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="执行路线" prop="routeId">
              <el-select v-model="form.routeId" placeholder="选择路线" style="width: 100%">
                <el-option
                  v-for="r in routes"
                  :key="r.routeId"
                  :label="`${r.name}（${r.waypointCount ?? r.waypoints?.length ?? 0} 个航点）`"
                  :value="r.routeId"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="执行方式" prop="mode">
              <el-radio-group v-model="form.mode">
                <el-radio value="IMMEDIATE">立即执行</el-radio>
                <el-radio value="SCHEDULED">定时执行</el-radio>
                <el-radio value="RECURRING">周期执行</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="form.mode === 'SCHEDULED'" label="执行时间">
              <el-date-picker
                v-model="form.scheduledAt"
                type="datetime"
                placeholder="选择执行时间"
                value-format="YYYY-MM-DDTHH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- 右：路线预览 -->
        <div class="create-map">
          <div class="form-sec">
            <el-icon><Location /></el-icon><span>路径预览</span>
            <span class="sec-sub">{{ selectedRoute?.area || '—' }}</span>
          </div>

          <div class="pv-box">
            <svg v-if="routePreview && mapMeta" class="pv-svg" :viewBox="routePreview.viewBox" preserveAspectRatio="xMidYMid meet">
              <image :href="mapMeta.imageUrl" x="0" y="0" :width="mapMeta.width" :height="mapMeta.height" />
              <polygon
                v-if="routePreview.closed"
                :points="routePreview.poly"
                fill="rgba(124,58,237,0.14)"
                stroke="#7c3aed"
                stroke-width="3"
                stroke-dasharray="9 5"
              />
              <polyline
                v-else
                :points="routePreview.poly"
                fill="none"
                stroke="#7c3aed"
                stroke-width="3"
                stroke-dasharray="9 5"
              />
              <circle
                v-for="(p, i) in routePreview.points"
                :key="i"
                :cx="p.x"
                :cy="p.y"
                r="7"
                fill="#fff"
                stroke="#7c3aed"
                stroke-width="3"
              />
              <circle :cx="routePreview.start.x" :cy="routePreview.start.y" r="12" fill="#16a34a" opacity="0.9" />
              <circle :cx="routePreview.end.x" :cy="routePreview.end.y" r="12" fill="#dc2626" opacity="0.9" />
            </svg>

            <div v-else-if="mapError" class="pv-empty">{{ mapError }}</div>
            <div v-else class="pv-empty">选择路线后显示路径</div>

            <div class="pv-legend">
              <span><i class="lg-start" />起点</span>
              <span><i class="lg-end" />终点</span>
              <span><i class="lg-path" />规划路径</span>
            </div>
          </div>

          <div v-if="selectedRoute" class="pv-info">
            <div class="pv-name">{{ selectedRoute.name }}</div>
            <div class="pv-desc">{{ selectedRoute.description || '—' }}</div>
            <div class="pv-meta">
              <span>{{ selectedRoute.waypointCount ?? selectedRoute.waypoints?.length ?? 0 }} 个航点</span>
              <span v-if="selectedRoute.waypoints?.[0]">
                起点 {{ Number(selectedRoute.waypoints[0].x).toFixed(2) }},
                {{ Number(selectedRoute.waypoints[0].y).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">创建任务</el-button>
      </template>
    </el-dialog>

    <!-- 任务详情 -->
    <el-drawer v-model="detailVisible" size="470px" :with-header="false">
      <div v-if="detail" class="dr-body">
        <div class="dr-head">
          <div>
            <b class="dr-name">{{ detail.name }}</b>
            <span class="mono dr-id">{{ detail.taskId }}</span>
          </div>
          <el-tag size="small" :type="statusType(detail.status)" effect="light">
            {{ TASK_STATUS_TEXT[detail.status] || detail.status }}
          </el-tag>
          <button class="dr-close" @click="detailVisible = false">×</button>
        </div>

        <div v-if="detailError" class="dr-warn">{{ detailError }}</div>

        <div class="sec-title">执行进度</div>
        <el-progress
          :percentage="Math.round(detail.progress || 0)"
          :stroke-width="10"
          :color="progressColor(detail)"
        />

        <div class="sec-title">任务信息</div>
        <div class="info-panel">
          <div class="row"><span class="k">执行车辆</span><span class="v">{{ vehicleLabel(detail.vehicleId) }}</span></div>
          <div class="row"><span class="k">执行路线</span><span class="v">{{ routeName[detail.routeId] || detail.routeId || '—' }}</span></div>
          <div class="row"><span class="k">执行方式</span><span class="v">{{ TASK_MODE_TEXT[detail.mode] || detail.mode }}</span></div>
          <div class="row"><span class="k">计划时间</span><span class="v">{{ detail.scheduledAt ? fmtDateTime(detail.scheduledAt) : '立即执行' }}</span></div>
          <div class="row"><span class="k">创建时间</span><span class="v">{{ fmtDateTime(detail.createdAt) }}</span></div>
          <div class="row"><span class="k">开始时间</span><span class="v">{{ detail.startedAt ? fmtDateTime(detail.startedAt) : '—' }}</span></div>
          <div class="row"><span class="k">结束时间</span><span class="v">{{ detail.finishedAt ? fmtDateTime(detail.finishedAt) : '—' }}</span></div>
        </div>

        <div v-if="detail.waypoints?.length" class="sec-title">航点（{{ detail.waypoints.length }}）</div>
        <ul v-if="detail.waypoints?.length" class="wp-list">
          <li v-for="(p, i) in detail.waypoints" :key="i">
            <span class="wp-idx">{{ i + 1 }}</span>
            <span class="mono">{{ Number(p.x).toFixed(2) }}, {{ Number(p.y).toFixed(2) }}</span>
            <span class="muted">{{ p.name || '' }}</span>
          </li>
        </ul>

        <div v-if="canEdit && actionsOf(detail.status).length" class="dr-actions">
          <el-button
            v-for="a in actionsOf(detail.status)"
            :key="a"
            :type="a === 'TERMINATE' ? 'danger' : 'primary'"
            :plain="a !== 'START'"
            :loading="busyId === detail.taskId"
            @click="act(detail, a)"
          >
            {{ ACTION_TEXT[a] }}
          </el-button>
        </div>

        <StateHint v-if="detailLoading" type="loading" text="同步任务详情…" compact />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.task-cell { display: flex; flex-direction: column; gap: 2px; }
.task-cell b { font-weight: 500; }
.task-cell .sub { font-size: 11px; color: var(--text-3); font-family: ui-monospace, Consolas, monospace; }
.mode-text { font-size: 12px; color: var(--text-2); }
.time { font-size: 12px; color: var(--text-3); }
:deep(.op-cell .cell) { white-space: nowrap; }
:deep(.op-cell .el-button) { margin-left: 6px; }
:deep(.op-cell .el-button:first-child) { margin-left: 0; }

/* ---------- 详情抽屉 ---------- */
.dr-body { padding: 4px 4px 20px; }
.dr-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px; }
.dr-head > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dr-name { font-size: 15px; font-weight: 600; }
.dr-id { font-size: 11px; color: var(--text-3); }
.dr-close {
  margin-left: auto;
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: var(--text-3);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.dr-close:hover { background: var(--brand-weak); color: var(--brand); }
.dr-warn {
  font-size: 12px;
  color: var(--warn);
  background: var(--warn-weak);
  border-radius: 7px;
  padding: 8px 10px;
  margin: 8px 0 0;
}
.sec-title {
  font-size: 13px;
  font-weight: 600;
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
.wp-list { list-style: none; margin: 0; padding: 0; }
.wp-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  font-size: 12.5px;
  border-bottom: 1px dashed var(--border);
}
.wp-idx {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand-weak);
  color: var(--brand);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.dr-actions { display: flex; gap: 8px; margin-top: 20px; }

/* ---------- 新建任务：两栏 + 路径预览 ---------- */
.create-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 22px;
}
.create-form { min-width: 0; }
.form-sec {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.form-sec .el-icon { color: var(--brand); font-size: 14px; }
.form-sec .sec-sub { margin-left: auto; font-size: 11.5px; font-weight: 400; color: var(--text-3); }

.pv-box {
  position: relative;
  height: 250px;
  border-radius: 10px;
  border: 1px solid var(--brand-line);
  background: #efeaf8;
  overflow: hidden;
}
.pv-svg { display: block; width: 100%; height: 100%; }
.pv-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  color: var(--text-3);
}
.pv-legend {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  gap: 10px;
  padding: 4px 9px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  font-size: 10.5px;
  color: var(--text-2);
}
.pv-legend span { display: flex; align-items: center; gap: 4px; }
.pv-legend i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pv-legend .lg-start { background: #16a34a; }
.pv-legend .lg-end { background: #dc2626; }
.pv-legend .lg-path {
  width: 12px;
  height: 0;
  border-radius: 0;
  border-top: 2px dashed #7c3aed;
}

.pv-info {
  margin-top: 12px;
  padding: 11px 13px;
  border-radius: 9px;
  background: #faf7fe;
  border: 1px solid var(--brand-line);
}
.pv-name { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
.pv-desc { font-size: 11.5px; color: var(--text-3); line-height: 1.6; }
.pv-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-2);
}
</style>
