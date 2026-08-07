"""fix_inbox_messages_columns

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-08-07 20:36:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    inbox_columns = [c['name'] for c in inspector.get_columns('inbox_messages')]

    if 'peer_name' not in inbox_columns:
        op.add_column('inbox_messages', sa.Column('peer_name', sa.String(length=255), nullable=True))

    if 'sender_username' in inbox_columns and 'peer_username' not in inbox_columns:
        op.alter_column('inbox_messages', 'sender_username', new_column_name='peer_username')
    elif 'peer_username' not in inbox_columns:
        op.add_column('inbox_messages', sa.Column('peer_username', sa.String(length=100), nullable=True))

    if 'is_incoming' in inbox_columns and 'incoming' not in inbox_columns:
        op.alter_column('inbox_messages', 'is_incoming', new_column_name='incoming')
    elif 'incoming' not in inbox_columns:
        op.add_column('inbox_messages', sa.Column('incoming', sa.Boolean(), server_default='true', nullable=True))

    if 'received_at' in inbox_columns and 'created_at' not in inbox_columns:
        op.alter_column('inbox_messages', 'received_at', new_column_name='created_at')
    elif 'created_at' not in inbox_columns:
        op.add_column('inbox_messages', sa.Column('created_at', sa.DateTime(), nullable=True))

    if 'media_path' not in inbox_columns:
        op.add_column('inbox_messages', sa.Column('media_path', sa.Text(), nullable=True))


def downgrade() -> None:
    pass
