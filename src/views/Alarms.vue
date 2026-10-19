<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import MetricCard from '../components/MetricCard.vue'
import { listAlarms, handleAlarm } from '../api/alarm'
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

    <div class="page-toolbar">
      <el-radio-group v-model="statusFilter">
        <el-radio-button value="PENDING">待处理</el-radio-button>
        <el-radio-button value="ACKNOWLEDGED">已确认</el-radio-button>
        <el-radio-button value="CLOSED">已关闭</el-radio-button>
        <el-radio-button value="">全部</el-radio-button>
      </el-radio-group>

      <el-select v-model="levelFilter" placeholder="全部级别" clearable style="width: 130px">
        <el-option label="严重" value="CRITICAL" />
        <el-option label="警告" value="WARNING" />
        <el-option label="提示" value="INFO" />
      </el-select>

      <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 140px">
        <el-option v-for="(text, key) in ALARM_TYPE_TEXT" :key="key" :label="text" :value="key" />
      </el-select>

      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load()">刷新</el-button>
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

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'CLOSED' ? '关闭报警' : '确认报警'"
      width="480px"
      destroy-on-close
    >
      <div v-if="current" class="dlg-info">
        <div class="row"><span>类型</span><b>{{ ALARM_TYPE_TEXT[current.type] || current.type }}</b></div>
        <div class="row"><span>级别</span><b>{{ ALARM_LEVEL_TEXT[current.level] || current.level }}</b></div>
        <div class="row"><span>内容</span><b>{{ current.message }}</b></div>
        <div class="row"><span>时间</span><b>{{ fmtDateTime(current.occurredAt) }}</b></div>
      </div>
      <el-input
        v-model="comment"
        type="textarea"
        :rows="3"
        maxlength="200"
        show-word-limit
        placeholder="处理说明（选填），例如：现场已清除障碍物"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitHandle">提交</el-button>
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
  background: #fafbfd;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dlg-info .row { display: flex; gap: 10px; font-size: 13px; }
.dlg-info .row span { width: 40px; color: var(--text-3); flex: none; }
.dlg-info .row b { font-weight: 500; }
</style>
