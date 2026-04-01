import uuid

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base_model import Base


class AboutSiteSettings(Base):
    """Singleton-style row: introductory copy and contact info for the public landing page."""

    __tablename__ = "about_site_settings"

    restaurant_intro: Mapped[str] = mapped_column(Text, default="", nullable=False)
    workshop_intro: Mapped[str] = mapped_column(Text, default="", nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    social_facebook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    social_zalo_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    social_tiktok_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tiktok_qr_stored_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tiktok_qr_mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)


class AboutMediaItem(Base):
    """Catalog image/video: either an uploaded file (stored_filename) or legacy external URL."""

    __tablename__ = "about_media_items"

    media_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # Legacy rows only (external links). New uploads use stored_filename instead.
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    stored_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
