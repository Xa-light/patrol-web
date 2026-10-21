<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import { listUsers, createUser, updateUser, resetPassword, deleteUser, getUser } from '../api/system'
import { useAuthStore } from '../stores/auth'
import { ROLE_TEXT } from '../utils/format'

const auth = useAuthStore()

const rows = ref([])
const loading = ref(true)
const error = ref('')
const kw = ref('')
const roleFilter = ref('')

const shown = computed(() =>
  rows.value.filter((u) => {
    if (roleFilter.value && u.role !== roleFilter.value) return false
    if (kw.value) {
      const k = kw.value.trim().toLowerCase()
      const hay = `${u.username || ''} ${u.displayName || ''}`.toLowerCase()
      if (!hay.includes(k)) return false
    }
    return true
  })
)

const dialogVisible = ref(false)
const dialogMode = ref('create') // create | edit | password
const saving = ref(false)
const formRef = ref(null)
const current = ref(null)

const form = reactive({
  username: '',
  password: '',
  displayName: '',
  role: 'OPERATOR',
})

const rules = computed(() => ({
  username:
    dialogMode.value === 'create'
      ? [
          { required: true, message: '请输入用户名', trigger: 'blur' },
          { min: 3, max: 32, message: '用户名 3-32 位', trigger: 'blur' },
        ]
      : [],
  password:
    dialogMode.value === 'create' || dialogMode.value === 'password'
      ? [
          { required: true, message: '请输入密码', trigger: 'blur' },
          { min: 8, message: '密码至少 8 位', trigger: 'blur' },
          {
            validator: (rule, value, cb) => {
              if (!value) return cb()
              if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
                return cb(new Error('密码需同时包含字母和数字'))
              }
              cb()
            },
            trigger: 'blur',
          },
        ]
      : [],
}))

const title = computed(
  () => ({ create: '新增用户', edit: '编辑用户', password: '重置密码' }[dialogMode.value])
)

function roleTag(role) {
  return { ADMIN: 'danger', OPERATOR: 'primary', VIEWER: 'info' }[role] || 'info'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await listUsers({ silent: true })
    rows.value = data?.items || []
  } catch (e) {
    error.value = e.message || '用户列表加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dialogMode.value = 'create'
  form.username = ''
  form.password = ''
  form.displayName = ''
  form.role = 'OPERATOR'
  current.value = null
  dialogVisible.value = true
}

function openEdit(row) {
  dialogMode.value = 'edit'
  current.value = row
  form.username = row.username
  form.displayName = row.displayName || ''
  form.role = row.role
  dialogVisible.value = true
}

