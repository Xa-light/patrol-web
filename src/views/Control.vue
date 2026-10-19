<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import ChartBox from '../components/ChartBox.vue'
import { drive, setEstop } from '../api/vehicle'
import { useVehicleStore } from '../stores/vehicle'
import { useAuthStore } from '../stores/auth'
import { fmtNum, fmtDateTime } from '../utils/format'

const vehicle = useVehicleStore()
const auth = useAuthStore()

const speedGear = ref(0.25)
const turnGear = ref(0.5)
const estop = ref(false)
const busy = ref('')
const logs = ref([])

const speeds = [
  { label: '慢', value: 0.15 },
  { label: '中', value: 0.25 },
  { label: '快', value: 0.4 },
]
const turns = [
  { label: '慢', value: 0.35 },
  { label: '中', value: 0.5 },
  { label: '快', value: 0.8 },
]

const DIRS = {
  forward: '前进',
  backward: '后退',
  left: '左转',
  right: '右转',
  fwd_left: '左前',
  fwd_right: '右前',
  stop: '停止',
}

function pushLog(text, ok = true) {
  logs.value.unshift({
    t: new Date().toLocaleTimeString('zh-CN'),
    text,
    ok,
  })
  if (logs.value.length > 40) logs.value.pop()
}

async function send(dir) {
  if (estop.value && dir !== 'stop') {
    ElMessage.warning('急停已锁存，请先解除急停')
    return
  }
  busy.value = dir
  const body = { direction: dir, sn: vehicle.sn, enable_demo: true }
  if (['forward', 'backward', 'fwd_left', 'fwd_right'].includes(dir)) body.speed = speedGear.value
  if (['left', 'right', 'fwd_left', 'fwd_right'].includes(dir)) body.turn = turnGear.value

  try {
    const data = await drive(body)
    const lin = data?.linear ?? 0
    const ang = data?.angular ?? 0
    pushLog(`${DIRS[dir]} → linear=${lin} angular=${ang}`)
  } catch (e) {
    pushLog(`${DIRS[dir]} 下发失败：${e.message}`, false)
  } finally {
    setTimeout(() => { busy.value = '' }, 180)
  }
}

async function toggleEstop() {
  const next = !estop.value
  try {
    await setEstop(next, vehicle.sn)
    estop.value = next
    pushLog(next ? '急停已锁存（最高优先级）' : '急停已解除', !next)
    if (next) await send('stop')
  } catch (e) {
    pushLog(`急停操作失败：${e.message}`, false)
  }
}

const KEYMAP = {
  ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'forward', s: 'backward', a: 'left', d: 'right', ' ': 'stop',
}

function onKeyDown(e) {
  const dir = KEYMAP[e.key] || KEYMAP[e.key?.toLowerCase()]
  if (!dir) return
  e.preventDefault()
  if (e.repeat) return
  send(dir)
}

function onKeyUp(e) {
  const dir = KEYMAP[e.key] || KEYMAP[e.key?.toLowerCase()]
  if (!dir || dir === 'stop') return
  send('stop')
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  if (!vehicle.vehicles.length) vehicle.refresh()
  vehicle.loadTrailHistory(3)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

const canControl = computed(() => auth.hasRole('ADMIN', 'OPERATOR'))

const gaugeOption = computed(() => ({
  series: [
    {
      type: 'gauge',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 0.8,
      splitNumber: 4,
      radius: '96%',
      center: ['50%', '60%'],
      progress: { show: true, width: 9, itemStyle: { color: '#2b6cf6' } },
      axisLine: { lineStyle: { width: 9, color: [[1, '#eef1f6']] } },
      axisTick: { show: false },
      splitLine: { length: 5, lineStyle: { color: '#d8dfea', width: 1 } },
      axisLabel: { color: '#98a2b3', fontSize: 9, distance: 10 },
      pointer: { width: 4, length: '56%', itemStyle: { color: '#2b6cf6' } },
      anchor: { show: true, size: 7, itemStyle: { color: '#2b6cf6' } },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '52%'],
        formatter: (v) => `${Number(v).toFixed(2)}`,
        color: '#1f2430',
        fontSize: 20,
        fontWeight: 600,
      },
      title: { show: true, offsetCenter: [0, '78%'], color: '#98a2b3', fontSize: 11 },
      data: [{ value: Math.abs(Number(vehicle.speed) || 0), name: 'm/s' }],
    },
  ],
}))

