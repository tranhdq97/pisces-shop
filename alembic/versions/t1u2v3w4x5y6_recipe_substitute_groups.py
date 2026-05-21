"""recipe substitute OR groups on recipe_items

Revision ID: t1u2v3w4x5y6
Revises: b4c5d6e7f8a9
Create Date: 2026-05-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "t1u2v3w4x5y6"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("recipe_items", sa.Column("substitute_group", sa.Integer(), nullable=True))
    op.add_column(
        "recipe_items",
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("recipe_items", "priority")
    op.drop_column("recipe_items", "substitute_group")
