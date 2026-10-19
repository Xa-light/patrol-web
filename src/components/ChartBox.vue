<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
// 按需引入：整包 import 会让 echarts chunk 涨到 1.1MB
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart, GaugeChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  AxisPointerComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  AxisPointerComponent,
  CanvasRenderer,
])

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  option: { type: Object, default: () => ({}) },
  height: { type: String, default: '260px' },
  loading: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' },
  error: { type: String, default: '' },
})
const emit = defineEmits(['retry'])

const el = ref(null)
let chart = null

function render() {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  chart.setOption(props.option || {}, true)
}

function resize() {
  if (chart) chart.resize()
}

async function tryRender() {
  await nextTick()
  if (props.loading || props.empty || props.error) return
  render()
}

onMounted(async () => {
  await tryRender()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  if (chart) {
    chart.dispose()
    chart = null
  }
})

watch(() => props.option, tryRender, { deep: true })
watch(() => [props.loading, props.empty, props.error], tryRender)
</script>

<template>
  <div class="chart-card card">
    <div class="card-head">
      <div class="card-title">
        {{ title }}
        <span v-if="subtitle" class="card-sub">{{ subtitle }}</span>
      </div>
      <slot name="extra" />
    </div>

    <div class="chart-body" :style="{ height }">
      <el-skeleton v-if="loading" :rows="4" animated />
      <div v-else-if="error" class="chart-state">
        <el-icon :size="22" color="#e04b3c"><WarningFilled /></el-icon>
        <p>{{ error }}</p>
        <el-button size="small" @click="emit('retry')">重试</el-button>
      </div>
      <div v-else-if="empty" class="chart-state">
        <el-icon :size="22" color="#b6bfcd"><DataLine /></el-icon>
        <p>{{ emptyText }}</p>
      </div>
      <div v-show="!loading && !empty && !error" ref="el" class="chart-canvas" />
    </div>
  </div>
</template>

<style scoped>
.chart-card { padding: 16px 18px; display: flex; flex-direction: column; }
.chart-body { position: relative; width: 100%; }
.chart-canvas { width: 100%; height: 100%; }
.chart-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 13px;
}
.chart-state p { margin: 0; }
</style>
