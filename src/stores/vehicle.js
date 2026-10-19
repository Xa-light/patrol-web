import { defineStore } from 'pinia'
import { getPatrolStatus, listVehicles } from '../api/vehicle'
import { getVehiclePositions } from '../api/stats'

export const useVehicleStore = defineStore('vehicle', {
  state: () => ({
    sn: localStorage.getItem('patrol_sn') || 'scout01',
    telemetry: null,
    vehicles: [],
    lastUpdated: 0,
    error: '',
    timer: null,
    trail: [],
  }),

  getters: {
    online: (s) => !!s.telemetry?.online,
    mode: (s) => s.telemetry?.mode || '—',
    battery: (s) => s.telemetry?.battery_v ?? null,
    speed: (s) => s.telemetry?.v ?? 0,
    currentVehicle: (s) => s.vehicles.find((v) => v.code === s.sn) || null,
  },

  actions: {
    async refresh() {
      try {
        const [tele, list] = await Promise.all([
          getPatrolStatus(this.sn, { silent: true }),
          listVehicles({ silent: true }),
        ])
        this.telemetry = tele
        this.vehicles = list?.items || []
        this.lastUpdated = Date.now()
        this.error = ''

        if (tele?.x != null && tele?.y != null) {
          const last = this.trail[this.trail.length - 1]
          if (!last || Math.hypot(last.x - tele.x, last.y - tele.y) > 0.03) {
            this.trail.push({ x: tele.x, y: tele.y, ts: Date.now() })
            if (this.trail.length > 400) this.trail.shift()
          }
        }
      } catch (e) {
        this.error = e.message || '获取车辆状态失败'
      }
    },

    setSn(sn) {
      this.sn = sn
      localStorage.setItem('patrol_sn', sn)
      this.trail = []
      this.refresh()
    },

    /** 拉取历史轨迹作为轨迹图的初始底图（近 10 分钟） */
    async loadTrailHistory(minutes = 10) {
      try {
        const res = await getVehiclePositions(this.sn, minutes, { silent: true })
        const items = res?.items || []
        if (items.length > 1) {
          this.trail = items
            .filter((p) => p.x != null && p.y != null)
            .map((p) => ({ x: p.x, y: p.y, ts: p.ts }))
          if (this.trail.length > 400) this.trail = this.trail.slice(-400)
        }
      } catch (e) {
        /* 轨迹历史失败不影响实时刷新 */
      }
    },

    startPolling(interval = 1000) {
      this.stopPolling()
      this.refresh()
      this.timer = setInterval(() => this.refresh(), interval)
    },

    stopPolling() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    },
  },
})
