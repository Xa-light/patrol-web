import request from './request'

export const listVehicles = (config = {}) => request.get('/api/v1/vehicles', config)

export const getVehicle = (vehicleId) => request.get(`/api/v1/vehicles/${vehicleId}`)

export const getPatrolStatus = (sn = 'scout01', config = {}) =>
  request.get('/api/v1/patrol/status', { params: { sn }, ...config })

export const drive = (payload) => request.post('/api/v1/remote/drive', payload)

export const stopVehicle = (sn) => request.post('/api/v1/remote/stop', null, { params: { sn } })

export const setEstop = (state, sn = 'scout01') =>
  request.post('/api/v1/remote/estop', null, { params: { state, sn } })

export const startPatrol = (sn = 'scout01') => request.post('/api/v1/patrol/start', { sn })

export const stopPatrol = (sn = 'scout01') => request.post('/api/v1/patrol/stop', { sn })

export const capturePhoto = (sn = 'scout01', reason = 'cloud') =>
  request.post('/api/v1/photo/capture', { sn, reason })

export const listMqttPhotos = (params = {}, config = {}) =>
  request.get('/api/v1/mqtt/photos', { params, ...config })
