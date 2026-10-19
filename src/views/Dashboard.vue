<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import MetricCard from '../components/MetricCard.vue'
import ChartBox from '../components/ChartBox.vue'
import StateHint from '../components/StateHint.vue'
import { getOverview, getAlarmTrend, getAlarmTypes, getTaskStatus, getBatteryTrend } from '../api/stats'
import { listAlarms } from '../api/alarm'
import { useVehicleStore } from '../stores/vehicle'
import { fmtShortTime, fmtDateTime, fmtNum, ALARM_TYPE_TEXT, ALARM_LEVEL_TEXT } from '../utils/format'

const vehicle = useVehicleStore()

const overview = ref(null)
const trend = ref([])
const types = ref([])
const taskStat = ref([])
const battery = ref([])
const recent = ref([])

const loading = ref(true)
const error = ref('')
const chartLoading = ref(true)
const trendError = ref('')
const typeError = ref('')
const taskError = ref('')
const batteryError = ref('')
const recentLoading = ref(true)

let timer = null

const COLORS = {
  blue: '#2b6cf6',
  green: '#22b573',
  amber: '#e6a23c',
  red: '#e04b3c',
  purple: '#7f77dd',
  gray: '#b4b2a9',
}

const axisCommon = {
  axisLine: { lineStyle: { color: '#e6eaf0' } },
  axisTick: { show: false },
  axisLabel: { color: '#8b95a5', fontSize: 11 },
}

async function loadAll(silent = false) {
  if (!silent) {
    loading.value = true
    error.value = ''
  }
  try {
    overview.value = await getOverview({ silent: true })
    if (!silent) loading.value = false
  } catch (e) {
    error.value = e.message || '统计接口请求失败'
    loading.value = false
  }

  if (!silent) chartLoading.value = true
  const [t, ty, ts, b, r] = await Promise.allSettled([
    getAlarmTrend(24, { silent: true }),
    getAlarmTypes({ silent: true }),
    getTaskStatus({ silent: true }),
    getBatteryTrend('scout01', 30, { silent: true }),
    listAlarms({ limit: 6 }, { silent: true }),
  ])

  if (t.status === 'fulfilled') { trend.value = t.value?.items || []; trendError.value = '' }
  else trendError.value = '报警趋势加载失败'

  if (ty.status === 'fulfilled') { types.value = ty.value?.items || []; typeError.value = '' }
  else typeError.value = '报警分布加载失败'

  if (ts.status === 'fulfilled') { taskStat.value = ts.value?.items || []; taskError.value = '' }
  else taskError.value = '任务统计加载失败'

  if (b.status === 'fulfilled') { battery.value = b.value?.items || []; batteryError.value = '' }
  else batteryError.value = '电量趋势加载失败'

  if (r.status === 'fulfilled') { recent.value = r.value?.items || [] }
  recentLoading.value = false
  chartLoading.value = false
}

const batteryOption = computed(() => {
  const items = battery.value
  if (!items.length) return {}
  const step = Math.max(1, Math.ceil(items.length / 8))
  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => (v == null ? '—' : `${Number(v).toFixed(2)} V`),
    },
    grid: { left: 46, right: 18, top: 26, bottom: 26 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: items.map((i) => fmtShortTime(i.ts)),
      ...axisCommon,
      axisLabel: { ...axisCommon.axisLabel, interval: step },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: 'V',
      nameTextStyle: { color: '#b6bfcd', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f0f3f8' } },
      ...axisCommon,
    },
    series: [
      {
        name: '电池电压',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: items.map((i) => i.battery_v),
        lineStyle: { width: 2, color: COLORS.blue },
        areaStyle: { color: 'rgba(43,108,246,0.10)' },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: 24, label: { formatter: '低电量 24V', color: '#c98118', fontSize: 11 } }],
          lineStyle: { color: COLORS.amber, type: 'dashed', width: 1 },
        },
      },
    ],
  }
})

const alarmTrendOption = computed(() => {
  const items = trend.value
  if (!items.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { right: 0, top: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#5a6577', fontSize: 11 } },
    grid: { left: 36, right: 12, top: 34, bottom: 26 },
    xAxis: {
      type: 'category',
      data: items.map((i) => i.label),
      ...axisCommon,
      axisLabel: { ...axisCommon.axisLabel, interval: 3 },
    },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f0f3f8' } }, ...axisCommon },
    series: [
      { name: '严重', type: 'bar', stack: 'a', barMaxWidth: 14, data: items.map((i) => i.critical), itemStyle: { color: COLORS.red } },
      { name: '警告', type: 'bar', stack: 'a', barMaxWidth: 14, data: items.map((i) => i.warning), itemStyle: { color: COLORS.amber } },
      { name: '提示', type: 'bar', stack: 'a', barMaxWidth: 14, data: items.map((i) => i.info), itemStyle: { color: '#c9d0da' } },
    ],
  }
})

const taskOption = computed(() => {
  const items = (taskStat.value || []).filter((i) => i.count > 0)
  if (!items.length) return {}
  const map = {
    PENDING: ['待执行', COLORS.blue],
    RUNNING: ['执行中', COLORS.green],
    PAUSED: ['已暂停', COLORS.amber],
    FINISHED: ['已完成', '#9aa4b2'],
    TERMINATED: ['已终止', COLORS.red],
  }
  return {
    tooltip: { trigger: 'item', formatter: '{b}：{c} 个（{d}%）' },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#5a6577', fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: items.map((i) => ({
          name: map[i.status]?.[0] || i.status,
          value: i.count,
          itemStyle: { color: map[i.status]?.[1] || COLORS.gray },
        })),
      },
    ],
  }
})

