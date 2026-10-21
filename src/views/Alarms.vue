<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import MetricCard from '../components/MetricCard.vue'
import { listAlarms, handleAlarm, createAlarm } from '../api/alarm'
import { listVehicles } from '../api/vehicle'
import { useAuthStore } from '../stores/auth'
import { useAlarmStore } from '../stores/alarm'
import { fmtDateTime, ALARM_TYPE_TEXT, ALARM_LEVEL_TEXT } from '../utils/format'

const auth = useAuthStore()
const alarmStore = useAlarmStore()

const rows = ref([])
const loading = ref(true)
const error = ref('')
const statusFilter = ref('PENDING')
const levelFilter = ref('')
const typeFilter = ref('')
const kw = ref('')

const dialogVisible = ref(false)
const dialogMode = ref('ACKNOWLEDGED')
const current = ref(null)
const comment = ref('')
const saving = ref(false)

const canHandle = computed(() => auth.hasRole('ADMIN', 'OPERATOR'))

const counts = computed(() => {
  const c = { total: rows.value.length, pending: 0, critical: 0, today: 0 }
  const today = new Date().toISOString().slice(0, 10)
  rows.value.forEach((a) => {
    if (a.status === 'PENDING') c.pending += 1
    if (a.level === 'CRITICAL') c.critical += 1
    if (String(a.occurredAt || '').startsWith(today)) c.today += 1
  })
  return c
})

const filtered = computed(() =>
  rows.value.filter((a) => {
    if (statusFilter.value && a.status !== statusFilter.value) return false
    if (levelFilter.value && a.level !== levelFilter.value) return false
    if (typeFilter.value && a.type !== typeFilter.value) return false
    if (kw.value) {
      const k = kw.value.trim().toLowerCase()
      if (!String(a.message || '').toLowerCase().includes(k)) return false
    }
    return true
  })
)

function statusType(s) {
  return { PENDING: 'danger', ACKNOWLEDGED: 'warning', CLOSED: 'info' }[s] || 'info'
}
function statusText(s) {
  return { PENDING: '待处理', ACKNOWLEDGED: '已确认', CLOSED: '已关闭' }[s] || s
}
function levelType(l) {
  return l === 'CRITICAL' ? 'danger' : l === 'WARNING' ? 'warning' : 'info'
}

async function load(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const data = await listAlarms({ limit: 200 }, { silent: true })
    rows.value = data?.items || []
    alarmStore.refresh()
  } catch (e) {
    if (!silent) error.value = e.message || '报警列表加载失败'
  } finally {
    loading.value = false
  }
}

function openHandle(row, mode) {
  current.value = row
  dialogMode.value = mode
  comment.value = ''
  dialogVisible.value = true
}

