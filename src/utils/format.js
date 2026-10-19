export function toDate(v) {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000)
  const d = new Date(String(v).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtDateTime(v) {
  const d = toDate(v)
  if (!d) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function fmtShortTime(v) {
  const d = toDate(v)
  if (!d) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export function timeAgo(v) {
  const d = toDate(v)
  if (!d) return '—'
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (s < 60) return `${s} 秒前`
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return `${Math.floor(s / 86400)} 天前`
}

export function fmtNum(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  return Number(v).toFixed(digits)
}

export const ALARM_TYPE_TEXT = {
  OBSTACLE: '障碍物',
  LOW_BATTERY: '低电量',
  COMM_LOSS: '链路中断',
  STUCK: '卡滞受阻',
}

export const ALARM_LEVEL_TEXT = {
  INFO: '提示',
  WARNING: '警告',
  CRITICAL: '严重',
}

export const TASK_STATUS_TEXT = {
  PENDING: '待执行',
  RUNNING: '执行中',
  PAUSED: '已暂停',
  FINISHED: '已完成',
  TERMINATED: '已终止',
}

export const TASK_MODE_TEXT = {
  IMMEDIATE: '立即执行',
  SCHEDULED: '定时执行',
  RECURRING: '周期执行',
}

export const ROLE_TEXT = {
  ADMIN: '系统管理员',
  OPERATOR: '操作员',
  VIEWER: '观察员',
}
