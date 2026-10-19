<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import { listTasks, createTask, updateTaskStatus } from '../api/task'
import { listRoutes } from '../api/route'
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
  return '#2b6cf6'
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
</script>

<template>
  <div class="page">
    <div class="page-toolbar">
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
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
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
              <span v-if="!actionsOf(row.status).length" class="muted">—</span>
            </template>
            <span v-else class="muted">只读</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新建任务" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
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

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">创建任务</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.task-cell { display: flex; flex-direction: column; gap: 2px; }
.task-cell b { font-weight: 500; }
.task-cell .sub { font-size: 11px; color: var(--text-3); font-family: ui-monospace, Consolas, monospace; }
.mode-text { font-size: 12px; color: var(--text-2); }
.time { font-size: 12px; color: var(--text-3); }
</style>
