import client from './client'

export const getOrderFormDefaults = () =>
  client.get('/orders/defaults').then((r) => r.data)

export const patchOrderFormDefaults = (body) =>
  client.patch('/orders/defaults', body).then((r) => r.data)

export const getOrders = (params = {}) =>
  client.get('/orders', { params }).then((r) => r.data)

export const getOrder = (id) => client.get(`/orders/${id}`).then((r) => r.data)

export const getOrderPayment = (orderId) =>
  client.get(`/orders/${orderId}/payment`).then((r) => r.data)

export const createOrder = (data) => client.post('/orders', data).then((r) => r.data)

export const updateStatus = (id, status, opts = {}) =>
  client
    .patch(`/orders/${id}/status`, { status, ...opts })
    .then((r) => r.data)

export const updateOrderItems = (id, details) =>
  client.patch(`/orders/${id}/items`, { details }).then((r) => r.data)

/** `body`: `{ discount_type, discount_value }` or `{ discount_type: null, discount_value: null }` to clear. */
export const patchOrderDiscount = (id, body) =>
  client.patch(`/orders/${id}/discount`, body).then((r) => r.data)

export const deleteOrder = (id) => client.delete(`/orders/${id}`)

export const serveOrderItem = (orderId, itemId, qty = 1) =>
  client.patch(`/orders/${orderId}/serve-item`, { item_id: itemId, qty }).then((r) => r.data)
