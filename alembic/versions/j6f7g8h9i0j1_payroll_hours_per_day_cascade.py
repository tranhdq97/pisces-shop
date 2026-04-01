"""payroll: hours_per_day on role defaults + staff (cascade with working days)

Revision ID: j6f7g8h9i0j1
Revises: i5e6f7g8h9i0
Create Date: 2026-04-27

"""

from alembic import op
import sqlalchemy as sa


revision = "j6f7g8h9i0j1"
down_revision = "i5e6f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payroll_role_defaults",
        sa.Column("hours_per_day", sa.Numeric(precision=5, scale=2), nullable=True),
    )
    op.add_column(
        "staff_profiles",
        sa.Column("hours_per_day", sa.Numeric(precision=5, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("staff_profiles", "hours_per_day")
    op.drop_column("payroll_role_defaults", "hours_per_day")
