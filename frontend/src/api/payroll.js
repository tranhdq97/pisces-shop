import client from './client'

export const getStaffProfiles   = () => client.get('/payroll/staff').then((r) => r.data)
export const upsertStaffProfile = (userId, data) => client.put(`/payroll/staff/${userId}`, data).then((r) => r.data)

export const getWorkEntries  = (params) => client.get('/payroll/entries', { params }).then((r) => r.data)
export const createWorkEntry = (data) => client.post('/payroll/entries', data).then((r) => r.data)
export const updateWorkEntry = (id, data) => client.patch(`/payroll/entries/${id}`, data).then((r) => r.data)
export const deleteWorkEntry = (id) => client.delete(`/payroll/entries/${id}`)
export const approveWorkEntry = (id) => client.post(`/payroll/entries/${id}/approve`).then((r) => r.data)
export const rejectWorkEntry  = (id) => client.post(`/payroll/entries/${id}/reject`).then((r) => r.data)

export const getSalaryBreakdown    = (year, month) => client.get(`/payroll/breakdown/${year}/${month}`).then((r) => r.data)
export const confirmFromBreakdown  = (year, month, userId) => client.post(`/payroll/breakdown/${year}/${month}/${userId}/confirm`).then((r) => r.data)

export const getAdjustments    = (year, month) => client.get(`/payroll/adjustments/${year}/${month}`).then((r) => r.data)
export const createAdjustment  = (year, month, data) => client.post(`/payroll/adjustments/${year}/${month}`, data).then((r) => r.data)
export const deleteAdjustment  = (id) => client.delete(`/payroll/adjustments/${id}`)

export const getPayrollRecords    = (year, month) => client.get(`/payroll/records/${year}/${month}`).then((r) => r.data)
export const upsertPayrollRecord  = (year, month, data) => client.put(`/payroll/records/${year}/${month}`, data).then((r) => r.data)
export const confirmPayrollRecord = (year, month, userId) => client.post(`/payroll/records/${year}/${month}/${userId}/confirm`).then((r) => r.data)
export const markPayrollPaid      = (year, month, userId, paidDate) => client.post(`/payroll/records/${year}/${month}/${userId}/pay`, { paid_date: paidDate }).then((r) => r.data)
