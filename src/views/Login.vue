<script setup>
import { ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref(null)
const form = reactive({ username: 'admin', password: 'Admin123456' })
const errorMsg = ref('')

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
}

const demoAccounts = [
  { label: '管理员', username: 'admin', password: 'Admin123456', desc: '全部功能' },
  { label: '操作员', username: 'operator', password: 'Operator123', desc: '控制/路线/任务' },
  { label: '观察员', username: 'viewer', password: 'Viewer123', desc: '只读' },
]

async function submit() {
  errorMsg.value = ''
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return

  try {
    const user = await auth.login(form.username, form.password)
    ElMessage.success(`欢迎回来，${user.displayName || user.username}`)
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' ? redirect : '/dashboard')
  } catch (e) {
    errorMsg.value = e.message || '登录失败'
  }
}

async function quickLogin(acc) {
  form.username = acc.username
  form.password = acc.password
  await submit()
}
</script>

<template>
  <div class="login-page">
    <section class="brand-side">
      <div class="brand-top">
        <div class="logo">
          <svg viewBox="0 0 32 32" width="19" height="19" aria-hidden="true">
            <rect x="7" y="9" width="18" height="14" rx="5" fill="none" stroke="#fff" stroke-width="2" />
            <circle cx="13" cy="15" r="1.8" fill="#fff" />
            <circle cx="19" cy="15" r="1.8" fill="#fff" />
            <path d="M13 19.5h6" stroke="#fff" stroke-width="2" stroke-linecap="round" />
            <path d="M16 9V6" stroke="#fff" stroke-width="2" stroke-linecap="round" />
            <circle cx="16" cy="5" r="1.6" fill="#fff" />
          </svg>
        </div>
        <span>SCOUT MINI · 巡逻管控平台</span>
      </div>

      <div class="brand-main">
        <h1>把巡检现场<br />搬到浏览器里</h1>
        <p>车辆实时状态、远程控制、路线与任务下发、异常报警处理，统一在一个管控台完成。</p>

        <ul class="feature-list">
          <li>
            <el-icon><Monitor /></el-icon>
            <div><b>实时状态可视化</b><span>电量、速度、位姿每秒刷新</span></div>
          </li>
          <li>
            <el-icon><Aim /></el-icon>
            <div><b>远程控制与任务下发</b><span>方向控制、急停、巡逻任务闭环</span></div>
          </li>
          <li>
            <el-icon><Bell /></el-icon>
            <div><b>报警处理留痕</b><span>确认、关闭、操作日志可追溯</span></div>
          </li>
        </ul>
      </div>

      <div class="brand-foot">阶段4 · 前端 Web 开发及前后端通信实现</div>
    </section>

    <section class="form-side">
      <div class="form-wrap">
        <h2>登录管控平台</h2>
        <p class="sub">请使用分配给你的账号登录</p>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="submit">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" :prefix-icon="'User'" clearable />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              :prefix-icon="'Lock'"
              show-password
              @keyup.enter="submit"
            />
          </el-form-item>

          <div v-if="errorMsg" class="error-line">
            <el-icon><WarningFilled /></el-icon>{{ errorMsg }}
          </div>

          <el-button type="primary" class="submit" :loading="auth.loading" @click="submit">
            登 录
          </el-button>
        </el-form>

        <div class="demo">
          <div class="demo-title">演示账号（点击直接登录）</div>
          <div class="demo-list">
            <button v-for="a in demoAccounts" :key="a.username" class="demo-item" @click="quickLogin(a)">
              <b>{{ a.label }}</b>
              <span>{{ a.username }}</span>
              <em>{{ a.desc }}</em>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  background: #fff;
}

/* ---------- 左侧品牌 ---------- */
.brand-side {
  width: 46%;
  max-width: 620px;
  background: linear-gradient(158deg, #3a0a5c 0%, #4c1279 48%, #5d1a92 100%);
  color: #fff;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}
.brand-side::after {
  content: '';
  position: absolute;
  right: -120px;
  bottom: -120px;
  width: 360px;
  height: 360px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 50%;
}
.brand-side::before {
  content: '';
  position: absolute;
  left: -160px;
  top: -160px;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(167, 108, 246, 0.35), transparent 68%);
  pointer-events: none;
}
.brand-top { display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255, 255, 255, 0.72); }
.logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.brand-main { max-width: 420px; }
.brand-main h1 {
  font-size: 30px;
  line-height: 1.35;
  font-weight: 500;
  margin: 0 0 16px;
  letter-spacing: 0.5px;
}
.brand-main > p { color: rgba(255, 255, 255, 0.66); font-size: 13px; line-height: 1.8; margin: 0 0 32px; }

.feature-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 18px; }
.feature-list li { display: flex; gap: 12px; align-items: flex-start; }
.feature-list .el-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.10);
  color: #d8b4fe;
  flex: none;
}
.feature-list div { display: flex; flex-direction: column; gap: 2px; }
.feature-list b { font-size: 13px; font-weight: 500; }
.feature-list span { font-size: 12px; color: rgba(255, 255, 255, 0.56); }
.brand-foot { font-size: 11px; color: rgba(255, 255, 255, 0.44); }

/* ---------- 右侧表单 ---------- */
.form-side { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; }
.form-wrap { width: 100%; max-width: 360px; }
.form-wrap h2 { font-size: 22px; font-weight: 500; margin: 0 0 6px; }
.form-wrap .sub { font-size: 13px; color: var(--text-3); margin: 0 0 28px; }

.submit { width: 100%; height: 42px; font-size: 15px; letter-spacing: 2px; margin-top: 4px; }

.error-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-weak);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
}

.demo { margin-top: 30px; border-top: 1px dashed var(--border); padding-top: 18px; }
.demo-title { font-size: 12px; color: var(--text-3); margin-bottom: 10px; }
.demo-list { display: flex; flex-direction: column; gap: 8px; }
.demo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  background: #fafbfd;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: 0.12s;
}
.demo-item:hover { border-color: #c9aef5; background: var(--brand-weak); }
.demo-item b { font-size: 13px; font-weight: 500; width: 48px; }
.demo-item span { font-size: 12px; color: var(--text-2); font-family: ui-monospace, Consolas, monospace; }
.demo-item em { margin-left: auto; font-style: normal; font-size: 11px; color: var(--text-3); }

@media (max-width: 860px) {
  .brand-side { display: none; }
}
</style>