// 轨迹归一化到 300x180 视口
const trailPath = computed(() => {
  const pts = vehicle.trail
  if (pts.length < 2) return ''
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = Math.max(maxX - minX, 0.5)
  const h = Math.max(maxY - minY, 0.5)
  const scale = Math.min(280 / w, 160 / h)
  const ox = 10 + (280 - w * scale) / 2
  const oy = 10 + (160 - h * scale) / 2
  return pts
    .map((p, i) => {
      const x = ox + (p.x - minX) * scale
      const y = oy + (maxY - p.y) * scale
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const currentPoint = computed(() => {
  const pts = vehicle.trail
  if (!pts.length) return null
  const p = pts[pts.length - 1]
  const xs = pts.map((q) => q.x)
  const ys = pts.map((q) => q.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = Math.max(maxX - minX, 0.5), h = Math.max(maxY - minY, 0.5)
  const scale = Math.min(280 / w, 160 / h)
  const ox = 10 + (280 - w * scale) / 2
  const oy = 10 + (160 - h * scale) / 2
  return { x: ox + (p.x - minX) * scale, y: oy + (maxY - p.y) * scale }
})
</script>

<template>
  <div class="page">
    <el-alert
      v-if="!canControl"
      type="warning"
      :closable="false"
      show-icon
      title="当前角色为观察员，只能查看状态，无法下发控制指令"
      style="margin-bottom: 16px"
    />

    <div class="grid">
      <!-- 遥控区 -->
      <div class="card card-pad">
        <div class="card-head">
          <div class="card-title">方向控制 <span class="card-sub">支持键盘 ↑↓←→ / WASD</span></div>
          <span class="live" :class="{ on: vehicle.online }">
            <span class="dot" :class="vehicle.online ? 'on' : 'off'" />
            {{ vehicle.online ? '车辆在线' : '车辆离线' }}
          </span>
        </div>

        <div class="pad">
          <button class="pad-btn diag" :disabled="!canControl || !!busy" @click="send('fwd_left')">↖<small>左前</small></button>
          <button class="pad-btn" :disabled="!canControl || !!busy" @click="send('forward')">▲<small>前进</small></button>
          <button class="pad-btn diag" :disabled="!canControl || !!busy" @click="send('fwd_right')">↗<small>右前</small></button>

          <button class="pad-btn" :disabled="!canControl || !!busy" @click="send('left')">◀<small>左转</small></button>
          <button class="pad-btn stop" :disabled="!canControl || !!busy" @click="send('stop')">■<small>停止</small></button>
          <button class="pad-btn" :disabled="!canControl || !!busy" @click="send('right')">▶<small>右转</small></button>

          <span class="pad-empty" />
          <button class="pad-btn" :disabled="!canControl || !!busy" @click="send('backward')">▼<small>后退</small></button>
          <span class="pad-empty" />
        </div>

        <button
          class="estop"
          :class="{ active: estop }"
          :disabled="!canControl"
          @click="toggleEstop"
        >
          {{ estop ? '解除急停' : '⚠ 急停（锁存）' }}
        </button>

        <div class="gears">
          <div class="gear-row">
            <label>直行速度</label>
            <div class="seg">
              <button
                v-for="s in speeds"
                :key="s.value"
                :class="{ on: speedGear === s.value }"
                @click="speedGear = s.value"
              >
                {{ s.label }} {{ s.value }}
              </button>
            </div>
          </div>
          <div class="gear-row">
            <label>转向速度</label>
            <div class="seg">
              <button
                v-for="t in turns"
                :key="t.value"
                :class="{ on: turnGear === t.value }"
                @click="turnGear = t.value"
              >
                {{ t.label }} {{ t.value }}
              </button>
            </div>
          </div>
        </div>
        <p class="tip">车端仲裁层限速 0.8 m/s / 1.0 rad/s，超限会被自动夹紧；松开方向键自动停车。</p>
      </div>

      <!-- 遥测区 -->
      <div class="col">
        <div class="telem">
          <div class="telem-item">
            <span>运行模式</span>
            <b class="mode">{{ vehicle.mode }}</b>
          </div>
          <div class="telem-item">
            <span>电池电压</span>
            <b>{{ vehicle.battery != null ? fmtNum(vehicle.battery, 2) + ' V' : '—' }}</b>
          </div>
          <div class="telem-item">
            <span>线速度</span>
            <b>{{ fmtNum(vehicle.speed, 2) }} <em>m/s</em></b>
          </div>
          <div class="telem-item">
            <span>角速度</span>
            <b>{{ fmtNum(vehicle.telemetry?.w, 2) }} <em>rad/s</em></b>
          </div>
        </div>

        <div class="row">
          <ChartBox
            title="实时速度"
            subtitle="m/s"
            :option="gaugeOption"
            height="170px"
          />
          <div class="card card-pad trail-card">
            <div class="card-head">
              <div class="card-title">行驶轨迹 <span class="card-sub">近 3 分钟</span></div>
              <span class="muted mini">{{ vehicle.trail.length }} 点</span>
            </div>
            <svg v-if="trailPath" class="trail" viewBox="0 0 300 180">
              <path :d="trailPath" fill="none" stroke="#2b6cf6" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.75" />
              <circle v-if="currentPoint" :cx="currentPoint.x" :cy="currentPoint.y" r="5" fill="#2b6cf6" />
              <circle v-if="currentPoint" :cx="currentPoint.x" :cy="currentPoint.y" r="9" fill="none" stroke="#2b6cf6" opacity="0.3" />
            </svg>
            <div v-else class="trail-empty">暂无轨迹（车辆移动后自动绘制）</div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="card-head">
            <div class="card-title">位姿</div>
            <span class="muted mini">最后更新 {{ vehicle.lastUpdated ? fmtDateTime(vehicle.lastUpdated) : '—' }}</span>
          </div>
          <div class="pose">
            <div><span>X</span><b>{{ fmtNum(vehicle.telemetry?.x, 2) }}</b><em>m</em></div>
            <div><span>Y</span><b>{{ fmtNum(vehicle.telemetry?.y, 2) }}</b><em>m</em></div>
            <div><span>Yaw</span><b>{{ fmtNum(vehicle.telemetry?.yaw, 2) }}</b><em>rad</em></div>
            <div><span>控制模式</span><b>{{ vehicle.telemetry?.control_mode ?? '—' }}</b><em /></div>
          </div>
        </div>
      </div>

      <!-- 指令日志 -->
      <div class="card card-pad log-card">
        <div class="card-head">
          <div class="card-title">指令日志 <span class="card-sub">本次会话</span></div>
          <el-button text size="small" @click="logs = []">清空</el-button>
        </div>
        <div v-if="!logs.length" class="log-empty">暂无指令记录</div>
        <ul v-else class="log-list">
          <li v-for="(l, i) in logs" :key="i" :class="{ bad: !l.ok }">
            <span class="t">{{ l.t }}</span>
            <span class="txt">{{ l.text }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 16px;
  align-items: start;
}
.log-card { grid-column: 1 / -1; }
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.live { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); }
.live.on { color: var(--ok); }

.pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.pad-btn {
  height: 74px;
  border: 1px solid var(--border-strong);
  background: #fbfcfe;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 20px;
  color: var(--text);
  transition: 0.12s;
  user-select: none;
}
.pad-btn small { font-size: 11px; color: var(--text-3); }
.pad-btn:hover:not(:disabled) { background: #eef4ff; border-color: #9dbcfb; }
.pad-btn:active:not(:disabled) { background: #dfeaff; }
.pad-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pad-btn.stop { background: var(--danger-weak); border-color: #f3c1bd; color: var(--danger); }
.pad-btn.diag { font-size: 17px; }
.pad-empty { display: block; }

.estop {
  width: 100%;
  padding: 13px;
  border-radius: 10px;
  border: 2px solid var(--danger);
  background: #fff;
  color: var(--danger);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: 0.12s;
}
.estop:hover:not(:disabled) { background: var(--danger-weak); }
.estop.active { background: var(--danger); color: #fff; }
.estop:disabled { opacity: 0.45; cursor: not-allowed; }

.gears { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.gear-row { display: flex; align-items: center; gap: 12px; }
.gear-row label { width: 62px; font-size: 12px; color: var(--text-3); flex: none; }
.seg { display: flex; gap: 6px; }
.seg button {
  padding: 6px 12px;
  border: 1px solid var(--border-strong);
  background: #fff;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.seg button.on { background: var(--brand); border-color: var(--brand); color: #fff; }
.tip { font-size: 11px; color: var(--text-3); line-height: 1.6; margin: 14px 0 0; }

.telem {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.telem-item {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.telem-item span { font-size: 11px; color: var(--text-3); }
.telem-item b { font-size: 16px; font-weight: 500; }
.telem-item b.mode { font-size: 14px; color: var(--brand); }
.telem-item em { font-style: normal; font-size: 11px; color: var(--text-3); font-weight: 400; }

.row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.trail-card { display: flex; flex-direction: column; }
.trail { width: 100%; height: 150px; background: #fafbfd; border-radius: 8px; }
.trail-empty {
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #b6bfcd;
  background: #fafbfd;
  border-radius: 8px;
}
.mini { font-size: 11px; }

.pose { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.pose > div { display: flex; flex-direction: column; gap: 3px; }
.pose span { font-size: 11px; color: var(--text-3); }
.pose b { font-size: 15px; font-weight: 500; }
.pose em { font-style: normal; font-size: 11px; color: var(--text-3); }

.log-list { list-style: none; margin: 0; padding: 0; max-height: 180px; overflow-y: auto; }
.log-list li {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  border-bottom: 1px dashed #f2f4f8;
}
.log-list li .t { color: #b6bfcd; flex: none; }
.log-list li .txt { color: var(--text-2); }
.log-list li.bad .txt { color: var(--danger); }
.log-empty { font-size: 12px; color: #b6bfcd; padding: 14px 0; }

@media (max-width: 1100px) {
  .grid { grid-template-columns: 1fr; }
  .row { grid-template-columns: 1fr; }
  .telem { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
