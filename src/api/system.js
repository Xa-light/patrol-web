import request from './request'

export const listLogs = (params = {}, config = {}) =>
  request.get('/api/v1/logs', { params, ...config })

// 注意：后端用户写入接口用 snake_case（display_name / new_password），
// 读取接口返回 camelCase（displayName / userId），此处做一次适配。
export const listUsers = (config = {}) => request.get('/api/v1/users', config)

export const createUser = ({ username, password, displayName, role }) =>
  request.post('/api/v1/users', {
    username,
    password,
    display_name: displayName,
    role,
  })

export const updateUser = (userId, { displayName, role, status }) => {
  const body = {}
  if (displayName !== undefined) body.display_name = displayName
  if (role !== undefined) body.role = role
  if (status !== undefined) body.status = status
  return request.patch(`/api/v1/users/${userId}`, body)
}

export const resetPassword = (userId, newPassword) =>
  request.put(`/api/v1/users/${userId}/password`, { new_password: newPassword })

export const deleteUser = (userId) => request.delete(`/api/v1/users/${userId}`)
