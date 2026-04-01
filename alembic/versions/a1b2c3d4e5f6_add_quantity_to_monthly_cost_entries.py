"""add quantity to monthly cost entries

Revision ID: a1b2c3d4e5f6
Revises: 50588fdfcac1
Create Date: 2026-04-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '50588fdfcac1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'monthly_cost_entries',
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
    )
    op.alter_column('monthly_cost_entries', 'quantity', server_default=None)


def downgrade() -> None:
    op.drop_column('monthly_cost_entries', 'quantity')