const typeOption = computed(() => {
  const items = types.value
  if (!items.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 74, right: 24, top: 10, bottom: 10 },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f0f3f8' } }, ...axisCommon },
    yAxis: {
      type: 'category',
      data: items.map((i) => ALARM_TYPE_TEXT[i.type] || i.type),
      ...axisCommon,
      axisLabel: { color: '#5a6577', fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 16,
        data: items.map((i) => i.count),
        itemStyle: { color: '#5b8def', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: '#8b95a5', fontSize: 11 },
      },
    ],
  }
})

const batteryPercent = computed(() => {
  const v = vehicle.battery
  if (v == null) return 0
  return Math.max(0, Math.min(100, Math.round(((v - 21) / (29 - 21)) * 100)))
})

const metrics = computed(() => {
  const o = overview.value
  return [
    {
      label: '在线车辆',
      value: o ? `${o.vehicles.online}/${o.vehicles.total}` : '—',
      hint: '车队在线率',
      icon: 'Van',
      tone: 'blue',
    },
    {
      label: '运行中任务',
      value: o ? o.tasks.running : '—',
      unit: '个',
      hint: o ? `共 ${o.tasks.total} 个任务 · 完成率 ${fmtNum(o.tasks.completionRate, 0)}%` : '',
      icon: 'List',
      tone: 'green',
    },
    {
      label: '待处理报警',
      value: o ? o.alarms.pending : '—',
      unit: '条',
      hint: o ? `其中严重 ${o.alarms.pendingCritical ?? 0} 条` : '',
      icon: 'Bell',
      tone: 'amber',
    },
    {
      label: '今日报警',
      value: o ? o.alarms.today : '—',
      unit: '条',
      hint: o ? `累计 ${o.alarms.total} 条` : '',
      icon: 'DataAnalysis',
      tone: 'red',
    },
  ]
})

function levelType(level) {
  return level === 'CRITICAL' ? 'danger' : level === 'WARNING' ? 'warning' : 'info'
}

