import client from './client'

// Login — must send as form-urlencoded (OAuth2 spec)
export const login = (email, password) => {
  const params = new URLSearchParams({ username: email, password })
  return client.post('/auth/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).then((r) => r.data)
}

export const getMe = () => client.get('/auth/me').then((r) => r.data)

export const getPendingUsers = () => client.get('/auth/pending').then((r) => r.data)

export const approveUser = (id) => client.post(`/auth/approve/${id}`).then((r) => r.data)

export const rejectUser = (id) => client.post(`/auth/reject/${id}`)

export const register = (data) => client.post('/auth/register', data).then((r) => r.data)

export const getAllUsers = () => client.get('/auth/users').then((r) => r.data)

export const updateUserRole = (id, role) => client.patch(`/auth/users/${id}/role`, { role }).then((r) => r.data)

export const setUserActive = (id, is_active) => client.patch(`/auth/users/${id}/active`, { is_active }).then((r) => r.data)

export const generateResetToken = (userId) =>
  client.post(`/auth/users/${userId}/reset-token`).then((r) => r.data)

export const resetPassword = (data) =>
  client.post('/auth/reset-password', data).then((r) => r.data)
