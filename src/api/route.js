import request from './request'

export const listRoutes = (config = {}) => request.get('/api/v1/routes', config)

export const getRoute = (routeId) => request.get(`/api/v1/routes/${routeId}`)

export const createRoute = (payload) => request.post('/api/v1/routes', payload)

export const updateRoute = (routeId, payload) => request.put(`/api/v1/routes/${routeId}`, payload)

export const deleteRoute = (routeId) => request.delete(`/api/v1/routes/${routeId}`)
