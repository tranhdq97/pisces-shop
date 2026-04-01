"""payroll: role working_days_per_month; staff working_days_per_month + weekly_hours

Revision ID: i5e6f7g8h9i0
Revises: h3c4d5e6f7g8
Create Date: 2026-04-27

"""

from alembic import op
import sqlalchemy as sa


revision = "i5e6f7g8h9i0"
down_revision = "h3c4d5e6f7g8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payroll_role_defaults",
        sa.Column("working_days_per_month", sa.Numeric(precision=6, scale=2), nullable=True),
    )
    op.add_column(
        "staff_profiles",
        sa.Column("working_days_per_month", sa.Numeric(precision=6, scale=2), nullable=True),
    )
    op.add_column(
        "staff_profiles",
        sa.Column("weekly_hours", sa.Numeric(precision=6, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("staff_profiles", "weekly_hours")
    op.drop_column("staff_profiles", "working_days_per_month")
    op.drop_column("payroll_role_defaults", "working_days_per_month")
