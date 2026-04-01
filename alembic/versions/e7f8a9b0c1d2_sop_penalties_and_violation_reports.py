"""sop task penalty_amount + violation reports

Revision ID: e7f8a9b0c1d2
Revises: d4e5f6a7b8c9
Create Date: 2026-04-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sop_tasks",
        sa.Column("penalty_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.alter_column("sop_tasks", "penalty_amount", server_default=None)

    op.create_table(
        "sop_violation_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reported_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("penalty_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("incident_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payroll_adjustment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["sop_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reported_by"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["payroll_adjustment_id"], ["payroll_adjustments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sop_violation_reports_status", "sop_violation_reports", ["status"], unique=False)
    op.create_index("ix_sop_violation_reports_incident_date", "sop_violation_reports", ["incident_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sop_violation_reports_incident_date", table_name="sop_violation_reports")
    op.drop_index("ix_sop_violation_reports_status", table_name="sop_violation_reports")
    op.drop_table("sop_violation_reports")
    op.drop_column("sop_tasks", "penalty_amount")
