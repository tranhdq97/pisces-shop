import client from './client'
import publicClient from './publicClient'

export const getAbout = () => publicClient.get('/about').then((r) => r.data)

export const putAbout = (payload) => client.put('/about', payload).then((r) => r.data)

/** Superadmin: multipart upload (field name `file`). */
export const postAboutMedia = (formData) =>
  client.post('/about/media', formData).then((r) => r.data)

export const deleteAboutMedia = (id) => client.delete(`/about/media/${id}`)

export const patchAboutMedia = (items) =>
  client.patch('/about/media', { items }).then((r) => r.data)

/** Superadmin: multipart upload (field name `file`). Replaces TikTok QR image. */
export const postAboutTiktokQr = (formData) =>
  client.post('/about/tiktok-qr', formData).then((r) => r.data)

/** Superadmin: removes TikTok QR image. */
export const deleteAboutTiktokQr = () => client.delete('/about/tiktok-qr').then((r) => r.data)
