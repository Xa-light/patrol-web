<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="err-page">
    <div class="code">404</div>
    <h2>页面不存在</h2>
    <p>你访问的地址可能已被移除，或者链接输入有误。</p>
    <div class="actions">
      <el-button type="primary" @click="router.replace('/dashboard')">返回总览</el-button>
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
p { font-size: 13px; color: var(--text-3); margin: 0 0 12px; }
</style>