function openPassword(row) {
  dialogMode.value = 'password'
  current.value = row
  form.username = row.username
  form.password = ''
  dialogVisible.value = true
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      await createUser({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || null,
        role: form.role,
      })
      ElMessage.success('用户已创建')
    } else if (dialogMode.value === 'edit') {
      await updateUser(current.value.userId, {
        displayName: form.displayName.trim() || null,
        role: form.role,
      })
      ElMessage.success('用户信息已更新')
    } else {
      await resetPassword(current.value.userId, form.password)
      ElMessage.success('密码已重置')
    }
    dialogVisible.value = false
    load()
  } catch (e) {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  const next = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  const label = next === 'DISABLED' ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(`确定${label}账号「${row.username}」？`, `${label}账号`, {
      type: 'warning', confirmButtonText: label, cancelButtonText: '取消',
    })
  } catch (e) {
    return
  }
  try {
    await updateUser(row.userId, { status: next })
    ElMessage.success(`已${label}`)
    load()
  } catch (e) {
    /* 已提示 */
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`删除后不可恢复，确定删除用户「${row.username}」？`, '删除用户', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch (e) {
    return
  }
  try {
    await deleteUser(row.userId)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(load)

/* ---------------- 账号详情 ---------------- */
const detailVisible = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')

const ROLE_SCOPE = {
  ADMIN: ['用户管理（增删改、重置密码）', '车辆注册与删除', '全部控制与任务功能', '报警处理与日志查看'],
  OPERATOR: ['车辆遥控 / 急停 / 自主巡逻', '路线与任务管理', '报警处理', '日志查看'],
  VIEWER: ['运行总览', 'SLAM 建图与抓拍相册', '报警中心（只读）'],
}

async function openDetail(row) {
  detail.value = row
  detailError.value = ''
  detailLoading.value = true
  detailVisible.value = true
  try {
    const data = await getUser(row.userId)
    if (data) detail.value = { ...row, ...data }
  } catch (e) {
    detailError.value = '账号详情加载失败，当前展示列表数据'
  } finally {
    detailLoading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="filter-bar">
      <span class="fl">账号搜索：</span>
      <el-input
        v-model="kw"
        placeholder="用户名 / 显示名称"
        clearable
        style="width: 220px"
        :prefix-icon="'Search'"
      />
      <span class="fl">角色：</span>
      <el-select v-model="roleFilter" placeholder="全部" clearable style="width: 132px">
        <el-option label="系统管理员" value="ADMIN" />
        <el-option label="操作员" value="OPERATOR" />
        <el-option label="观察员" value="VIEWER" />
      </el-select>
      <span class="muted count">共 {{ shown.length }} / {{ rows.length }} 个账号</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
      <el-button type="primary" :icon="'Plus'" @click="openCreate">新增用户</el-button>
    </div>

    <div class="card">
      <StateHint v-if="loading" type="loading" text="加载用户列表…" />
      <StateHint v-else-if="error" type="error" :text="error" @retry="load" />
      <StateHint v-else-if="!rows.length" type="empty" text="暂无用户" />

      <el-table v-else :data="shown" style="width: 100%">
        <el-table-column label="用户" min-width="200">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="avatar">{{ (row.displayName || row.username).slice(0, 1) }}</div>
              <div class="meta">
                <b>{{ row.displayName || row.username }}</b>
                <span>{{ row.username }}</span>
              </div>
              <el-tag v-if="row.userId === auth.user?.userId" size="small" effect="plain">当前账号</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="roleTag(row.role)" effect="light">{{ ROLE_TEXT[row.role] || row.role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <span class="status" :class="{ off: row.status === 'DISABLED' }">
              <span class="dot" :class="row.status === 'ACTIVE' ? 'on' : 'off'" />
              {{ row.status === 'ACTIVE' ? '正常' : '已停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="userId" label="用户 ID" width="160">
          <template #default="{ row }">
            <span class="mono muted">{{ row.userId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" align="right" class-name="op-cell">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text size="small" @click="openPassword(row)">重置密码</el-button>
            <el-button
              text
              size="small"
              :type="row.status === 'ACTIVE' ? 'warning' : 'success'"
              :disabled="row.userId === auth.user?.userId"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
            </el-button>
            <el-button
              text
              type="danger"
              size="small"
              :disabled="row.userId === auth.user?.userId"
              @click="remove(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="title" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="dialogMode !== 'create'" maxlength="32" />
        </el-form-item>

        <el-form-item v-if="dialogMode === 'create'" label="显示名称">
          <el-input v-model="form.displayName" maxlength="32" placeholder="例如：张三" />
        </el-form-item>

        <el-form-item v-if="dialogMode === 'edit'" label="显示名称">
          <el-input v-model="form.displayName" maxlength="32" />
        </el-form-item>

        <el-form-item v-if="dialogMode !== 'password'" label="角色">
          <el-radio-group v-model="form.role">
            <el-radio value="ADMIN">系统管理员</el-radio>
            <el-radio value="OPERATOR">操作员</el-radio>
            <el-radio value="VIEWER">观察员</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="dialogMode !== 'edit'" label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="dialogMode === 'password' ? '输入新密码' : '8-64 位，需含字母和数字'"
          />
        </el-form-item>
      </el-form>

      <div class="hint">
        <b>角色说明：</b>管理员可管理用户与全部功能；操作员可控制车辆、管理路线与任务；观察员仅可查看总览与报警。
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 账号详情 -->
    <el-dialog v-model="detailVisible" title="账号详情" width="460px" destroy-on-close>
      <div v-if="detail" class="ud">
        <div class="ud-head">
          <div class="avatar big">{{ (detail.displayName || detail.username).slice(0, 1) }}</div>
          <div class="ud-meta">
            <b>{{ detail.displayName || detail.username }}</b>
            <span class="mono">{{ detail.username }}</span>
          </div>
          <el-tag size="small" :type="roleTag(detail.role)" effect="light">
            {{ ROLE_TEXT[detail.role] || detail.role }}
          </el-tag>
        </div>

        <div v-if="detailError" class="ud-warn">{{ detailError }}</div>

        <div class="info-panel">
          <div class="row"><span class="k">用户 ID</span><span class="v mono">{{ detail.userId }}</span></div>
          <div class="row">
            <span class="k">账号状态</span>
            <span class="v">
              <span class="dot" :class="detail.status === 'ACTIVE' ? 'on' : 'off'" />
              {{ detail.status === 'ACTIVE' ? '正常' : '已停用' }}
            </span>
          </div>
          <div class="row"><span class="k">角色</span><span class="v">{{ ROLE_TEXT[detail.role] || detail.role }}</span></div>
        </div>

        <div class="ud-sec">权限范围</div>
        <ul class="ud-scope">
          <li v-for="(s, i) in ROLE_SCOPE[detail.role] || []" :key="i">
            <el-icon><Select /></el-icon>{{ s }}
          </li>
        </ul>

        <div v-if="detailLoading" class="ud-loading">同步中…</div>
      </div>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" @click="detailVisible = false; openEdit(detail)">编辑此账号</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
:deep(.op-cell .cell) { white-space: nowrap; }
:deep(.op-cell .el-button) { margin-left: 8px; }
:deep(.op-cell .el-button:first-child) { margin-left: 0; }
.count { font-size: 12px; }
.user-cell { display: flex; align-items: center; gap: 10px; }
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
  flex: none;
}
.meta { display: flex; flex-direction: column; line-height: 1.3; }
.meta b { font-size: 13px; font-weight: 500; }
.meta span { font-size: 11px; color: var(--text-3); font-family: ui-monospace, Consolas, monospace; }
.status { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ok); }
.status.off { color: var(--text-3); }
.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
  background: #faf7fe;
  border: 1px solid var(--brand-line);
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.6;
}

/* ---------- 账号详情 ---------- */
.ud-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.avatar.big { width: 44px; height: 44px; font-size: 17px; background: var(--brand-weak); color: var(--brand); }
.ud-meta { display: flex; flex-direction: column; gap: 2px; line-height: 1.35; }
.ud-meta b { font-size: 14.5px; font-weight: 600; }
.ud-meta span { font-size: 11.5px; color: var(--text-3); }
.ud-head .el-tag { margin-left: auto; }
.ud-warn {
  font-size: 12px;
  color: var(--warn);
  background: var(--warn-weak);
  border-radius: 7px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.info-panel .v { display: inline-flex; align-items: center; gap: 6px; }
.ud-sec { font-size: 13px; font-weight: 600; margin: 16px 0 8px; }
.ud-scope { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.ud-scope li { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-2); }
.ud-scope .el-icon { color: var(--ok); font-size: 13px; }
.ud-loading { margin-top: 12px; font-size: 12px; color: var(--text-3); }
</style>
