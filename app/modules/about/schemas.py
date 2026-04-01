import uuid
from typing import Literal

from pydantic import BaseModel, Field


class AboutMediaRead(BaseModel):
    id: uuid.UUID
    media_type: Literal["image", "video"]
    url: str
    caption: str | None = None
    sort_order: int = 0

    model_config = {"from_attributes": True}


class AboutPublicRead(BaseModel):
    restaurant_intro: str = ""
    workshop_intro: str = ""
    contact_phone: str | None = None
    contact_email: str | None = None
    contact_address: str | None = None
    social_facebook_url: str | None = None
    social_zalo_phone: str | None = None
    social_tiktok_url: str | None = None
    tiktok_qr_url: str | None = None
    media: list[AboutMediaRead] = Field(default_factory=list)


class AboutContentWrite(BaseModel):
    """Superadmin: landing copy + contact only. Media is managed via upload/delete/patch endpoints."""

    restaurant_intro: str = ""
    workshop_intro: str = ""
    contact_phone: str | None = Field(None, max_length=64)
    contact_email: str | None = Field(None, max_length=255)
    contact_address: str | None = None
    social_facebook_url: str | None = Field(None, max_length=512)
    social_zalo_phone: str | None = Field(None, max_length=64)
    social_tiktok_url: str | None = Field(None, max_length=512)


class AboutMediaPatchItem(BaseModel):
    id: uuid.UUID
    caption: str | None = Field(None, max_length=2000)
    sort_order: int = 0


class AboutMediaBatchPatch(BaseModel):
    items: list[AboutMediaPatchItem] = Field(default_factory=list)
