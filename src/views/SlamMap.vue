<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import StateHint from '../components/StateHint.vue'
import { getMapMeta } from '../api/map'
import { listRoutes } from '../api/route'
import { listAlarms } from '../api/alarm'
import { useVehicleStore } from '../stores/vehicle'
import { fmtNum, fmtDateTime } from '../utils/format'

const vehicle = useVehicleStore()

const meta = ref(null)
const routes = ref([])
const alarms = ref([])
const loading = ref(true)
const error = ref('')
const imgError = ref(false)
const box = ref(null)

const show = reactive({ route: true, trail: true, alarm: true })

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)

const RAD = Math.PI / 180

/** 米 → 地图像素（图片左上角为原点，y 轴向下） */
function PX(x) {
  if (!meta.value) return 0
  return (x - meta.value.origin.x) / meta.value.resolution
}
function PY(y) {
  if (!meta.value) return 0
  return meta.value.height - (y - meta.value.origin.y) / meta.value.resolution
}

const transform = computed(
  () => `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`
)

/* ---------------- 数据 ---------------- */
async function load() {
  loading.value = true
  error.value = ''
  try {
    const [m, r, a] = await Promise.all([
      getMapMeta(),
      listRoutes({ silent: true }),
      listAlarms({ status: 'PENDING', limit: 30 }, { silent: true }),
    ])
    meta.value = m
    routes.value = r?.items || []
    alarms.value = (a?.items || []).filter((x) => x.position?.x != null)
  } catch (e) {
    error.value = e.message || '地图加载失败'
  } finally {
    loading.value = false
  }
  // 必须等 v-else 分支渲染出 .map-box 之后才能量尺寸
  await nextTick()
  if (!error.value) fitRoute()
}

/* ---------------- 视图控制 ---------------- */
function fitBounds(minX, minY, maxX, maxY, pad = 0.92) {
  const el = box.value
  if (!el) return
  const cw = el.clientWidth
  const ch = el.clientHeight
  const bw = Math.max(maxX - minX, 1)
  const bh = Math.max(maxY - minY, 1)
  const s = Math.min(cw / bw, ch / bh) * pad
  scale.value = s
  tx.value = cw / 2 - s * (minX + bw / 2)
  ty.value = ch / 2 - s * (minY + bh / 2)
}

function fitAll() {
  if (!meta.value) return
  fitBounds(0, 0, meta.value.width, meta.value.height, 0.96)
}

function fitRoute() {
  if (!meta.value) return
  const xs = []
  const ys = []
  routes.value.forEach((r) => (r.waypoints || []).forEach((w) => {
    xs.push(PX(w.x))
    ys.push(PY(w.y))
  }))
  const t = vehicle.telemetry
  if (t?.x != null) {
    xs.push(PX(t.x))
    ys.push(PY(t.y))
  }
  if (!xs.length) {
    fitAll()
    return
  }
  const padPx = 6 / meta.value.resolution // 外扩 6 m
  fitBounds(
    Math.min(...xs) - padPx,
    Math.min(...ys) - padPx,
    Math.max(...xs) + padPx,
    Math.max(...ys) + padPx,
    0.94
  )
}

function zoomBy(factor, cx, cy) {
  const el = box.value
  if (!el) return
  const px = cx ?? el.clientWidth / 2
  const py = cy ?? el.clientHeight / 2
  const next = Math.min(20, Math.max(0.15, scale.value * factor))
  const k = next / scale.value
  tx.value = px - (px - tx.value) * k
  ty.value = py - (py - ty.value) * k
  scale.value = next
}

function onWheel(e) {
  e.preventDefault()
  const rect = box.value.getBoundingClientRect()
  zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - rect.left, e.clientY - rect.top)
}

