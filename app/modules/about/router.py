import uuid

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_roles
from app.modules.about.schemas import AboutContentWrite, AboutMediaBatchPatch, AboutMediaRead, AboutPublicRead
from app.modules.about.service import AboutService

router = APIRouter(prefix="/about", tags=["About"])

_superadmin_only = Depends(require_roles("superadmin"))


@router.get("", response_model=AboutPublicRead)
async def get_about_public(db: AsyncSession = Depends(get_db)) -> AboutPublicRead:
    """Public landing content: shop intro, workshop section, contact, media catalog."""
    return await AboutService(db).get_public()


@router.put("", response_model=AboutPublicRead, dependencies=[_superadmin_only])
async def put_about_content(
    payload: AboutContentWrite,
    db: AsyncSession = Depends(get_db),
) -> AboutPublicRead:
    """Update landing copy and contact (superadmin). Media uses upload/delete/patch routes."""
    return await AboutService(db).update_site_content(payload)


@router.get("/files/tiktok-qr")
async def get_about_tiktok_qr_file(db: AsyncSession = Depends(get_db)) -> FileResponse:
    """Public: single uploaded TikTok QR image for the landing page."""
    path, mime = await AboutService(db).get_tiktok_qr_file()
    return FileResponse(path, media_type=mime, filename=path.name)


@router.get("/files/{media_id}")
async def get_about_media_file(media_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> FileResponse:
    """Serve an uploaded catalog file (public, no auth)."""
    svc = AboutService(db)
    row, path = await svc.get_media_file_path(media_id)
    return FileResponse(
        path,
        media_type=row.mime_type or "application/octet-stream",
        filename=row.stored_filename,
    )


@router.post("/tiktok-qr", response_model=AboutPublicRead, dependencies=[_superadmin_only])
async def upload_about_tiktok_qr(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> AboutPublicRead:
    """Replace the landing-page TikTok QR image (superadmin)."""
    raw = await file.read()
    return await AboutService(db).upload_tiktok_qr(raw, file.filename, file.content_type)


@router.delete("/tiktok-qr", response_model=AboutPublicRead, dependencies=[_superadmin_only])
async def delete_about_tiktok_qr(db: AsyncSession = Depends(get_db)) -> AboutPublicRead:
    """Remove the TikTok QR image (superadmin)."""
    return await AboutService(db).delete_tiktok_qr()


@router.post("/media", response_model=AboutMediaRead, dependencies=[_superadmin_only])
async def upload_about_media(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> AboutMediaRead:
    """Upload one image or video for the public catalog (superadmin)."""
    raw = await file.read()
    return await AboutService(db).upload_media(raw, file.filename, file.content_type)


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_superadmin_only])
async def delete_about_media(media_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    await AboutService(db).delete_media(media_id)


@router.patch("/media", response_model=AboutPublicRead, dependencies=[_superadmin_only])
async def patch_about_media(
    payload: AboutMediaBatchPatch,
    db: AsyncSession = Depends(get_db),
) -> AboutPublicRead:
    """Update captions and sort order for existing media rows."""
    return await AboutService(db).patch_media_batch(payload)
