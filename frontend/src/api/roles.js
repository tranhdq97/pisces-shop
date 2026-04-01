import client from './client'

export const getRoles = () =>
  client.get('/roles').then((r) => r.data)

export const getAvailablePermissions = () =>
  client.get('/roles/available-permissions').then((r) => r.data)

export const createRole = (data) =>
  client.post('/roles', data).then((r) => r.data)

export const assignPermissions = (roleName, permissions) =>
  client.put(`/roles/${roleName}/permissions`, { permissions }).then((r) => r.data)

export const deleteRole = (roleName) =>
  client.delete(`/roles/${roleName}`)