let drag = null
function onDown(e) {
  if (e.button !== 0) return
  drag = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
function onMove(e) {
  if (!drag) return
  tx.value = drag.tx + (e.clientX - drag.x)
  ty.value = drag.ty + (e.clientY - drag.y)
}
function onUp() {
  drag = null
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
}

function onResize() {
  fitRoute()
}

/* ---------------- 叠加层数据 ---------------- */
const routeShapes = computed(() =>
  routes.value
    .filter((r) => (r.waypoints || []).length >= 2)
    .map((r) => ({
      id: r.routeId,
      name: r.name,
      points: r.waypoints.map((w) => `${PX(w.x).toFixed(1)},${PY(w.y).toFixed(1)}`).join(' '),
      closed: r.waypoints.length >= 3,
    }))
)

const trailPoints = computed(() =>
  vehicle.trail.map((p) => `${PX(p.x).toFixed(1)},${PY(p.y).toFixed(1)}`).join(' ')
)

const veh = computed(() => {
  const t = vehicle.telemetry
  if (!t || t.x == null || t.y == null) return null
  return {
    x: PX(t.x),
    y: PY(t.y),
    deg: -Number(t.yaw || 0) / RAD,
  }
})

const alarmPins = computed(() =>
  alarms.value.map((a) => ({
    id: a.alarmId,
    x: PX(a.position.x),
    y: PY(a.position.y),
    level: a.level,
  }))
)

const waypointDots = computed(() => {
  const out = []
  routes.value.forEach((r) => (r.waypoints || []).forEach((w, i) => {
    out.push({ key: `${r.routeId}-${i}`, x: PX(w.x), y: PY(w.y), idx: i })
  }))
  return out
})

/* ---------------- 比例尺 ---------------- */
const scaleBar = computed(() => {
  if (!meta.value) return null
  const pxPerM = (1 / meta.value.resolution) * scale.value
  const candidates = [50, 20, 10, 5, 2, 1]
  const meters = candidates.find((m) => m * pxPerM <= 140) || 1
  return { meters, width: meters * pxPerM }
})

const coverage = computed(() => {
  const b = meta.value?.bounds
  if (!b) return '—'
  return `${(b.maxX - b.minX).toFixed(1)} × ${(b.maxY - b.minY).toFixed(1)} m`
})

const mapArea = computed(() => {
  const b = meta.value?.bounds
  if (!b) return '—'
  return ((b.maxX - b.minX) * (b.maxY - b.minY)).toFixed(0)
})

onMounted(async () => {
  if (!vehicle.vehicles.length) vehicle.refresh()
  vehicle.loadTrailHistory(3)
  await load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
})
</script>

<template>
  <div class="page">
    <StateHint v-if="error" type="error" :text="error" @retry="load" />
    <div v-else-if="loading" class="card card-pad">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else class="map-layout">
      <!-- 地图画布 -->
      <div class="card map-card">
        <div class="map-toolbar">
          <div class="card-title">
            SLAM 建图 <span class="card-sub">{{ meta.name }} · map 坐标系</span>
          </div>
          <div class="tools">
            <el-button-group size="small">
              <el-button @click="fitAll">全图</el-button>
              <el-button @click="fitRoute">聚焦巡逻区</el-button>
            </el-button-group>
            <el-button-group size="small">
              <el-button @click="zoomBy(1.3)">＋</el-button>
              <el-button @click="zoomBy(1 / 1.3)">－</el-button>
            </el-button-group>
            <el-button size="small" @click="load">刷新</el-button>
          </div>
        </div>

        <div ref="box" class="map-box" @wheel="onWheel" @mousedown="onDown">
          <div class="map-stage" :style="{ transform }">
            <img
              class="map-img"
              :src="meta.imageUrl"
              :width="meta.width"
              :height="meta.height"
              alt="SLAM 地图"
              draggable="false"
              @error="imgError = true"
            />
            <svg
              class="map-svg"
              :viewBox="`0 0 ${meta.width} ${meta.height}`"
              :width="meta.width"
              :height="meta.height"
            >
              <!-- 巡逻路线 -->
              <template v-if="show.route">
                <g v-for="s in routeShapes" :key="s.id">
                  <polygon
                    v-if="s.closed"
                    :points="s.points"
                    fill="rgba(43,108,246,0.10)"
                    stroke="#2b6cf6"
                    stroke-width="2"
                    stroke-dasharray="7 4"
                  />
                  <polyline
                    v-else
                    :points="s.points"
                    fill="none"
                    stroke="#2b6cf6"
                    stroke-width="2"
                    stroke-dasharray="7 4"
                  />
                </g>
                <circle
                  v-for="w in waypointDots"
                  :key="w.key"
                  :cx="w.x"
                  :cy="w.y"
                  r="4.5"
                  fill="#fff"
                  stroke="#2b6cf6"
                  stroke-width="2"
                />
              </template>

              <!-- 历史轨迹 -->
              <polyline
                v-if="show.trail && trailPoints"
                :points="trailPoints"
                fill="none"
                stroke="#1c9a63"
                stroke-width="2.2"
                stroke-linejoin="round"
                opacity="0.55"
              />

              <!-- 报警点 -->
              <g v-if="show.alarm">
                <g v-for="a in alarmPins" :key="a.id">
                  <circle
                    :cx="a.x"
                    :cy="a.y"
                    r="7"
                    :fill="a.level === 'CRITICAL' ? '#cf4436' : '#e6a23c'"
                    opacity="0.85"
                  />
                  <circle
                    :cx="a.x"
                    :cy="a.y"
                    r="13"
                    :stroke="a.level === 'CRITICAL' ? '#cf4436' : '#e6a23c'"
                    fill="none"
                    opacity="0.35"
                    stroke-width="2"
                  />
                </g>
              </g>

              <!-- 车辆位姿 -->
              <g v-if="veh" :transform="`translate(${veh.x},${veh.y}) rotate(${veh.deg})`">
                <circle r="15" fill="#2b6cf6" opacity="0.14" />
                <circle r="8.5" fill="#2b6cf6" stroke="#fff" stroke-width="2" />
                <path d="M8.5 0 L20 0" stroke="#2b6cf6" stroke-width="3" stroke-linecap="round" />
                <path d="M20 -4.5 L27 0 L20 4.5 Z" fill="#2b6cf6" />
              </g>
            </svg>
          </div>

          <div v-if="imgError" class="map-mask">
            <el-icon><Picture /></el-icon>
            <span>地图图片加载失败，请检查后端 /static/maps 目录</span>
          </div>

          <div class="map-legend">
            <span><i class="lg route" />巡逻路线</span>
            <span><i class="lg trail" />历史轨迹</span>
            <span><i class="lg alarm" />报警点</span>
            <span><i class="lg car" />车辆</span>
          </div>

          <div v-if="scaleBar" class="scale-bar">
            <div class="bar" :style="{ width: scaleBar.width + 'px' }" />
            <span>{{ scaleBar.meters }} m</span>
          </div>

          <div class="zoom-hint">滚轮缩放 · 按住拖拽平移</div>
        </div>
      </div>

      <!-- 侧栏 -->
      <div class="side">
        <div class="card card-pad">
          <div class="card-head">
            <div class="card-title">地图信息</div>
            <el-tag size="small" type="success" effect="light">已建图</el-tag>
          </div>
          <div class="kv">
            <div><span>场景</span><b>{{ meta.name }}</b></div>
            <div><span>坐标系</span><b class="mono">{{ meta.frame }}</b></div>
            <div><span>分辨率</span><b>{{ meta.resolution }} m/px</b></div>
            <div><span>栅格尺寸</span><b>{{ meta.width }} × {{ meta.height }}</b></div>
            <div><span>覆盖范围</span><b>{{ coverage }}</b></div>
            <div><span>覆盖面积</span><b>{{ mapArea }} m²</b></div>
            <div><span>原点</span><b class="mono">{{ meta.origin.x }}, {{ meta.origin.y }}</b></div>
            <div><span>建图时间</span><b>{{ fmtDateTime(meta.builtAt) }}</b></div>
          </div>
          <div class="src">{{ meta.source }}</div>
        </div>

        <div class="card card-pad">
          <div class="card-head">
            <div class="card-title">车辆在图中位置</div>
            <span class="live" :class="{ on: vehicle.online }">
              <span class="dot" :class="vehicle.online ? 'on' : 'off'" />
              {{ vehicle.online ? '在线' : '离线' }}
            </span>
          </div>
          <div class="pose">
            <div><span>X</span><b>{{ fmtNum(vehicle.telemetry?.x, 2) }}</b><em>m</em></div>
            <div><span>Y</span><b>{{ fmtNum(vehicle.telemetry?.y, 2) }}</b><em>m</em></div>
            <div><span>Yaw</span><b>{{ fmtNum(vehicle.telemetry?.yaw, 2) }}</b><em>rad</em></div>
          </div>
          <div class="pose-mini">
            <div><span>模式</span><b>{{ vehicle.mode }}</b></div>
            <div><span>速度</span><b>{{ fmtNum(vehicle.speed, 2) }} m/s</b></div>
            <div><span>电量</span><b>{{ vehicle.battery != null ? fmtNum(vehicle.battery, 1) + ' V' : '—' }}</b></div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="card-head">
            <div class="card-title">图层</div>
          </div>
          <div class="layers">
            <label><el-switch v-model="show.route" size="small" /> 巡逻路线（{{ routeShapes.length }} 条）</label>
            <label><el-switch v-model="show.trail" size="small" /> 历史轨迹（{{ vehicle.trail.length }} 点）</label>
            <label><el-switch v-model="show.alarm" size="small" /> 待处理报警（{{ alarmPins.length }} 个）</label>
          </div>
          <div class="tip">
            地图为阶段3 车端 gmapping 建图结果，白=可通行、深灰=障碍、浅灰=未探索。
            车辆位姿来自云端遥测，1s 刷新。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}
