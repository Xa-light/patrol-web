import request from './request'

export const login = (username, password) =>
  request.post('/api/v1/auth/login', { username, password })

export const getMe = () => request.get('/api/v1/auth/me')

export const logout = () => request.post('/api/v1/auth/logout')
