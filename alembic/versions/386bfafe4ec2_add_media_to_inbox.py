"""add_media_to_inbox

Revision ID: 386bfafe4ec2
Revises: 2dbc8182e3fd
Create Date: 2026-08-03 23:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '386bfafe4ec2'
down_revision: Union[str, None] = '2dbc8182e3fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('inbox_messages', sa.Column('media_type', sa.String(length=50), nullable=True))
    op.add_column('inbox_messages', sa.Column('media_path', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('inbox_messages', 'media_path')
    op.drop_column('inbox_messages', 'media_type')
