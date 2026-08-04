"""add_custom_name_to_accounts

Revision ID: e7d8c9b9a8f7
Revises: f7e8d9c8b7a6
Create Date: 2026-08-04 03:48:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7d8c9b9a8f7'
down_revision: Union[str, None] = 'f7e8d9c8b7a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column('custom_name', sa.String(length=100), nullable=True))
    op.add_column('accounts', sa.Column('position', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('accounts', 'position')
    op.drop_column('accounts', 'custom_name')
