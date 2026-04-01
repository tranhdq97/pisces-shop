"""orders: order_flow (dine_in vs takeaway)

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2026-05-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "q8r9s0t1u2v3"
down_revision: Union[str, None] = "p7q8r9s0t1u2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "order_flow",
            sa.String(length=20),
            nullable=False,
            server_default="dine_in",
        ),
    )
    op.create_index("ix_orders_order_flow", "orders", ["order_flow"])


def downgrade() -> None:
    op.drop_index("ix_orders_order_flow", table_name="orders")
    op.drop_column("orders", "order_flow")
