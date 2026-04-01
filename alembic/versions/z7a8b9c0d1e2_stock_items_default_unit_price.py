"""stock_items: default_unit_price for stock entries

Revision ID: z7a8b9c0d1e2
Revises: s0t1u2v3w4x5
Create Date: 2026-05-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "z7a8b9c0d1e2"
down_revision: Union[str, None] = "s0t1u2v3w4x5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_items",
        sa.Column("default_unit_price", sa.Numeric(precision=14, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stock_items", "default_unit_price")
