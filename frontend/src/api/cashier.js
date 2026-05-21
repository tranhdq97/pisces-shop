import client from './client'

export const getCurrentShift = () =>
  client.get('/cashier/shift/current').then((r) => r.data)

export const openShift = (data) =>
  client.post('/cashier/shift/open', data).then((r) => r.data)

export const closeShift = (data) =>
  client.post('/cashier/shift/close', data).then((r) => r.data)

export const listShifts = (params = {}) =>
  client.get('/cashier/shifts', { params }).then((r) => r.data)

export const getShiftDetail = (id) =>
  client.get(`/cashier/shifts/${id}`).then((r) => r.data)

export const updatePayment = (paymentId, data) =>
  client.patch(`/cashier/payments/${paymentId}`, data).then((r) => r.data)
