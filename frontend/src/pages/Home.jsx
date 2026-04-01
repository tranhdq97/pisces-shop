import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Globe,
  ImageOff,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
} from 'lucide-react'
import { getAbout } from '../api/about'
import { useT, LANG_OPTIONS } from '../i18n'
import Spinner from '../components/Spinner'
import AppLogo from '../components/AppLogo'

function isHostedCatalogFile(url) {
  return typeof url === 'string' && url.startsWith('/api/')
}

function youtubeEmbedUrl(raw) {
  try {
    const u = new URL(raw.trim())
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
  } catch {
    /* ignore */
  }
  return null
}

function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '')
}

function telHref(phone) {
  const raw = phone?.trim()
  if (!raw) return null
  const compact = raw.replace(/[^\d+]/g, '')
  return compact ? `tel:${compact}` : null
}

function zaloChatUrl(data) {
  const preferred = onlyDigits(data.social_zalo_phone || '')
  const fallback = onlyDigits(data.contact_phone || '')
  const d = preferred || fallback
  if (!d) return null
  let id = d
  if (id.startsWith('84')) {
    return `https://zalo.me/${id}`
  }
  if (id.startsWith('0')) {
    id = `84${id.slice(1)}`
  } else if (/^9\d{8}$/.test(id)) {
    id = `84${id}`
  }
  return `https://zalo.me/${id}`
}

