import request from './request'

export const getMapMeta = (config = {}) => request.get('/api/v1/map/meta', config)

/* ---- 车端导航代理（阶段3 网页能力并入） ---- */
export const getNavState = (config = {}) => request.get('/api/v1/nav/state', config)

export const navTo = (x, y, sn = 'scout01') =>
  request.post('/api/v1/nav/goal', { x, y, sn })

export const navSetPose = (x, y, yaw = 0) =>
  request.post('/api/v1/nav/setpose', { x, y, yaw })

export const navRelocalize = () => request.post('/api/v1/nav/relocalize', {})

export const navCancel = () => request.post('/api/v1/nav/cmd', { action: 'cancel' })
