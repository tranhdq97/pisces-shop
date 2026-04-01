import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Trash2, Upload } from 'lucide-react'
import Layout from '../components/Layout'
import Button from '../components/Button'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import {
  deleteAboutMedia,
  deleteAboutTiktokQr,
  getAbout,
  patchAboutMedia,
  postAboutMedia,
  postAboutTiktokQr,
  putAbout,
} from '../api/about'
import { useT } from '../i18n'
import { apiErr } from '../api/apiErr'

function orderedMediaRows(rows) {
  return [...rows.filter((r) => r.media_type === 'image'), ...rows.filter((r) => r.media_type === 'video')]
}

export default function AboutAdmin() {
  const { t } = useT()
  const qc = useQueryClient()
  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const tiktokQrInputRef = useRef(null)
  const { data, isLoading } = useQuery({ queryKey: ['about-public'], queryFn: getAbout })

  const [restaurantIntro, setRestaurantIntro] = useState('')
  const [workshopIntro, setWorkshopIntro] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactAddress, setContactAddress] = useState('')
  const [socialFacebookUrl, setSocialFacebookUrl] = useState('')
  const [socialZaloPhone, setSocialZaloPhone] = useState('')
  const [socialTiktokUrl, setSocialTiktokUrl] = useState('')
  const [mediaRows, setMediaRows] = useState([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadingVideos, setUploadingVideos] = useState(false)
  const [uploadingTiktokQr, setUploadingTiktokQr] = useState(false)

  useEffect(() => {
    if (!data) return
    setRestaurantIntro(data.restaurant_intro ?? '')
    setWorkshopIntro(data.workshop_intro ?? '')
    setContactPhone(data.contact_phone ?? '')
    setContactEmail(data.contact_email ?? '')
    setContactAddress(data.contact_address ?? '')
    setSocialFacebookUrl(data.social_facebook_url ?? '')
    setSocialZaloPhone(data.social_zalo_phone ?? '')
    setSocialTiktokUrl(data.social_tiktok_url ?? '')
    setMediaRows(
      orderedMediaRows(
        (data.media ?? []).map((m) => ({
          id: m.id,
          media_type: m.media_type,
          url: m.url,
          caption: m.caption ?? '',
        }))
      )
    )
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await putAbout({
        restaurant_intro: restaurantIntro,
        workshop_intro: workshopIntro,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_address: contactAddress.trim() || null,
        social_facebook_url: socialFacebookUrl.trim() || null,
        social_zalo_phone: socialZaloPhone.trim() || null,
        social_tiktok_url: socialTiktokUrl.trim() || null,
      })
      const ordered = orderedMediaRows(mediaRows)
      const items = ordered.map((row, i) => ({
        id: row.id,
        caption: row.caption.trim() || null,
        sort_order: i,
      }))
      if (items.length) await patchAboutMedia(items)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['about-public'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: (err) => setError(apiErr(err, t)),
  })

  const handleSave = (e) => {
    e.preventDefault()
    setError('')
    saveMutation.mutate()
  }

  const uploadMany = async (fileList, setBusy) => {
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList || [])
    if (!files.length) return
    setError('')
    setBusy(true)
    try {
      await Promise.all(
        files.map((file) => {
          const fd = new FormData()
          fd.append('file', file)
          return postAboutMedia(fd)
        })
      )
      await qc.invalidateQueries({ queryKey: ['about-public'] })
    } catch (err) {
      setError(apiErr(err, t))
    } finally {
      setBusy(false)
    }
  }

  const onImageFiles = async (e) => {
    // Copy File[] before clearing input — clearing first empties FileList in some browsers (no network call).
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    await uploadMany(files, setUploadingImages)
  }

  const onVideoFiles = async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    await uploadMany(files, setUploadingVideos)
  }

  const onTiktokQrFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setUploadingTiktokQr(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await postAboutTiktokQr(fd)
      await qc.invalidateQueries({ queryKey: ['about-public'] })
    } catch (err) {
      setError(apiErr(err, t))
    } finally {
      setUploadingTiktokQr(false)
    }
  }

  const removeTiktokQr = async () => {
    setError('')
    try {
      await deleteAboutTiktokQr()
      await qc.invalidateQueries({ queryKey: ['about-public'] })
    } catch (err) {
      setError(apiErr(err, t))
    }
  }

  const removeMedia = async (id) => {
    setError('')
    try {
      await deleteAboutMedia(id)
      await qc.invalidateQueries({ queryKey: ['about-public'] })
    } catch (err) {
      setError(apiErr(err, t))
    }
  }

  const moveInSection = (section, id, dir) => {
    setMediaRows((rows) => {
      const imgs = rows.filter((r) => r.media_type === 'image')
      const vids = rows.filter((r) => r.media_type === 'video')
      const arr = section === 'image' ? [...imgs] : [...vids]
      const idx = arr.findIndex((r) => r.id === id)
      const j = idx + dir
      if (idx < 0 || j < 0 || j >= arr.length) return rows
      const next = [...arr]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return section === 'image' ? [...next, ...vids] : [...imgs, ...next]
    })
  }

  const imageRows = mediaRows.filter((r) => r.media_type === 'image')
  const videoRows = mediaRows.filter((r) => r.media_type === 'video')

  const renderStrip = (section, rows) => (
    <div className="overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth">
      <div className="flex flex-nowrap items-center gap-4 w-max max-w-full">
        {rows.length === 0 && (
          <div className="shrink-0 w-52 rounded-xl border border-dashed border-border bg-slate-50 aspect-[4/3] flex items-center justify-center text-xs text-muted px-2 text-center">
            {section === 'image' ? t('about_admin.empty_images') : t('about_admin.empty_videos')}
          </div>
        )}
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="shrink-0 w-max max-w-[min(92vw,20rem)] rounded-xl border border-border bg-card p-3 flex flex-col gap-2 shadow-sm"
          >
            <div className="rounded-lg border border-border bg-slate-100 flex items-center justify-center overflow-hidden p-1">
              {row.media_type === 'image' ? (
                <img
                  src={row.url}
                  alt=""
                  loading="lazy"
                  className="block max-h-[min(42vh,16rem)] max-w-[min(88vw,18rem)] w-auto h-auto object-contain"
                />
              ) : (
                <video
                  src={row.url}
                  className="block max-h-[min(42vh,16rem)] max-w-[min(88vw,18rem)] w-auto h-auto object-contain"
                  muted
                  playsInline
                />
              )}
            </div>
            <Input
              label={t('common.desc_opt')}
              value={row.caption}
              onChange={(e) =>
                setMediaRows((all) =>
                  all.map((r) => (r.id === row.id ? { ...r, caption: e.target.value } : r))
                )
              }
            />
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                type="button"
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                onClick={() => moveInSection(section, row.id, -1)}
                disabled={i === 0}
                aria-label={t('about_admin.move_left')}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => removeMedia(row.id)}
                className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                aria-label={t('common.delete')}
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                onClick={() => moveInSection(section, row.id, 1)}
                disabled={i === rows.length - 1}
                aria-label={t('about_admin.move_right')}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (isLoading && !data) {
    return (
      <Layout title={t('about_admin.title')}>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={t('about_admin.title')}>
      <p className="text-sm text-muted mb-6 max-w-3xl">{t('about_admin.blurb')}</p>

      <form onSubmit={handleSave} className="max-w-5xl space-y-8">
        <section className="space-y-4 max-w-3xl">
          <h2 className="text-lg font-semibold text-slate-800">{t('about_admin.section_copy')}</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('about_admin.restaurant_intro')}
            </label>
            <textarea
              value={restaurantIntro}
              onChange={(e) => setRestaurantIntro(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('about_admin.workshop_intro')}
            </label>
            <textarea
              value={workshopIntro}
              onChange={(e) => setWorkshopIntro(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </div>
        </section>

        <section className="space-y-4 max-w-3xl">
          <h2 className="text-lg font-semibold text-slate-800">{t('about_admin.section_contact')}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label={t('home.contact_phone')}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
            <Input
              label={t('home.contact_email')}
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('home.contact_address')}
            </label>
            <textarea
              value={contactAddress}
              onChange={(e) => setContactAddress(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </div>
        </section>

        <section className="space-y-5 max-w-3xl border-t border-border pt-8">
          <h2 className="text-lg font-semibold text-slate-800">{t('about_admin.section_social')}</h2>
          <div className="space-y-1">
            <Input
              label={t('about_admin.social_facebook')}
              type="url"
              value={socialFacebookUrl}
              onChange={(e) => setSocialFacebookUrl(e.target.value)}
              placeholder="https://www.facebook.com/…"
            />
            <p className="text-xs text-muted">{t('about_admin.social_facebook_hint')}</p>
          </div>
          <div className="space-y-1">
            <Input
              label={t('about_admin.social_zalo')}
              value={socialZaloPhone}
              onChange={(e) => setSocialZaloPhone(e.target.value)}
              placeholder="84912345678"
            />
            <p className="text-xs text-muted">{t('about_admin.social_zalo_hint')}</p>
          </div>
          <div className="space-y-1">
            <Input
              label={t('about_admin.social_tiktok')}
              type="url"
              value={socialTiktokUrl}
              onChange={(e) => setSocialTiktokUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@…"
            />
            <p className="text-xs text-muted">{t('about_admin.social_tiktok_hint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('about_admin.tiktok_qr')}</label>
            <p className="text-xs text-muted mb-3">{t('about_admin.tiktok_qr_hint')}</p>
            {data?.tiktok_qr_url ? (
              <div className="mb-4 inline-block rounded-xl border border-border bg-slate-50 p-2">
                <img
                  src={data.tiktok_qr_url}
                  alt=""
                  className="max-h-52 max-w-full object-contain rounded-lg"
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={tiktokQrInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={onTiktokQrFile}
              />
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => tiktokQrInputRef.current?.click()}
                disabled={uploadingTiktokQr}
              >
                <Upload size={16} />
                {uploadingTiktokQr ? t('about_admin.uploading') : t('about_admin.upload_tiktok_qr')}
              </Button>
              {data?.tiktok_qr_url ? (
                <Button type="button" variant="secondary" className="gap-2 text-red-700" onClick={removeTiktokQr}>
                  <Trash2 size={16} />
                  {t('about_admin.remove_tiktok_qr')}
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted">{t('about_admin.social_save_note')}</p>
        </section>

        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-slate-800">{t('about_admin.section_media')}</h2>
          <p className="text-xs text-muted max-w-3xl">{t('about_admin.media_hint_upload')}</p>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-800">{t('about_admin.row_images')}</h3>
              <div>
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={onImageFiles}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImages}
                >
                  <Upload size={16} />
                  {uploadingImages ? t('about_admin.uploading') : t('about_admin.upload_images')}
                </Button>
              </div>
            </div>
            {renderStrip('image', imageRows)}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-800">{t('about_admin.row_videos')}</h3>
              <div>
                <input
                  ref={videoInputRef}
                  type="file"
                  multiple
                  accept="video/mp4,video/webm,video/quicktime,.mkv"
                  className="hidden"
                  onChange={onVideoFiles}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploadingVideos}
                >
                  <Upload size={16} />
                  {uploadingVideos ? t('about_admin.uploading') : t('about_admin.upload_videos')}
                </Button>
              </div>
            </div>
            {renderStrip('video', videoRows)}
          </div>
        </section>

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {saved && (
          <p className="text-sm text-green-700">{t('common.saved')}</p>
        )}

        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </Layout>
  )
}
