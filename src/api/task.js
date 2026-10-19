import request from './request'

export const listTasks = (params = {}, config = {}) =>
  request.get('/api/v1/tasks', { params, ...config })

export const createTask = (payload) => request.post('/api/v1/tasks', payload)

export const updateTaskStatus = (taskId, action, reason) =>
  request.patch(`/api/v1/tasks/${taskId}/status`, { action, reason })
