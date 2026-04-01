import client from './client'

export const getPnL = (year, month) =>
  client.get('/financials/pnl', { params: { year, month } }).then((r) => r.data)

export const getYearlyPnL = (year) =>
  client.get('/financials/pnl/yearly', { params: { year } }).then((r) => r.data)

export const getTemplates = () =>
  client.get('/financials/templates').then((r) => r.data)

export const createTemplate = (data) =>
  client.post('/financials/templates', data).then((r) => r.data)

export const updateTemplate = (id, data) =>
  client.patch(`/financials/templates/${id}`, data).then((r) => r.data)

export const deleteTemplate = (id) =>
  client.delete(`/financials/templates/${id}`).then((r) => r.data)

export const getEntries = (year, month) =>
  client.get('/financials/entries', { params: { year, month } }).then((r) => r.data)

export const createEntry = (year, month, data) =>
  client.post('/financials/entries', data, { params: { year, month } }).then((r) => r.data)

export const deleteEntry = (id) =>
  client.delete(`/financials/entries/${id}`).then((r) => r.data)
