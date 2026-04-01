"""about_site_settings: social links + TikTok QR file columns

Revision ID: p7q8r9s0t1u2
Revises: m0n1o2p3q4r5
Create Date: 2026-05-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "p7q8r9s0t1u2"
down_revision: Union[str, None] = "m0n1o2p3q4r5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "about_site_settings",
        sa.Column("social_facebook_url", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "about_site_settings",
        sa.Column("social_zalo_phone", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "about_site_settings",
        sa.Column("social_tiktok_url", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "about_site_settings",
        sa.Column("tiktok_qr_stored_filename", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "about_site_settings",
        sa.Column("tiktok_qr_mime_type", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("about_site_settings", "tiktok_qr_mime_type")
    op.drop_column("about_site_settings", "tiktok_qr_stored_filename")
    op.drop_column("about_site_settings", "social_tiktok_url")
    op.drop_column("about_site_settings", "social_zalo_phone")
    op.drop_column("about_site_settings", "social_facebook_url")
