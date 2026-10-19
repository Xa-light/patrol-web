<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import { listRoutes, createRoute, updateRoute, deleteRoute } from '../api/route'
import { useAuthStore } from '../stores/auth'
import { fmtNum } from '../utils/format'

const auth = useAuthStore()

const rows = ref([])
const loading = ref(true)
const error = ref('')
const keyword = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref('')
const formRef = ref(null)

const form = reactive({
  name: '',
  area: '',
  description: '',
  waypoints: [{ x: 0, y: 0, yaw: 0, dwellSec: 0 }],
})

const rules = {
  name: [
    { required: true, message: '请输入路线名称', trigger: 'blur' },
    { max: 50, message: '名称不超过 50 字', trigger: 'blur' },
  ],
}

const canEdit = computed(() => auth.hasRole('ADMIN', 'OPERATOR'))
const isEditing = computed(() => !!editingId.value)

const filtered = computed(() => {
  const k = keyword.value.trim()
  if (!k) return rows.value
  return rows.value.filter(
    (r) => r.name.includes(k) || (r.area || '').includes(k) || (r.description || '').includes(k)
  )
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await listRoutes({ silent: true })
    rows.value = data?.items || []
  } catch (e) {
    error.value = e.message || '路线列表加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = ''
  form.name = ''
  form.area = ''
  form.description = ''
  form.waypoints = [{ x: 0, y: 0, yaw: 0, dwellSec: 0 }]
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.routeId
  form.name = row.name
  form.area = row.area || ''
  form.description = row.description || ''
  form.waypoints = (row.waypoints || []).map((w) => ({
    x: w.x ?? 0,
    y: w.y ?? 0,
    yaw: w.yaw ?? 0,
    dwellSec: w.dwellSec ?? 0,
  }))
  if (!form.waypoints.length) form.waypoints = [{ x: 0, y: 0, yaw: 0, dwellSec: 0 }]
  dialogVisible.value = true
}

function addWaypoint() {
  const last = form.waypoints[form.waypoints.length - 1]
  form.waypoints.push({ x: last?.x ?? 0, y: last?.y ?? 0, yaw: last?.yaw ?? 0, dwellSec: 0 })
}

function removeWaypoint(i) {
  if (form.waypoints.length <= 1) return
  form.waypoints.splice(i, 1)
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  if (form.waypoints.some((w) => w.x === null || w.y === null || w.x === '' || w.y === '')) {
    ElMessage.warning('航点的 X / Y 不能为空')
    return
  }

  saving.value = true
  const payload = {
    name: form.name.trim(),
    area: form.area.trim() || null,
    description: form.description.trim() || null,
    waypoints: form.waypoints.map((w) => ({
      x: Number(w.x) || 0,
      y: Number(w.y) || 0,
      yaw: Number(w.yaw) || 0,
      dwellSec: Number(w.dwellSec) || 0,
    })),
  }

  try {
    if (isEditing.value) {
      await updateRoute(editingId.value, payload)
      ElMessage.success('路线已更新')
    } else {
      await createRoute(payload)
      ElMessage.success('路线已创建')
    }
    dialogVisible.value = false
    load()
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `删除后不可恢复，确定删除路线「${row.name}」？`,
      '删除路线',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  try {
    await deleteRoute(row.routeId)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索路线名称 / 区域"
        clearable
        style="width: 240px"
        :prefix-icon="'Search'"
      />
      <span class="muted count">共 {{ rows.length }} 条路线</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
      <el-button v-if="canEdit" type="primary" :icon="'Plus'" @click="openCreate">新建路线</el-button>
    </div>

    <div class="card">
      <StateHint v-if="loading" type="loading" text="加载路线列表…" />
      <StateHint v-else-if="error" type="error" :text="error" @retry="load" />
      <StateHint v-else-if="!filtered.length" type="empty" :text="keyword ? '没有匹配的路线' : '还没有路线，先创建一条'">
        <el-button v-if="canEdit && !keyword" type="primary" size="small" @click="openCreate">新建路线</el-button>
      </StateHint>

      <el-table v-else :data="filtered" style="width: 100%">
        <el-table-column prop="name" label="路线名称" min-width="160">
          <template #default="{ row }">
            <div class="name-cell">
              <b>{{ row.name }}</b>
              <span v-if="row.description" class="desc">{{ row.description }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="area" label="区域" width="130">
          <template #default="{ row }">{{ row.area || '—' }}</template>
        </el-table-column>
        <el-table-column label="航点" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.waypointCount ?? row.waypoints?.length ?? 0 }} 个</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="航点坐标" min-width="240">
          <template #default="{ row }">
            <span class="coords">
              <span v-for="(w, i) in (row.waypoints || []).slice(0, 3)" :key="i" class="coord">
                ({{ fmtNum(w.x, 1) }}, {{ fmtNum(w.y, 1) }})
              </span>
              <span v-if="(row.waypoints || []).length > 3" class="muted">
                +{{ row.waypoints.length - 3 }}
              </span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="right">
          <template #default="{ row }">
            <el-button v-if="canEdit" text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canEdit" text type="danger" size="small" @click="remove(row)">删除</el-button>
            <span v-if="!canEdit" class="muted">只读</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑路线' : '新建路线'"
      width="720px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="76px">
        <el-form-item label="路线名称" prop="name">
          <el-input v-model="form.name" maxlength="50" show-word-limit placeholder="例如：走廊长方形巡检" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="form.area" maxlength="50" placeholder="例如：A 栋 3 层" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>

        <el-form-item label="航点">
          <div class="wp-box">
            <div class="wp-head">
              <span>#</span><span>X (m)</span><span>Y (m)</span><span>Yaw (rad)</span><span>停留 (s)</span><span />
            </div>
            <div v-for="(w, i) in form.waypoints" :key="i" class="wp-row">
              <span class="idx">{{ i + 1 }}</span>
              <el-input-number v-model="w.x" :step="0.1" :precision="2" :controls="false" size="small" />
              <el-input-number v-model="w.y" :step="0.1" :precision="2" :controls="false" size="small" />
              <el-input-number v-model="w.yaw" :step="0.1" :precision="2" :controls="false" size="small" />
              <el-input-number v-model="w.dwellSec" :min="0" :step="1" :controls="false" size="small" />
              <el-button
                text
                type="danger"
                size="small"
                :disabled="form.waypoints.length <= 1"
                @click="removeWaypoint(i)"
              >
                删除
              </el-button>
            </div>
            <el-button text type="primary" size="small" :icon="'Plus'" @click="addWaypoint">添加航点</el-button>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">
          {{ isEditing ? '保存修改' : '创建路线' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.count { font-size: 12px; }
.name-cell { display: flex; flex-direction: column; gap: 2px; }
.name-cell b { font-weight: 500; }
.desc { font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.coords { display: flex; flex-wrap: wrap; gap: 8px; font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--text-2); }

.wp-box { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: #fafbfd; }
.wp-head, .wp-row {
  display: grid;
  grid-template-columns: 28px 1fr 1fr 1fr 1fr 52px;
  gap: 8px;
  align-items: center;
}
.wp-head { font-size: 11px; color: var(--text-3); padding-bottom: 6px; }
.wp-row { padding: 4px 0; }
.wp-row .idx { font-size: 12px; color: var(--text-3); }
</style>