.map-card {
  padding: 14px 14px 0;
  display: flex;
  flex-direction: column;
}
.map-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 4px 12px;
}
.tools { display: flex; gap: 8px; align-items: center; }

.map-box {
  position: relative;
  height: calc(100vh - 230px);
  min-height: 460px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #eef1f6;
  cursor: grab;
  user-select: none;
}
.map-box:active { cursor: grabbing; }

.map-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}
.map-img { display: block; image-rendering: pixelated; }
.map-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.map-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-3);
  font-size: 13px;
}
.map-mask .el-icon { font-size: 28px; }

.map-legend {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  gap: 14px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--text-2);
  backdrop-filter: blur(4px);
}
.map-legend span { display: flex; align-items: center; gap: 6px; }
.lg { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
.lg.route { background: #2b6cf6; }
.lg.trail { background: #1c9a63; opacity: 0.7; }
.lg.alarm { width: 9px; height: 9px; border-radius: 50%; background: #cf4436; }
.lg.car { width: 9px; height: 9px; border-radius: 50%; background: #2b6cf6; }

.scale-bar {
  position: absolute;
  left: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--text-2);
}
.scale-bar .bar {
  height: 4px;
  border: 1px solid #5a6577;
  border-top: none;
  background: rgba(255, 255, 255, 0.8);
}
.zoom-hint {
  position: absolute;
  right: 12px;
  bottom: 12px;
  font-size: 11px;
  color: var(--text-3);
  background: rgba(255, 255, 255, 0.85);
  padding: 4px 8px;
  border-radius: 6px;
}

.side { display: flex; flex-direction: column; gap: 14px; }
.kv { display: flex; flex-direction: column; gap: 9px; margin-top: 4px; }
.kv > div { display: flex; justify-content: space-between; font-size: 12.5px; gap: 10px; }
.kv span { color: var(--text-3); flex: none; }
.kv b { font-weight: 500; color: var(--text); text-align: right; }
.src {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}

.live { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); }
.live.on { color: var(--ok); }

.pose { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0 10px; }
.pose > div {
  background: #fafbfd;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pose span { font-size: 11px; color: var(--text-3); }
.pose b { font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }
.pose em { font-size: 10px; color: var(--text-3); font-style: normal; }

.pose-mini { display: flex; flex-direction: column; gap: 7px; }
.pose-mini > div { display: flex; justify-content: space-between; font-size: 12.5px; }
.pose-mini span { color: var(--text-3); }
.pose-mini b { font-weight: 500; }

.layers { display: flex; flex-direction: column; gap: 10px; margin-top: 2px; }
.layers label { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-2); }
.tip { margin-top: 12px; font-size: 11.5px; color: var(--text-3); line-height: 1.7; }

@media (max-width: 1280px) {
  .map-layout { grid-template-columns: minmax(0, 1fr); }
  .side { flex-direction: row; flex-wrap: wrap; }
  .side > .card { flex: 1 1 260px; }
}
</style>
