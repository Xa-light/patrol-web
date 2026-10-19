<script setup>
defineProps({
  type: { type: String, default: 'empty' }, // empty | error | loading
  text: { type: String, default: '暂无数据' },
  hint: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['retry'])
</script>

<template>
  <div class="state" :class="{ compact }">
    <template v-if="type === 'loading'">
      <el-icon class="spin" :size="20"><Loading /></el-icon>
      <p>{{ text || '加载中…' }}</p>
    </template>
    <template v-else-if="type === 'error'">
      <el-icon :size="22" color="#e04b3c"><WarningFilled /></el-icon>
      <p>{{ text || '加载失败' }}</p>
      <el-button size="small" @click="emit('retry')">重新加载</el-button>
    </template>
    <template v-else>
      <el-icon :size="22" color="#b6bfcd"><Box /></el-icon>
      <p>{{ text }}</p>
      <span v-if="hint" class="hint">{{ hint }}</span>
      <slot />
    </template>
  </div>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 44px 16px;
  color: var(--text-3);
  font-size: 13px;
}
.state.compact { padding: 20px 12px; }
.state p { margin: 0; }
.state .hint { font-size: 12px; color: #b6bfcd; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
