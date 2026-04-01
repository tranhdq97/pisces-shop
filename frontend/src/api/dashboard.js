import client from './client'

export const getSummary = (dateFrom, dateTo) =>
  client.get('/dashboard/summary', {
    params: { date_from: dateFrom, date_to: dateTo },
  }).then((r) => r.data)
