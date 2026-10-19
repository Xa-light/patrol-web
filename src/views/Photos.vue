<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import StateHint from '../components/StateHint.vue'
import { listPhotos, capturePhoto } from '../api/vehicle'
import { useVehicleStore } from '../stores/vehicle'
import { useAuthStore } from '../stores/auth'
import { fmtDateTime } from '../utils/format'

const vehicle = useVehicleStore()
const auth = useAuthStore()

const rows = ref([])
const loading = ref(true)
const error = ref('')
const capturing = ref(false)
const reason = ref('manual')

const REASONS = [
  { label: '手动抓拍', value: 'manual' },
  { label: '报警抓拍', value: 'alert' },
  { label: '例行巡检', value: 'patrol' },
  { label: '云端抓拍', value: 'cloud' },
]

const canCapture = computed(() => auth.hasRole('ADMIN', 'OPERATOR'))

const totalSize = computed(() =>
  rows.value.reduce((s, p) => s + (p.size || 0), 0)
)
const lastTime = computed(() =>
  rows.value.length ? rows.value[0].uploadedAt : ''
)

const previewList = computed(() => rows.value.map((p) => p.url))

function fmtSize(n) {
  if (!n) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

function reasonText(v) {
  return REASONS.find((r) => r.value === v)?.label || v || '—'
}

async function load(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const res = await listPhotos({ limit: 100 }, { silent: true })
    rows.value = res?.items || []
  } catch (e) {
    error.value = e.message || '照片加载失败'
  } finally {
    loading.value = false
  }
}

async function shoot() {
  if (!canCapture.value) return
  capturing.value = true
  try {
    await capturePhoto(vehicle.sn, reason.value)
    ElMessage.success('已下发抓拍指令，车端回传后自动出现')
    // 车端拍照 + HTTP 上传有延迟，2.2s 后刷新
    setTimeout(() => load(true), 2200)
  } catch (e) {
    ElMessage.error(e.message || '抓拍失败')
  } finally {
    setTimeout(() => { capturing.value = false }, 600)
  }
}

onMounted(() => {
  load()
  if (!vehicle.vehicles.length) vehicle.refresh()
})
</script>

<template>
  <div class="page">
    <div class="page-toolbar">
      <div class="summary">
        <span>共 <b>{{ rows.length }}</b> 张</span>
        <span class="sep">·</span>
        <span>占用 <b>{{ fmtSize(totalSize) }}</b></span>
        <span class="sep">·</span>
        <span>最近抓拍 <b>{{ lastTime ? fmtDateTime(lastTime) : '—' }}</b></span>
      </div>
      <div class="tools">
        <el-select v-model="reason" size="default" style="width: 128px" :disabled="!canCapture">
          <el-option v-for="r in REASONS" :key="r.value" :label="r.label" :value="r.value" />
        </el-select>
        <el-button :disabled="!canCapture" :loading="capturing" type="primary" :icon="'Camera'" @click="shoot">
          立即抓拍
        </el-button>
        <el-button :icon="'Refresh'" @click="load()">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="!canCapture"
      type="info"
      :closable="false"
      show-icon
      title="当前角色为只读，只能查看抓拍记录"
      style="margin-bottom: 14px"
    />

    <StateHint v-if="error" type="error" :text="error" @retry="load()" />
    <div v-else-if="loading" class="grid">
      <div v-for="i in 8" :key="i" class="card photo-card">
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="image" style="width: 100%; height: 132px" />
            <div style="padding: 10px 12px">
              <el-skeleton-item variant="text" style="width: 60%" />
            </div>
          </template>
        </el-skeleton>
      </div>
    </div>

    <StateHint
      v-else-if="!rows.length"
      type="empty"
      text="还没有抓拍记录，点右上角「立即抓拍」试一下"
    />

    <div v-else class="grid">
      <div v-for="p in rows" :key="p.photoId" class="card photo-card">
        <el-image
          class="thumb"
          :src="p.url"
          :preview-src-list="previewList"
          :initial-index="rows.findIndex((x) => x.photoId === p.photoId)"
          fit="cover"
          preview-teleported
          hide-on-click-modal
        >
          <template #error>
            <div class="thumb-err">图片无法加载</div>
          </template>
        </el-image>
        <div class="meta">
          <div class="line">
            <el-tag size="small" effect="plain">{{ reasonText(p.reason) }}</el-tag>
            <span class="size">{{ fmtSize(p.size) }}</span>
          </div>
          <div class="time">{{ fmtDateTime(p.uploadedAt) }}</div>
          <div class="sn mono">{{ p.sn }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-toolbar { align-items: center; }
.summary { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-3); }
.summary b { color: var(--text); font-weight: 500; }
.summary .sep { color: var(--border-strong, #d8dee9); }
.tools { display: flex; gap: 8px; align-items: center; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 14px;
}
.photo-card { overflow: hidden; }
.thumb {
  display: block;
  width: 100%;
  height: 132px;
  background: #f3f5f9;
  cursor: zoom-in;
}
.thumb-err {
  width: 100%;
  height: 132px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-3);
  background: #f3f5f9;
}
.meta { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 5px; }
.meta .line { display: flex; align-items: center; justify-content: space-between; }
.meta .size { font-size: 11.5px; color: var(--text-3); }
.meta .time { font-size: 11.5px; color: var(--text-3); }
.meta .sn { font-size: 11px; color: var(--text-3); }
</style>