function facebookHref(raw) {
  const t = raw?.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

const FIT_MEDIA =
  'max-h-[min(65vh,32rem)] max-w-[min(90vw,28rem)] w-auto h-auto object-contain'

const mediaFrameClass =
  'rounded-2xl overflow-hidden bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-200/80 transition duration-300 ease-out motion-safe:hover:shadow-2xl motion-safe:hover:shadow-brand-500/10 motion-safe:hover:-translate-y-1 motion-safe:hover:ring-brand-200/90'

function MediaCard({ item, t }) {
  const [imgBroken, setImgBroken] = useState(false)
  const hosted = isHostedCatalogFile(item.url)
  const embed = !hosted && item.media_type === 'video' ? youtubeEmbedUrl(item.url) : null
  const showPlaceholder = !item.url?.trim() || (item.media_type === 'image' && imgBroken)

  if (showPlaceholder && item.media_type === 'image') {
    return (
      <figure className={`${mediaFrameClass} w-max max-w-[min(90vw,28rem)] border border-dashed border-slate-200`}>
        <div className="min-h-[10rem] min-w-[12rem] flex flex-col items-center justify-center gap-2 text-muted px-4 py-8 bg-gradient-to-b from-slate-50 to-white">
          <ImageOff size={36} strokeWidth={1.25} />
          <span className="text-sm font-medium">{t('home.no_image')}</span>
        </div>
        {item.caption && (
          <figcaption className="text-sm text-slate-600 px-3 py-2.5 border-t border-slate-100 bg-white/90">
            {item.caption}
          </figcaption>
        )}
      </figure>
    )
  }

  if (item.media_type === 'video') {
    if (!item.url?.trim()) {
      return (
        <div
          className={`${mediaFrameClass} min-h-[10rem] min-w-[12rem] w-max max-w-[min(90vw,28rem)] flex flex-col items-center justify-center gap-2 text-muted px-4 border border-dashed border-slate-200 bg-gradient-to-b from-slate-50 to-white`}
        >
          <ImageOff size={36} strokeWidth={1.25} />
          <span className="text-sm font-medium">{t('home.no_image')}</span>
        </div>
      )
    }
    return (
      <figure className={`${mediaFrameClass} w-max max-w-full border border-slate-900/10`}>
        {hosted || !embed ? (
          <div className="flex items-center justify-center bg-gradient-to-b from-slate-900 to-black p-1.5">
            <video src={item.url} controls className={FIT_MEDIA} preload="metadata" />
          </div>
        ) : (
          <div className="w-[min(90vw,42rem)] aspect-video bg-black">
            <iframe
              title={item.caption || 'video'}
              src={embed}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {item.caption && (
          <figcaption className="text-xs text-white/95 bg-black/85 px-3 py-2.5">{item.caption}</figcaption>
        )}
      </figure>
    )
  }

  return (
    <figure className={`${mediaFrameClass} w-max max-w-full border border-slate-200/90`}>
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-100 to-white p-1.5">
        <img
          src={item.url}
          alt={item.caption || ''}
          loading="lazy"
          className={`${FIT_MEDIA} block`}
          onError={() => setImgBroken(true)}
        />
      </div>
      {item.caption && (
        <figcaption className="text-sm text-slate-600 px-3 py-2.5 border-t border-slate-100 bg-white/95">
          {item.caption}
        </figcaption>
      )}
    </figure>
  )
}

function SectionCard({ children, className = '', style }) {
  return (
    <div
      className={`public-landing-rise rounded-2xl border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-900/[0.06] backdrop-blur-md sm:p-8 ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

const quickOutbound =
  'inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 motion-safe:active:scale-[0.98]'

function LandingContactSection({ data, t }) {
  const tel = telHref(data.contact_phone)
  const fbUrl = facebookHref(data.social_facebook_url)
  const zaloUrl = zaloChatUrl(data)
  const showPhoneCard = !!(data.contact_phone?.trim())
  const showQuickCallBtn = !!(tel && !showPhoneCard)
  const hasSocialRow = !!(fbUrl || zaloUrl || showQuickCallBtn)
  const tiktokUrl = (data.social_tiktok_url || '').trim()
  const hasTiktokBlock = !!(tiktokUrl || data.tiktok_qr_url)
  const qrUrl = data.tiktok_qr_url || null

  const hasContactCards =
    !!(data.contact_phone?.trim()) || !!(data.contact_email?.trim()) || !!(data.contact_address?.trim())

  const phoneCardInner = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
        <Phone size={18} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('home.contact_phone')}
        </p>
        <p className="mt-0.5 font-semibold text-slate-900">{data.contact_phone}</p>
      </div>
    </>
  )

  const phoneShellClass =
    'flex gap-3 rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm'

  return (
    <SectionCard style={{ animationDelay: '190ms' }}>
      <div className="flex items-center gap-2 mb-5">
        <span className="h-1 w-8 rounded-full bg-gradient-to-r from-cyan-500 to-brand-500" />
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          {t('home.section_contact')}
        </h2>
      </div>
      <p className="text-sm text-slate-500 mb-5">{t('home.contact_visit')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {showPhoneCard && tel && (
          <a
            href={tel}
            className={`${phoneShellClass} hover:border-brand-200/80 hover:shadow-md transition-all`}
          >
            {phoneCardInner}
          </a>
        )}
        {showPhoneCard && !tel && (
          <div className={phoneShellClass}>{phoneCardInner}</div>
        )}
        {data.contact_email && (
          <a
            href={`mailto:${data.contact_email}`}
            className="flex gap-3 rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm hover:border-brand-200/80 hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Mail size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('home.contact_email')}
              </p>
              <p className="mt-0.5 font-semibold text-brand-700 break-all">{data.contact_email}</p>
            </div>
          </a>
        )}
        {data.contact_address && (
          <div className="flex gap-3 rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm sm:col-span-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <MapPin size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('home.contact_address')}
              </p>
              <p className="mt-0.5 text-slate-800 whitespace-pre-wrap leading-relaxed">{data.contact_address}</p>
            </div>
          </div>
        )}
        {!hasContactCards && <p className="text-slate-500 sm:col-span-2">{t('home.contact_empty')}</p>}
      </div>

      {hasSocialRow && (
        <div className="mt-6 pt-6 border-t border-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            {t('home.social_quick')}
          </p>
          <div className="flex flex-wrap gap-3">
            {fbUrl && (
              <a
                href={fbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${quickOutbound} bg-[#1877F2] text-white hover:bg-[#166fe5] focus:ring-blue-400`}
              >
                {t('home.btn_facebook')}
                <ExternalLink size={15} aria-hidden strokeWidth={2} />
              </a>
            )}
            {zaloUrl && (
              <a
                href={zaloUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${quickOutbound} bg-[#0068FF] text-white hover:bg-[#005ce6] focus:ring-sky-400`}
              >
                {t('home.btn_zalo')}
                <ExternalLink size={15} aria-hidden strokeWidth={2} />
              </a>
            )}
            {showQuickCallBtn && (
              <a
                href={tel}
                className={`${quickOutbound} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 focus:ring-brand-400`}
              >
                <Phone size={16} strokeWidth={2} aria-hidden />
                {t('home.btn_call')}
              </a>
            )}
          </div>
        </div>
      )}

      {hasTiktokBlock && (
        <div className="mt-8 pt-8 border-t border-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            {t('home.tiktok_section')}
          </p>
          {tiktokUrl && (
            <a
              href={tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-2 text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              {t('home.tiktok_open')}
              <ExternalLink size={15} aria-hidden strokeWidth={2} />
            </a>
          )}
          {qrUrl && (
            <figure className="mt-5">
              <div className="inline-block rounded-2xl border border-slate-200/90 bg-white p-3 shadow-inner shadow-slate-900/5">
                <img
                  src={qrUrl}
                  alt={t('home.tiktok_qr_alt')}
                  loading="lazy"
                  className="mx-auto block h-auto w-full max-w-[min(220px,70vw)] object-contain"
                />
              </div>
              <figcaption className="mt-2 text-center text-xs text-slate-500">
                {t('home.tiktok_qr_caption')}
              </figcaption>
            </figure>
          )}
        </div>
      )}

      <div className="mt-8 rounded-2xl overflow-hidden border border-slate-200/90 bg-slate-100 shadow-lg shadow-slate-900/5 ring-1 ring-slate-200/70">
        <iframe
          title={t('home.map_embed_title')}
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3834.2969279028507!2d108.14874931101362!3d16.05007428456257!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3142190877654aa9%3A0xf34ef84ffd3edb4e!2zU29uZyBOZ8awIFF1w6Fu!5e0!3m2!1sen!2sus!4v1778048193139!5m2!1sen!2sus"
          className="block h-[min(450px,55vh)] w-full min-h-[240px] border-0 sm:h-[450px]"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </SectionCard>
  )
}

export default function Home() {
  const { t, lang, setLang } = useT()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['about-public'],
    queryFn: getAbout,
  })

  return (
    <div className="min-h-screen text-slate-800 relative overflow-x-hidden">
      {/* Warm atmospheric background */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-amber-50 via-orange-50/40 to-cyan-50/50"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -top-32 right-0 h-[28rem] w-[28rem] -z-10 rounded-full bg-brand-400/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed bottom-0 -left-24 h-[22rem] w-[22rem] -z-10 rounded-full bg-orange-300/30 blur-3xl"
        aria-hidden
      />

      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-sm shadow-slate-900/5">
        <div className="max-w-5xl mx-auto px-4 h-[4.25rem] flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 min-w-0 group">
            <div className="shrink-0 group-hover:scale-[1.03] transition-transform duration-200">
              <AppLogo size="md" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-slate-900 tracking-tight block truncate">Pisces</span>
              <span className="text-[11px] font-medium uppercase tracking-widest text-brand-600/90 hidden sm:block">
                {t('home.hero_kicker')}
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <Globe size={15} className="text-muted hidden sm:block" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="text-xs text-slate-700 bg-white/90 border border-slate-200/90 rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-brand-400/40 cursor-pointer max-w-[8rem] shadow-sm"
                aria-label={t('lang.label')}
              >
                {LANG_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
            </div>
            <Link
              to="/login"
              className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white text-sm font-semibold px-4 py-2.5 shadow-md shadow-brand-600/25 hover:from-brand-700 hover:to-brand-800 hover:shadow-lg transition-all duration-200 shrink-0"
            >
              {t('home.login')}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14 space-y-10 sm:space-y-14">
        {isLoading && (
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        )}
        {isError && (
          <div className="rounded-2xl border border-red-200/80 bg-red-50/90 backdrop-blur px-4 py-4 text-sm text-red-800 flex flex-wrap items-center gap-3 shadow-lg">
            <span>{t('home.load_error')}</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="font-semibold text-brand-700 hover:underline"
            >
              {t('common.retry')}
            </button>
          </div>
        )}
        {!isLoading && !isError && data && (
          <>
            {/* Hero */}
            <section
              className="public-landing-rise relative overflow-hidden rounded-3xl border border-amber-200/50 bg-gradient-to-br from-white via-amber-50/50 to-orange-50/40 px-6 py-12 sm:px-10 sm:py-16 shadow-2xl shadow-amber-900/10"
              style={{ animationDelay: '0ms' }}
            >
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-brand-400/20 blur-2xl" aria-hidden />
              <div className="absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-rose-300/25 blur-2xl" aria-hidden />
              <div className="relative flex flex-col sm:flex-row sm:items-start gap-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
                  <Sparkles size={28} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.22em] text-orange-700/90 mb-3">
                    {t('home.hero_kicker')}
                  </p>
                  <h1 className="text-3xl sm:text-4xl md:text-[2.65rem] font-extrabold text-slate-900 tracking-tight leading-[1.12]">
                    {t('home.hero_title')}
                  </h1>
                  <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
                    {t('home.hero_tagline')}
                  </p>
                </div>
              </div>
            </section>

            <SectionCard style={{ animationDelay: '70ms' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="h-1 w-8 rounded-full bg-gradient-to-r from-brand-500 to-amber-400" />
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {t('home.section_restaurant')}
                </h2>
              </div>
              <div className="prose prose-slate prose-lg max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                {(data.restaurant_intro || '').trim() || t('home.placeholder_restaurant')}
              </div>
            </SectionCard>

            <SectionCard style={{ animationDelay: '130ms' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="h-1 w-8 rounded-full bg-gradient-to-r from-orange-400 to-rose-400" />
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {t('home.section_workshop')}
                </h2>
              </div>
              <div className="prose prose-slate prose-lg max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                {(data.workshop_intro || '').trim() || t('home.placeholder_workshop')}
              </div>
            </SectionCard>

            <LandingContactSection data={data} t={t} />

            <section className="public-landing-rise space-y-3" style={{ animationDelay: '250ms' }}>
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-1">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {t('home.section_photos')}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">{t('home.photos_strip_sub')}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/50 backdrop-blur-sm p-4 sm:p-5 shadow-inner shadow-slate-900/5">
                <div className="overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth">
                  <div className="flex flex-nowrap items-center gap-5 sm:gap-6 w-max max-w-full">
                    {(data.media ?? []).filter((m) => m.media_type === 'image').length === 0 && (
                      <div className="shrink-0 w-64 rounded-2xl border border-dashed border-slate-200 bg-white/60 aspect-video flex flex-col items-center justify-center gap-2 text-muted">
                        <ImageOff size={36} strokeWidth={1.25} />
                        <span className="text-sm font-medium">{t('home.no_image')}</span>
                      </div>
                    )}
                    {(data.media ?? [])
                      .filter((m) => m.media_type === 'image')
                      .map((item) => (
                        <div key={item.id} className="shrink-0 w-max">
                          <MediaCard item={item} t={t} />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="public-landing-rise space-y-3 pt-2" style={{ animationDelay: '310ms' }}>
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-1">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {t('home.section_videos')}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">{t('home.videos_strip_sub')}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/50 backdrop-blur-sm p-4 sm:p-5 shadow-inner shadow-slate-900/5">
                <div className="overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth">
                  <div className="flex flex-nowrap items-center gap-5 sm:gap-6 w-max max-w-full">
                    {(data.media ?? []).filter((m) => m.media_type === 'video').length === 0 && (
                      <div className="shrink-0 w-64 rounded-2xl border border-dashed border-slate-200 bg-white/60 aspect-video flex flex-col items-center justify-center gap-2 text-muted">
                        <ImageOff size={36} strokeWidth={1.25} />
                        <span className="text-sm font-medium">{t('home.no_video')}</span>
                      </div>
                    )}
                    {(data.media ?? [])
                      .filter((m) => m.media_type === 'video')
                      .map((item) => (
                        <div key={item.id} className="shrink-0 w-max">
                          <MediaCard item={item} t={t} />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="relative mt-4 border-t border-white/50 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-600/20 via-transparent to-transparent pointer-events-none" aria-hidden />
        <div className="max-w-5xl mx-auto px-4 py-10 text-center relative">
          <p className="text-lg sm:text-xl font-semibold text-white tracking-tight">
            {t('home.footer_cta')}
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Pisces · {t('login.subtitle')}
          </p>
        </div>
      </footer>
    </div>
  )
}
