import client from './client'

// ── Checklist ─────────────────────────────────────────────────────────────────
export const getChecklist = (forDate) =>
  client.get('/sop/checklist', { params: forDate ? { for_date: forDate } : {} }).then((r) => r.data)

export const completeTask = (taskId, forDate) =>
  client.patch(`/sop/tasks/${taskId}/complete`, null, {
    params: forDate ? { for_date: forDate } : {},
  })

export const resetTask = (taskId, forDate) =>
  client.delete(`/sop/tasks/${taskId}/complete`, {
    params: forDate ? { for_date: forDate } : {},
  })

// ── Categories ────────────────────────────────────────────────────────────────
export const getSOPCategories = () =>
  client.get('/sop/categories').then((r) => r.data)

export const createSOPCategory = (data) =>
  client.post('/sop/categories', data).then((r) => r.data)

export const updateSOPCategory = (id, data) =>
  client.patch(`/sop/categories/${id}`, data).then((r) => r.data)

export const deleteSOPCategory = (id) =>
  client.delete(`/sop/categories/${id}`)

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const createSOPTask = (data) =>
  client.post('/sop/tasks', data).then((r) => r.data)

export const updateSOPTask = (id, data) =>
  client.patch(`/sop/tasks/${id}`, data).then((r) => r.data)

export const deleteSOPTask = (id) =>
  client.delete(`/sop/tasks/${id}`)

// ── Roles (for editor role assignment) ───────────────────────────────────────
export const getSOPAvailableRoles = () =>
  client.get('/sop/available-roles').then((r) => r.data)
