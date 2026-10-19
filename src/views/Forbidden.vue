<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="err-page">
    <div class="code">403</div>
    <h2>没有访问权限</h2>
    <p>当前账号的角色无权访问该页面。如需使用，请联系管理员调整权限。</p>
    <div class="actions">
      <el-button type="primary" @click="router.replace('/dashboard')">返回总览</el-button>
      <el-button @click="router.back()">返回上一页</el-button>
    </div>
  </div>
</template>

<style scoped>
.err-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--bg);
  padding: 24px;
  text-align: center;
}
.code { font-size: 64px; font-weight: 500; color: #cfd7e4; line-height: 1; }
h2 { font-size: 18px; font-weight: 500; margin: 8px 0 0; }
p { font-size: 13px; color: var(--text-3); margin: 0 0 12px; max-width: 420px; }
.actions { display: flex; gap: 10px; }
</style>
