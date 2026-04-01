import client from './client'

export const getInventoryItems   = () => client.get('/inventory/items').then((r) => r.data)
export const getLowStockItems    = () => client.get('/inventory/items/low-stock').then((r) => r.data)
export const createInventoryItem = (data) => client.post('/inventory/items', data).then((r) => r.data)
export const updateInventoryItem = (id, data) => client.patch(`/inventory/items/${id}`, data).then((r) => r.data)
export const deleteInventoryItem = (id) => client.delete(`/inventory/items/${id}`)

export const getAllEntries   = (params = {}) => client.get('/inventory/entries', { params }).then((r) => r.data)
export const getItemEntries = (itemId, params = {}) => client.get(`/inventory/items/${itemId}/entries`, { params }).then((r) => r.data)
export const addItemEntry   = (itemId, data) => client.post(`/inventory/items/${itemId}/entries`, data).then((r) => r.data)
