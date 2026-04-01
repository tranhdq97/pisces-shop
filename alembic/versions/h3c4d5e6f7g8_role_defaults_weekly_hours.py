"""payroll_role_defaults: salary columns -> weekly_hours norm

Revision ID: h3c4d5e6f7g8
Revises: g2b3c4d5e6f7
Create Date: 2026-04-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h3c4d5e6f7g8"
down_revision: Union[str, None] = "g2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payroll_role_defaults", sa.Column("weekly_hours", sa.Numeric(precision=6, scale=2), nullable=True))
    op.drop_column("payroll_role_defaults", "hourly_rate")
    op.drop_column("payroll_role_defaults", "monthly_base_salary")


def downgrade() -> None:
    op.add_column(
        "payroll_role_defaults",
        sa.Column("monthly_base_salary", sa.Numeric(precision=14, scale=2), nullable=True),
    )
    op.add_column(
        "payroll_role_defaults",
        sa.Column("hourly_rate", sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.drop_column("payroll_role_defaults", "weekly_hours")
