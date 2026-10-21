<script setup>
import { ref, onMounted } from 'vue'
import StateHint from '../components/StateHint.vue'
import { listLogs } from '../api/system'
import { fmtDateTime } from '../utils/format'

const rows = ref([])
const total = ref(0)
const loading = ref(true)
const error = ref('')

const path = ref('')
const method = ref('')
const status = ref('')
const page = ref(1)
const pageSize = 20

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = {
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
    }
    if (path.value.trim()) params.path = path.value.trim()
    if (method.value) params.method = method.value
    if (status.value) params.status = Number(status.value)

    const data = await listLogs(params, { silent: true })
    rows.value = data?.items || []
    total.value = data?.total || 0
  } catch (e) {
    error.value = e.message || '日志加载失败'
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function reset() {
  path.value = ''
  method.value = ''
  status.value = ''
  page.value = 1
  load()
}

function onPage(p) {
  page.value = p
  load()
}

function statusClass(s) {
  if (s >= 500) return 'bad'
  if (s >= 400) return 'warn'
  return 'ok'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-toolbar">
      <el-input
        v-model="path"
        placeholder="接口路径，如 /api/v1/tasks"
        clearable
        style="width: 260px"
        :prefix-icon="'Search'"
        @keyup.enter="search"
      />
      <el-select v-model="method" placeholder="方法" clearable style="width: 110px">
        <el-option v-for="m in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']" :key="m" :label="m" :value="m" />
      </el-select>
      <el-select v-model="status" placeholder="状态码" clearable style="width: 120px">
        <el-option label="200" value="200" />
        <el-option label="401" value="401" />
        <el-option label="403" value="403" />
        <el-option label="404" value="404" />
        <el-option label="409" value="409" />
        <el-option label="422" value="422" />
        <el-option label="500" value="500" />
      </el-select>
      <el-button type="primary" :icon="'Search'" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <div class="spacer" />
      <span class="muted count">共 {{ total }} 条请求记录</span>
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <div class="card">
      <StateHint v-if="loading" type="loading" text="加载操作日志…" />
      <StateHint v-else-if="error" type="error" :text="error" @retry="load" />
      <StateHint v-else-if="!rows.length" type="empty" text="没有符合条件的请求记录" />

      <template v-else>
        <el-table :data="rows" style="width: 100%">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">
              <span class="mono time">{{ fmtDateTime(row.ts) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="方法" width="90">
            <template #default="{ row }">
              <span class="method" :class="row.method?.toLowerCase()">{{ row.method }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="path" label="请求路径" min-width="280">
            <template #default="{ row }">
              <span class="mono path">{{ row.path }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态码" width="100">
            <template #default="{ row }">
              <span class="status" :class="statusClass(row.status)">{{ row.status }}</span>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="110" align="right">
            <template #default="{ row }">
              <span class="mono dur" :class="{ slow: row.durationMs > 300 }">{{ row.durationMs }} ms</span>
            </template>
          </el-table-column>
          <el-table-column prop="traceId" label="Trace ID" width="130">
            <template #default="{ row }">
              <span class="mono trace">{{ row.traceId }}</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination
            layout="prev, pager, next, total"
            :total="total"
            :page-size="pageSize"
            :current-page="page"
            background
            @current-change="onPage"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.count { font-size: 12px; }
.time { font-size: 12px; color: var(--text-3); }
.path { font-size: 12px; }
.trace { font-size: 11px; color: var(--text-3); }
.dur { font-size: 12px; }
.dur.slow { color: var(--warn); }
.method {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  background: #f0f3f8;
  color: var(--text-2);
}
.method.get { background: #f1e9fe; color: #7c3aed; }
.method.post { background: #e6f7ed; color: #1c9a63; }
.method.put, .method.patch { background: #fdf6ec; color: #c98118; }
.method.delete { background: #fdeeec; color: #cf4436; }
.status { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.status.ok { color: var(--ok); }
.status.warn { color: var(--warn); }
.status.bad { color: var(--danger); }
.pager { display: flex; justify-content: flex-end; padding: 14px 16px 4px; }
</style>
