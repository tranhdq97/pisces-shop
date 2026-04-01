"""payroll role default salaries (template before per-user StaffProfile)

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
revision: str = "g2b3c4d5e6f7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payroll_role_defaults",
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("monthly_base_salary", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("hourly_rate", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column("updated_by_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role", name="uq_payroll_role_defaults_role"),
    )
    op.create_index(op.f("ix_payroll_role_defaults_id"), "payroll_role_defaults", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payroll_role_defaults_id"), table_name="payroll_role_defaults")
    op.drop_table("payroll_role_defaults")