onMounted(() => {
  loadAll()
  timer = setInterval(() => loadAll(true), 15000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="page">
    <StateHint
      v-if="error"
      type="error"
      :text="error"
      hint="请确认后端 8000 端口已启动"
      @retry="loadAll()"
    />

    <div class="metrics">
      <template v-if="loading">
        <div v-for="i in 4" :key="i" class="card metric-skeleton">
          <el-skeleton :rows="2" animated />
        </div>
      </template>
      <MetricCard
        v-for="m in metrics"
        v-else
        :key="m.label"
        :label="m.label"
        :value="m.value"
        :unit="m.unit"
        :hint="m.hint"
        :icon="m.icon"
        :tone="m.tone"
      />
    </div>

    <div class="row row-1">
      <ChartBox
        title="电池电压趋势"
        subtitle="近 30 分钟 · 实时采样"
        :option="batteryOption"
        :loading="chartLoading"
        :error="batteryError"
        :empty="!battery.length"
        empty-text="暂无遥测数据"
        height="248px"
        @retry="loadAll()"
      />
      <ChartBox
        title="任务状态分布"
        subtitle="全部任务"
        :option="taskOption"
        :loading="chartLoading"
        :error="taskError"
        :empty="!taskStat.some((i) => i.count > 0)"
        empty-text="暂无任务"
        height="248px"
        @retry="loadAll()"
      />
    </div>

    <div class="row row-2">
      <ChartBox
        title="报警趋势"
        subtitle="近 24 小时 · 按级别堆叠"
        :option="alarmTrendOption"
        :loading="chartLoading"
        :error="trendError"
        :empty="!trend.length"
        height="240px"
        @retry="loadAll()"
      />
      <ChartBox
        title="报警类型分布"
        subtitle="全部报警"
        :option="typeOption"
        :loading="chartLoading"
        :error="typeError"
        :empty="!types.length"
        height="240px"
        @retry="loadAll()"
      />
    </div>

    <div class="row row-3">
      <div class="card card-pad">
        <div class="card-head">
          <div class="card-title">最近报警 <span class="card-sub">最新 6 条</span></div>
          <router-link to="/alarms" class="link">查看全部</router-link>
        </div>

        <StateHint v-if="recentLoading" type="loading" text="加载报警…" compact />
        <StateHint v-else-if="!recent.length" type="empty" text="暂无报警记录" compact />
        <ul v-else class="alarm-list">
          <li v-for="a in recent" :key="a.alarmId" class="alarm-item">
            <span class="lv-dot" :class="a.level" />
            <div class="alarm-main">
              <div class="alarm-title">
                <b>{{ ALARM_TYPE_TEXT[a.type] || a.type }}</b>
                <el-tag size="small" :type="levelType(a.level)" effect="light">
                  {{ ALARM_LEVEL_TEXT[a.level] || a.level }}
                </el-tag>
              </div>
              <p>{{ a.message }}</p>
            </div>
            <div class="alarm-side">
              <span>{{ fmtShortTime(a.occurredAt) }}</span>
              <el-tag v-if="a.status === 'PENDING'" size="small" type="danger" effect="plain">待处理</el-tag>
              <span v-else class="done">已处理</span>
            </div>
          </li>
        </ul>
      </div>

      <div class="card card-pad">
        <div class="card-head">
          <div class="card-title">车辆实时状态 <span class="card-sub">{{ vehicle.sn }}</span></div>
          <span class="online" :class="{ on: vehicle.online }">
            {{ vehicle.online ? '在线' : '离线' }}
          </span>
        </div>

        <div class="veh-hero">
          <div class="veh-mode">{{ vehicle.mode }}</div>
          <div class="veh-speed">
            {{ fmtNum(vehicle.speed, 2) }} <span>m/s</span>
          </div>
        </div>

        <div class="veh-battery">
          <div class="battery-head">
            <span>电池</span>
            <b>{{ vehicle.battery != null ? fmtNum(vehicle.battery, 2) + ' V' : '—' }}</b>
          </div>
          <el-progress
            :percentage="batteryPercent"
            :stroke-width="8"
            :show-text="false"
            :color="batteryPercent < 30 ? '#e04b3c' : '#22b573'"
          />
        </div>

        <div class="veh-rows">
          <div><span>位姿 X</span><b>{{ vehicle.telemetry?.x != null ? fmtNum(vehicle.telemetry.x, 2) + ' m' : '—' }}</b></div>
          <div><span>位姿 Y</span><b>{{ vehicle.telemetry?.y != null ? fmtNum(vehicle.telemetry.y, 2) + ' m' : '—' }}</b></div>
          <div><span>航向</span><b>{{ vehicle.telemetry?.yaw != null ? fmtNum(vehicle.telemetry.yaw, 2) + ' rad' : '—' }}</b></div>
          <div><span>控制模式</span><b>{{ vehicle.telemetry?.control_mode ?? '—' }}</b></div>
        </div>

        <div class="veh-foot">
          <span class="dot" :class="vehicle.online ? 'on' : 'off'" />
          最后上报：{{ vehicle.lastUpdated ? fmtDateTime(vehicle.lastUpdated) : '—' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.metric-skeleton { padding: 18px; }

.row { display: grid; gap: 16px; margin-bottom: 16px; }
.row-1 { grid-template-columns: 1.55fr 1fr; }
.row-2 { grid-template-columns: 1.55fr 1fr; }
.row-3 { grid-template-columns: 1.55fr 1fr; align-items: start; }

.link { font-size: 12px; color: var(--brand); }

/* 报警列表 */
.alarm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.alarm-item {
  display: flex;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid #f2f4f8;
  align-items: flex-start;
}
.alarm-item:last-child { border-bottom: none; }
.lv-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: #c9d0da; }
.lv-dot.CRITICAL { background: var(--danger); }
.lv-dot.WARNING { background: var(--warn); }
.lv-dot.INFO { background: #9aa4b2; }
.alarm-main { flex: 1; min-width: 0; }
.alarm-title { display: flex; align-items: center; gap: 8px; }
.alarm-title b { font-size: 13px; font-weight: 500; }
.alarm-main p {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alarm-side { display: flex; align-items: center; gap: 8px; flex: none; font-size: 12px; color: var(--text-3); }
.alarm-side .done { color: #b6bfcd; }

/* 车辆卡 */
.online { font-size: 12px; color: var(--text-3); }
.online.on { color: var(--ok); }
.veh-hero {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 0 14px;
}
.veh-mode {
  font-size: 12px;
  color: var(--brand);
  background: var(--brand-weak);
  padding: 3px 10px;
  border-radius: 6px;
}
.veh-speed { font-size: 26px; font-weight: 500; }
.veh-speed span { font-size: 12px; color: var(--text-3); font-weight: 400; }
.veh-battery { margin-bottom: 14px; }
.battery-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-3); margin-bottom: 6px; }
.battery-head b { color: var(--text); font-weight: 500; }
.veh-rows { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.veh-rows > div { display: flex; flex-direction: column; gap: 2px; }
.veh-rows span { font-size: 11px; color: var(--text-3); }
.veh-rows b { font-size: 13px; font-weight: 500; }
.veh-foot {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f2f4f8;
  font-size: 11px;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 1100px) {
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .row-1, .row-2, .row-3 { grid-template-columns: 1fr; }
}
</style>
