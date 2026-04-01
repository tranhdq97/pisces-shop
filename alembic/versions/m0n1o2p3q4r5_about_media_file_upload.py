"""about_media: file uploads (stored_filename) + nullable legacy url

Revision ID: m0n1o2p3q4r5
Revises: k8l9m0n1o2p3
Create Date: 2026-05-03

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "m0n1o2p3q4r5"
down_revision: Union[str, None] = "k8l9m0n1o2p3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("about_media_items", sa.Column("stored_filename", sa.String(length=255), nullable=True))
    op.add_column("about_media_items", sa.Column("mime_type", sa.String(length=128), nullable=True))
    op.alter_column("about_media_items", "url", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column("about_media_items", "url", existing_type=sa.Text(), nullable=False)
    op.drop_column("about_media_items", "mime_type")
    op.drop_column("about_media_items", "stored_filename")
