import request from './request'

/* ---------------- 车辆 CRUD ---------------- */
export const listVehicles = (config = {}) => request.get('/api/v1/vehicles', config)

export const getVehicle = (vehicleId) => request.get(`/api/v1/vehicles/${vehicleId}`)

export const createVehicle = (payload) => request.post('/api/v1/vehicles', payload)

export const updateVehicle = (vehicleId, payload) =>
  request.patch(`/api/v1/vehicles/${vehicleId}`, payload)

export const deleteVehicle = (vehicleId) => request.delete(`/api/v1/vehicles/${vehicleId}`)

/* 车端状态上报（一般由车端调用，网页侧用于手动纠正状态） */
export const reportVehicleStatus = (vehicleId, payload) =>
  request.post(`/api/v1/vehicles/${vehicleId}/status`, payload)

/* 车端最新遥测（单帧快照） */
export const getLatestTelemetry = (vehicleId, config = {}) =>
  request.get(`/api/v1/vehicles/${vehicleId}/telemetry/latest`, config)

/* 下发控制指令：action = MOTION | EMERGENCY_STOP | LIGHT */
export const sendVehicleCommand = (vehicleId, payload) =>
  request.post(`/api/v1/vehicles/${vehicleId}/commands`, payload)

/* ---------------- 巡逻 / 遥控 ---------------- */
export const getPatrolStatus = (sn = 'scout01', config = {}) =>
  request.get('/api/v1/patrol/status', { params: { sn }, ...config })

export const drive = (payload) => request.post('/api/v1/remote/drive', payload)

export const stopVehicle = (sn) => request.post('/api/v1/remote/stop', null, { params: { sn } })

export const setEstop = (state, sn = 'scout01') =>
  request.post('/api/v1/remote/estop', null, { params: { state, sn } })

export const startPatrol = (sn = 'scout01') => request.post('/api/v1/patrol/start', { sn })

export const stopPatrol = (sn = 'scout01') => request.post('/api/v1/patrol/stop', { sn })

/* ---------------- 抓拍 ---------------- */
export const capturePhoto = (sn = 'scout01', reason = 'cloud') =>
  request.post('/api/v1/photo/capture', { sn, reason })

export const listPhotos = (params = {}, config = {}) =>
  request.get('/api/v1/photos', { params, ...config })

export const getPhoto = (photoId) => request.get(`/api/v1/photos/${photoId}`)

export const listMqttPhotos = (params = {}, config = {}) =>
  request.get('/api/v1/mqtt/photos', { params, ...config })
