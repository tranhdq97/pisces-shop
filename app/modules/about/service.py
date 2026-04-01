import mimetypes
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException
from app.modules.about.models import AboutMediaItem, AboutSiteSettings
from app.modules.about.schemas import (
    AboutContentWrite,
    AboutMediaBatchPatch,
    AboutMediaRead,
    AboutPublicRead,
)
from app.modules.about.storage import ABOUT_MEDIA_DIR, ABOUT_SITE_DIR

_IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_VID_EXT = {".mp4", ".webm", ".mov", ".mkv"}
_IMG_MIME_FALLBACK = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

TIKTOK_QR_PUBLIC_PATH = "/api/v1/about/files/tiktok-qr"


def _norm_optional_str(s: str | None) -> str | None:
    if s is None:
        return None
    t = s.strip()
    return t or None


def _safe_ext(name: str | None) -> str:
    if not name or "." not in name:
        return ""
    ext = Path(name).suffix.lower()
    return ext if ext in _IMG_EXT | _VID_EXT else ""


def _public_file_url(media_id: uuid.UUID) -> str:
    return f"/api/v1/about/files/{media_id}"


class AboutService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _media_dir(self) -> Path:
        ABOUT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        return ABOUT_MEDIA_DIR

    def _site_dir(self) -> Path:
        ABOUT_SITE_DIR.mkdir(parents=True, exist_ok=True)
        return ABOUT_SITE_DIR

    def _tiktok_qr_disk_path(self, row: AboutSiteSettings) -> Path | None:
        fn = (row.tiktok_qr_stored_filename or "").strip()
        if not fn:
            return None
        base = self._site_dir().resolve()
        path = (base / fn).resolve()
        if not str(path).startswith(str(base)):
            return None
        return path if path.is_file() else None

    def _to_media_read(self, row: AboutMediaItem) -> AboutMediaRead:
        if row.stored_filename:
            url = _public_file_url(row.id)
        else:
            url = (row.url or "").strip()
        return AboutMediaRead(
            id=row.id,
            media_type=row.media_type,  # type: ignore[arg-type]
            url=url,
            caption=row.caption,
            sort_order=row.sort_order,
        )

    async def _get_or_create_settings(self) -> AboutSiteSettings:
        result = await self.db.execute(select(AboutSiteSettings).limit(1))
        row = result.scalar_one_or_none()
        if row is None:
            row = AboutSiteSettings()
            self.db.add(row)
            await self.db.flush()
        return row

    async def get_public(self) -> AboutPublicRead:
        settings = await self._get_or_create_settings()
        media_result = await self.db.execute(
            select(AboutMediaItem).order_by(
                AboutMediaItem.sort_order.asc(),
                AboutMediaItem.created_at.asc(),
            )
        )
        media_rows = media_result.scalars().all()
        tiktok_qr_url = TIKTOK_QR_PUBLIC_PATH if self._tiktok_qr_disk_path(settings) else None
        return AboutPublicRead(
            restaurant_intro=settings.restaurant_intro or "",
            workshop_intro=settings.workshop_intro or "",
            contact_phone=settings.contact_phone,
            contact_email=settings.contact_email,
            contact_address=settings.contact_address,
            social_facebook_url=settings.social_facebook_url,
            social_zalo_phone=settings.social_zalo_phone,
            social_tiktok_url=settings.social_tiktok_url,
            tiktok_qr_url=tiktok_qr_url,
            media=[self._to_media_read(m) for m in media_rows],
        )

    async def update_site_content(self, payload: AboutContentWrite) -> AboutPublicRead:
        settings = await self._get_or_create_settings()
        settings.restaurant_intro = payload.restaurant_intro or ""
        settings.workshop_intro = payload.workshop_intro or ""
        settings.contact_phone = _norm_optional_str(payload.contact_phone)
        settings.contact_email = _norm_optional_str(payload.contact_email)
        settings.contact_address = _norm_optional_str(payload.contact_address)
        settings.social_facebook_url = _norm_optional_str(payload.social_facebook_url)
        settings.social_zalo_phone = _norm_optional_str(payload.social_zalo_phone)
        settings.social_tiktok_url = _norm_optional_str(payload.social_tiktok_url)
        await self.db.flush()
        return await self.get_public()

    async def get_media_file_path(self, media_id: uuid.UUID) -> tuple[AboutMediaItem, Path]:
        result = await self.db.execute(select(AboutMediaItem).where(AboutMediaItem.id == media_id))
        row = result.scalar_one_or_none()
        if row is None or not row.stored_filename:
            raise AppException(status_code=404, detail="Media not found.", code="about_media_not_found")
        base = self._media_dir()
        path = (base / row.stored_filename).resolve()
        if not str(path).startswith(str(base.resolve())):
            raise AppException(status_code=404, detail="Media not found.", code="about_media_not_found")
        if not path.is_file():
            raise AppException(status_code=404, detail="Media file missing.", code="about_media_file_missing")
        return row, path

    async def _next_sort_order(self) -> int:
        r = await self.db.execute(select(func.coalesce(func.max(AboutMediaItem.sort_order), -1)))
        return int(r.scalar_one()) + 1

    async def upload_media(self, raw: bytes, original_name: str | None, content_type: str | None) -> AboutMediaRead:
        max_bytes = max(1, settings.ABOUT_UPLOAD_MAX_MIB) * 1024 * 1024
        if len(raw) > max_bytes:
            raise AppException(
                status_code=400,
                detail=f"File too large (max {settings.ABOUT_UPLOAD_MAX_MIB} MiB).",
                code="about_upload_too_large",
            )

        ext = _safe_ext(original_name)
        if not ext:
            raise AppException(
                status_code=400,
                detail="Unsupported file type. Use JPG, PNG, WebP, GIF, MP4, WebM, MOV, or MKV.",
                code="about_upload_bad_type",
            )

        if ext in _IMG_EXT:
            media_type = "image"
        else:
            media_type = "video"

        guessed = content_type or mimetypes.guess_type(f"x{ext}")[0]
        if not guessed or guessed == "application/octet-stream":
            guessed = "image/jpeg" if media_type == "image" else "video/mp4"

        new_id = uuid.uuid4()
        filename = f"{new_id}{ext}"
        path = self._media_dir() / filename

        item = AboutMediaItem(
            id=new_id,
            media_type=media_type,
            url=None,
            stored_filename=filename,
            mime_type=guessed,
            caption=None,
            sort_order=await self._next_sort_order(),
        )
        self.db.add(item)
        await self.db.flush()
        try:
            path.write_bytes(raw)
        except OSError:
            await self.db.delete(item)
            await self.db.flush()
            raise AppException(status_code=500, detail="Could not save file.", code="about_upload_io") from None
        return self._to_media_read(item)

    async def delete_media(self, media_id: uuid.UUID) -> None:
        result = await self.db.execute(select(AboutMediaItem).where(AboutMediaItem.id == media_id))
        row = result.scalar_one_or_none()
        if row is None:
            raise AppException(status_code=404, detail="Media not found.", code="about_media_not_found")
        if row.stored_filename:
            p = (self._media_dir() / row.stored_filename).resolve()
            base = self._media_dir().resolve()
            if str(p).startswith(str(base)) and p.is_file():
                p.unlink(missing_ok=True)
        await self.db.delete(row)
        await self.db.flush()

    async def patch_media_batch(self, payload: AboutMediaBatchPatch) -> AboutPublicRead:
        for patch in payload.items:
            result = await self.db.execute(select(AboutMediaItem).where(AboutMediaItem.id == patch.id))
            row = result.scalar_one_or_none()
            if row is None:
                continue
            row.caption = patch.caption
            row.sort_order = patch.sort_order
        await self.db.flush()
        return await self.get_public()

    async def get_tiktok_qr_file(self) -> tuple[Path, str]:
        site = await self._get_or_create_settings()
        path = self._tiktok_qr_disk_path(site)
        if path is None:
            raise AppException(
                status_code=404,
                detail="TikTok QR image not uploaded.",
                code="about_tiktok_qr_missing",
            )
        mime = site.tiktok_qr_mime_type or "application/octet-stream"
        return path, mime

    async def upload_tiktok_qr(self, raw: bytes, original_name: str | None, content_type: str | None) -> AboutPublicRead:
        max_bytes = max(1, settings.ABOUT_UPLOAD_MAX_MIB) * 1024 * 1024
        if len(raw) > max_bytes:
            raise AppException(
                status_code=400,
                detail=f"File too large (max {settings.ABOUT_UPLOAD_MAX_MIB} MiB).",
                code="about_upload_too_large",
            )
        ext = _safe_ext(original_name)
        if ext not in _IMG_EXT:
            raise AppException(
                status_code=400,
                detail="Unsupported file type. Use JPG, PNG, WebP, or GIF for the TikTok QR.",
                code="about_upload_bad_type",
            )

        guessed = content_type or mimetypes.guess_type(f"x{ext}")[0]
        if not guessed or guessed == "application/octet-stream":
            guessed = _IMG_MIME_FALLBACK.get(ext, "image/jpeg")

        site = await self._get_or_create_settings()
        old_fn = (site.tiktok_qr_stored_filename or "").strip()
        base = self._site_dir()
        base_resolved = base.resolve()
        new_fn = f"tiktok_qr{ext}"
        path = (base / new_fn).resolve()
        if not str(path).startswith(str(base_resolved)):
            raise AppException(status_code=400, detail="Invalid path.", code="about_upload_io")

        if old_fn:
            old_p = (base / old_fn).resolve()
            if str(old_p).startswith(str(base_resolved)) and old_p.is_file():
                old_p.unlink(missing_ok=True)

        try:
            path.write_bytes(raw)
        except OSError:
            raise AppException(status_code=500, detail="Could not save file.", code="about_upload_io") from None

        site.tiktok_qr_stored_filename = new_fn
        site.tiktok_qr_mime_type = guessed
        await self.db.flush()
        return await self.get_public()

    async def delete_tiktok_qr(self) -> AboutPublicRead:
        site = await self._get_or_create_settings()
        fn = (site.tiktok_qr_stored_filename or "").strip()
        base = self._site_dir().resolve()
        if fn:
            p = (self._site_dir() / fn).resolve()
            if str(p).startswith(str(base)) and p.is_file():
                p.unlink(missing_ok=True)
        site.tiktok_qr_stored_filename = None
        site.tiktok_qr_mime_type = None
        await self.db.flush()
        return await self.get_public()
