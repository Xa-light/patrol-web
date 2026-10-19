import { defineStore } from 'pinia'
import { listAlarms } from '../api/alarm'

export const useAlarmStore = defineStore('alarm', {
  state: () => ({
    pending: 0,
    critical: 0,
    total: 0,
    timer: null,
  }),

  actions: {
    async refresh() {
      try {
        const data = await listAlarms({ limit: 200 }, { silent: true })
        const items = data?.items || []
        this.total = data?.total ?? items.length
        this.pending = items.filter((a) => a.status === 'PENDING').length
        this.critical = items.filter((a) => a.level === 'CRITICAL' && a.status === 'PENDING').length
      } catch (e) {
        /* 静默 */
      }
    },

    startPolling(interval = 5000) {
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
