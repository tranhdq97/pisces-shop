"""payroll month settings (working days, hours/day, extra off dates)

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-04-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payroll_month_settings",
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("working_days_per_month", sa.Numeric(precision=6, scale=2), nullable=False, server_default="21.75"),
        sa.Column("hours_per_day", sa.Numeric(precision=5, scale=2), nullable=False, server_default="8.00"),
        sa.Column(
            "extra_off_dates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column("updated_by_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_year", "period_month", name="uq_payroll_month_settings_period"),
    )
    op.create_index(op.f("ix_payroll_month_settings_id"), "payroll_month_settings", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payroll_month_settings_id"), table_name="payroll_month_settings")
    op.drop_table("payroll_month_settings")
