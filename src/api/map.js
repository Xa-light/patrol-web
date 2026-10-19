import request from './request'

export const getMapMeta = (config = {}) => request.get('/api/v1/map/meta', config)
