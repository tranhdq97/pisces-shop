import client from './client'

export const getOrders = (params = {}) =>
  client.get('/orders', { params }).then((r) => r.data)

export const getOrder = (id) => client.get(`/orders/${id}`).then((r) => r.data)

export const createOrder = (data) => client.post('/orders', data).then((r) => r.data)

export const updateStatus = (id, status) =>
  client.patch(`/orders/${id}/status`, { status }).then((r) => r.data)

export const updateOrderItems = (id, details) =>
  client.patch(`/orders/${id}/items`, { details }).then((r) => r.data)

export const deleteOrder = (id) => client.delete(`/orders/${id}`)

export const serveOrderItem = (orderId, itemId, qty = 1) =>
  client.patch(`/orders/${orderId}/serve-item`, { item_id: itemId, qty }).then((r) => r.data)
