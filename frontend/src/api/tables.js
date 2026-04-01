import client from './client'

export const getTables = () =>
  client.get('/tables').then((r) => r.data)

export const createTable = (data) => client.post('/tables', data).then((r) => r.data)

export const payTable   = (id)  => client.patch(`/tables/${id}/pay`).then((r) => r.data)

export const clearTable = (id)  => client.patch(`/tables/${id}/clear`).then((r) => r.data)

export const updateTable = (id, data) => client.patch(`/tables/${id}`, data).then((r) => r.data)

export const deleteTable = (id) => client.delete(`/tables/${id}`)
