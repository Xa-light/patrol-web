<script setup>
defineProps({
  label: { type: String, default: '' },
  value: { type: [String, Number], default: '—' },
  unit: { type: String, default: '' },
  hint: { type: String, default: '' },
  icon: { type: String, default: 'DataLine' },
  tone: { type: String, default: 'blue' }, // blue | green | amber | red
})
</script>

<template>
  <div class="metric card">
    <div class="metric-icon" :class="tone">
      <component :is="icon" />
    </div>
    <div class="metric-body">
      <div class="metric-label">{{ label }}</div>
      <div class="metric-value">
        {{ value }}<span v-if="unit" class="metric-unit">{{ unit }}</span>
      </div>
      <div v-if="hint" class="metric-hint">{{ hint }}</div>
    </div>
  </div>
</template>

<style scoped>
.metric {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  transition: box-shadow 0.16s ease, transform 0.16s ease;
}
.metric:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
.metric-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.metric-icon :deep(svg) { width: 20px; height: 20px; }
.metric-icon.blue, .metric-icon.violet { background: #f1e9fe; color: #7c3aed; }
.metric-icon.green { background: #e6f7ed; color: #1c9a63; }
.metric-icon.amber { background: #fdf6ec; color: #c98118; }
.metric-icon.red { background: #fdeeec; color: #cf4436; }
.metric-body { min-width: 0; }
.metric-label { font-size: 12px; color: var(--text-3); margin-bottom: 4px; }
.metric-value {
  font-size: 24px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--text);
}
.metric-unit { font-size: 12px; color: var(--text-3); margin-left: 3px; font-weight: 400; }
.metric-hint { font-size: 12px; color: var(--text-3); margin-top: 4px; }
</style>
