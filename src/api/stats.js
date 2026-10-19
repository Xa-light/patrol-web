import request from './request'

export const getOverview = (config = {}) => request.get('/api/v1/stats/overview', config)

export const getAlarmTrend = (hours = 24, config = {}) =>
  request.get('/api/v1/stats/alarm-trend', { params: { hours }, ...config })

export const getAlarmTypes = (config = {}) => request.get('/api/v1/stats/alarm-types', config)

export const getTaskStatus = (config = {}) => request.get('/api/v1/stats/task-status', config)

export const getBatteryTrend = (sn = 'scout01', minutes = 30, config = {}) =>
  request.get('/api/v1/stats/battery-trend', { params: { sn, minutes }, ...config })

export const getVehiclePositions = (sn = 'scout01', minutes = 10, config = {}) =>
  request.get('/api/v1/stats/vehicle-positions', { params: { sn, minutes }, ...config })
