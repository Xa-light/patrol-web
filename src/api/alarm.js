import request from './request'

export const listAlarms = (params = {}, config = {}) =>
  request.get('/api/v1/alarms', { params, ...config })

export const getAlarm = (alarmId) => request.get(`/api/v1/alarms/${alarmId}`)

/* 手动上报报警（车端异常时人工补录） */
export const createAlarm = (payload) => request.post('/api/v1/alarms', payload)

export const handleAlarm = (alarmId, status, handleComment) =>
  request.patch(`/api/v1/alarms/${alarmId}`, { status, handleComment })

export const listLiveAlerts = (params = {}, config = {}) =>
  request.get('/api/v1/alerts', { params, ...config })
