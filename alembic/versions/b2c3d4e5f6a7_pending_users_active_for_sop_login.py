"""Pending registrations: set active so users can sign in for SOP training.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-27

"""
from typing import Sequence, Union

from alembic import op


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE users SET is_active = true "
        "WHERE is_approved = false AND is_active = false"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE users SET is_active = false "
        "WHERE is_approved = false AND is_active = true"
    )
