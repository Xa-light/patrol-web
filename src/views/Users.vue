<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import { listUsers, createUser, updateUser, resetPassword, deleteUser } from '../api/system'
import { useAuthStore } from '../stores/auth'
import { ROLE_TEXT } from '../utils/format'

const auth = useAuthStore()

const rows = ref([])
const loading = ref(true)
const error = ref('')

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
</script>

<template>
  <div class="page">
    <div class="page-toolbar">
      <span class="muted count">共 {{ rows.length }} 个账号</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
      <el-button type="primary" :icon="'Plus'" @click="openCreate">新增用户</el-button>
    </div>

    <div class="card">
      <StateHint v-if="loading" type="loading" text="加载用户列表…" />
      <StateHint v-else-if="error" type="error" :text="error" @retry="load" />
      <StateHint v-else-if="!rows.length" type="empty" text="暂无用户" />

      <el-table v-else :data="rows" style="width: 100%">
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
        <el-table-column label="操作" width="286" align="right" class-name="op-cell">
          <template #default="{ row }">
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
  background: #fafbfd;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.6;
}
</style>