async function submitHandle() {
  if (!current.value) return
  saving.value = true
  try {
    await handleAlarm(current.value.alarmId, dialogMode.value, comment.value.trim() || null)
    ElMessage.success(dialogMode.value === 'CLOSED' ? '报警已关闭' : '报警已确认')
    dialogVisible.value = false
    load(true)
  } catch (e) {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}

/* ---------------- 手动上报报警 ---------------- */
const createVisible = ref(false)
const createFormRef = ref(null)
const creating = ref(false)
const vehicles = ref([])
const createForm = reactive({
  vehicleId: '',
  type: 'OBSTACLE',
  level: 'WARNING',
  message: '',
  x: null,
  y: null,
})

const createRules = {
  vehicleId: [{ required: true, message: '请选择车辆', trigger: 'change' }],
  message: [{ required: true, message: '请填写报警内容', trigger: 'blur' }],
}

async function openCreate() {
  createForm.vehicleId = vehicles.value[0]?.vehicleId || ''
  createForm.type = 'OBSTACLE'
  createForm.level = 'WARNING'
  createForm.message = ''
  createForm.x = null
  createForm.y = null
  createVisible.value = true
  if (!vehicles.value.length) {
    try {
      const data = await listVehicles({ silent: true })
      vehicles.value = data?.items || []
      createForm.vehicleId = vehicles.value[0]?.vehicleId || ''
    } catch (e) {
      /* 忽略：无车辆时只能填编号 */
    }
  }
}

async function submitCreate() {
  const ok = await createFormRef.value?.validate().catch(() => false)
  if (!ok) return
  creating.value = true
  try {
    const payload = {
      vehicleId: createForm.vehicleId,
      type: createForm.type,
      level: createForm.level,
      message: createForm.message.trim(),
    }
    if (createForm.x != null && createForm.y != null) {
      payload.position = { x: Number(createForm.x), y: Number(createForm.y) }
    }
    await createAlarm(payload)
    ElMessage.success('报警已上报')
    createVisible.value = false
    load(true)
  } catch (e) {
    /* 已提示 */
  } finally {
    creating.value = false
  }
}

let timer = null
onMounted(() => {
  load()
  timer = setInterval(() => load(true), 5000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="page">
    <div class="summary">
      <MetricCard label="待处理" :value="counts.pending" unit="条" icon="Warning" tone="red" hint="需确认或关闭" />
      <MetricCard label="严重报警" :value="counts.critical" unit="条" icon="Bell" tone="amber" hint="CRITICAL 级别" />
      <MetricCard label="今日新增" :value="counts.today" unit="条" icon="Clock" tone="blue" hint="今日 00:00 起" />
      <MetricCard label="累计报警" :value="counts.total" unit="条" icon="DataLine" tone="green" hint="历史全部记录" />
    </div>

    <div class="filter-bar">
      <span class="fl">处理状态：</span>
      <el-select v-model="statusFilter" placeholder="全部" style="width: 120px">
        <el-option label="待处理" value="PENDING" />
        <el-option label="已确认" value="ACKNOWLEDGED" />
        <el-option label="已关闭" value="CLOSED" />
        <el-option label="全部" value="" />
      </el-select>

      <span class="fl">报警级别：</span>
      <el-select v-model="levelFilter" placeholder="全部" clearable style="width: 118px">
        <el-option label="严重" value="CRITICAL" />
        <el-option label="警告" value="WARNING" />
        <el-option label="提示" value="INFO" />
      </el-select>

      <span class="fl">报警类型：</span>
      <el-select v-model="typeFilter" placeholder="全部" clearable style="width: 126px">
        <el-option v-for="(text, key) in ALARM_TYPE_TEXT" :key="key" :label="text" :value="key" />
      </el-select>

      <el-input
        v-model="kw"
        placeholder="报警内容关键字"
        clearable
        style="width: 190px"
        :prefix-icon="'Search'"
      />

      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load()">刷新</el-button>
      <el-button v-if="canHandle" type="primary" :icon="'Plus'" @click="openCreate">手动上报</el-button>
    </div>

    <div class="card">
      <StateHint v-if="loading" type="loading" text="加载报警列表…" />
      <StateHint v-else-if="error" type="error" :text="error" @retry="load()" />
      <StateHint
        v-else-if="!filtered.length"
        type="empty"
        :text="statusFilter === 'PENDING' ? '当前没有待处理的报警' : '没有符合条件的报警'"
      />

      <el-table v-else :data="filtered" style="width: 100%">
        <el-table-column label="发生时间" width="165">
          <template #default="{ row }">
            <span class="mono time">{{ fmtDateTime(row.occurredAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <span class="type">{{ ALARM_TYPE_TEXT[row.type] || row.type }}</span>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="levelType(row.level)" effect="light">
              {{ ALARM_LEVEL_TEXT[row.level] || row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="报警内容" min-width="240" show-overflow-tooltip />
        <el-table-column label="来源" width="90">
          <template #default="{ row }">
            <span class="muted src">{{ row.source === 'MQTT' ? '车端上报' : row.source === 'SEED' ? '历史记录' : '人工' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="plain">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="处理信息" min-width="150">
          <template #default="{ row }">
            <div v-if="row.handledAt" class="handled">
              <span>{{ row.handledBy || '—' }} · {{ fmtDateTime(row.handledAt) }}</span>
              <span v-if="row.handleComment" class="cmt">{{ row.handleComment }}</span>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="right">
          <template #default="{ row }">
            <template v-if="canHandle && row.status !== 'CLOSED'">
              <el-button
                v-if="row.status === 'PENDING'"
                text
                type="primary"
                size="small"
                @click="openHandle(row, 'ACKNOWLEDGED')"
              >
                确认
              </el-button>
              <el-button text type="danger" size="small" @click="openHandle(row, 'CLOSED')">关闭</el-button>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 处理报警 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'CLOSED' ? '报警处理 · 解除告警' : '报警处理 · 受理确认'"
      width="520px"
      destroy-on-close
      class="alarm-dialog"
    >
      <div v-if="current" class="dlg-info">
        <div class="di-head">
          <el-tag size="small" :type="levelType(current.level)" effect="dark">
            {{ ALARM_LEVEL_TEXT[current.level] || current.level }}
          </el-tag>
          <b>{{ ALARM_TYPE_TEXT[current.type] || current.type }}</b>
          <span class="di-time mono">{{ fmtDateTime(current.occurredAt) }}</span>
        </div>
        <p class="di-msg">{{ current.message }}</p>
        <div class="di-meta">
          <span v-if="current.vehicleId">车辆 {{ current.vehicleId }}</span>
          <span v-if="current.position?.x != null" class="mono">
            位置 {{ Number(current.position.x).toFixed(2) }}, {{ Number(current.position.y).toFixed(2) }}
          </span>
          <span>来源 {{ current.source === 'MQTT' ? '车端上报' : current.source === 'SEED' ? '历史记录' : '人工上报' }}</span>
        </div>
      </div>

      <div class="dlg-label">
        {{ dialogMode === 'CLOSED' ? '处理备注（建议填写现场处置情况）' : '受理备注（选填）' }}
      </div>
      <el-input
        v-model="comment"
        type="textarea"
        :rows="3"
        maxlength="200"
        show-word-limit
        :placeholder="
          dialogMode === 'CLOSED'
            ? '例如：现场已清除障碍物，车辆恢复正常巡逻'
            : '例如：已通知现场人员前往确认'
        "
      />

      <template #footer>
        <el-button @click="dialogVisible = false">暂不处理</el-button>
        <el-button
          :type="dialogMode === 'CLOSED' ? 'danger' : 'primary'"
          :loading="saving"
          @click="submitHandle"
        >
          {{ dialogMode === 'CLOSED' ? '确认解除告警' : '确认受理' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 手动上报 -->
    <el-dialog v-model="createVisible" title="手动上报报警" width="500px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="80px">
        <el-form-item label="车辆" prop="vehicleId">
          <el-select v-model="createForm.vehicleId" placeholder="选择车辆" style="width: 100%">
            <el-option
              v-for="v in vehicles"
              :key="v.vehicleId"
              :label="`${v.name}（${v.code}）`"
              :value="v.vehicleId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="报警类型">
          <el-select v-model="createForm.type" style="width: 100%">
            <el-option v-for="(text, key) in ALARM_TYPE_TEXT" :key="key" :label="text" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="报警级别">
          <el-radio-group v-model="createForm.level">
            <el-radio value="INFO">提示</el-radio>
            <el-radio value="WARNING">警告</el-radio>
            <el-radio value="CRITICAL">严重</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="报警内容" prop="message">
          <el-input
            v-model="createForm.message"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="描述现场情况，例如：车头 0.5m 有临时堆放物料"
          />
        </el-form-item>
        <el-form-item label="坐标">
          <div class="xy">
            <el-input-number v-model="createForm.x" :precision="2" :step="0.5" placeholder="X" controls-position="right" />
            <el-input-number v-model="createForm.y" :precision="2" :step="0.5" placeholder="Y" controls-position="right" />
            <span class="muted mini">选填，单位 m</span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">上报</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.time { font-size: 12px; color: var(--text-3); }
.type { font-size: 13px; }
.src { font-size: 12px; }
.handled { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-2); }
.handled .cmt { color: var(--text-3); font-size: 11px; }

.dlg-info {
  background: #faf7fe;
  border: 1px solid var(--brand-line);
  border-radius: 10px;
  padding: 13px 15px;
  margin-bottom: 14px;
}
.di-head { display: flex; align-items: center; gap: 8px; }
.di-head b { font-size: 13.5px; font-weight: 600; }
.di-time { margin-left: auto; font-size: 11.5px; color: var(--text-3); }
.di-msg {
  margin: 9px 0 8px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text);
  word-break: break-all;
}
.di-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--text-3);
}

.dlg-label { font-size: 12.5px; color: var(--text-2); margin-bottom: 7px; }

.xy { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.xy :deep(.el-input-number) { width: 130px; }
.mini { font-size: 11.5px; }
</style>
