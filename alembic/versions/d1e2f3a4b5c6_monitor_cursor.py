"""monitor cursor

Revision ID: d1e2f3a4b5c6
Revises: 386bfafe4ec2
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('monitored_channels', sa.Column('last_checked_msg_id', sa.BigInteger(), nullable=True))
    op.add_column('monitored_channels', sa.Column('last_checked_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('monitored_channels', 'last_checked_at')
    op.drop_column('monitored_channels', 'last_checked_msg_id')
