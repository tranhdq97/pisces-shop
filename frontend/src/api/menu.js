import client from './client'

export const getCategories = () => client.get('/menu/categories').then((r) => r.data)

export const createCategory = (data) => client.post('/menu/categories', data).then((r) => r.data)

export const updateCategory = (id, data) => client.patch(`/menu/categories/${id}`, data).then((r) => r.data)

export const deleteCategory = (id) => client.delete(`/menu/categories/${id}`)

export const getItems = (availableOnly = false) =>
  client.get('/menu/items', { params: { available_only: availableOnly } }).then((r) => r.data)

export const createItem = (data) => client.post('/menu/items', data).then((r) => r.data)

export const updateItem = (id, data) => client.patch(`/menu/items/${id}`, data).then((r) => r.data)

export const deleteItem = (id) => client.delete(`/menu/items/${id}`)

export const setAvailability = (id, available) =>
  client.patch(`/menu/items/${id}/availability`, null, { params: { available } }).then((r) => r.data)
