"""Legacy SOP categories: empty allowed_roles treated as all roles before policy change.

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6a7
Create Date: 2026-04-27

Pre-upgrade, [] meant « visible to every role ». Post-upgrade, [] means « nobody ».
This migration sets explicit all-role lists for rows that still have an empty array
so existing deployments keep checklist access until admins tighten assignments.
"""

from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None

_ALL_ROLES_JSON = '["superadmin", "admin", "manager", "waiter", "kitchen"]'


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE sop_categories
        SET allowed_roles = '{_ALL_ROLES_JSON}'::jsonb
        WHERE jsonb_typeof(allowed_roles) = 'array'
          AND jsonb_array_length(allowed_roles) = 0;
        """
    )


def downgrade() -> None:
    # Cannot distinguish migrated rows from categories intentionally left empty.
    pass
