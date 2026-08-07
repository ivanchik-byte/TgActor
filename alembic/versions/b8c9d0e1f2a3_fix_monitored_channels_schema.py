"""fix_monitored_channels_schema

Revision ID: b8c9d0e1f2a3
Revises: e7d8c9b9a8f7
Create Date: 2026-08-07 20:08:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'e7d8c9b9a8f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    
    # Fix monitored_channels table columns
    channel_columns = [c['name'] for c in inspector.get_columns('monitored_channels')]
    if 'channel_identifier' in channel_columns and 'channel_username' not in channel_columns:
        op.alter_column('monitored_channels', 'channel_identifier', new_column_name='channel_username')
    elif 'channel_username' not in channel_columns:
        op.add_column('monitored_channels', sa.Column('channel_username', sa.String(length=255), nullable=True))

    if 'history_json' not in channel_columns:
        op.add_column('monitored_channels', sa.Column('history_json', sa.Text(), server_default='[]', nullable=True))

    # Fix accounts table columns (encrypted_session -> session_string)
    account_columns = [c['name'] for c in inspector.get_columns('accounts')]
    if 'encrypted_session' in account_columns and 'session_string' not in account_columns:
        op.alter_column('accounts', 'encrypted_session', new_column_name='session_string')
    elif 'session_string' not in account_columns:
        op.add_column('accounts', sa.Column('session_string', sa.Text(), nullable=True))


def downgrade() -> None:
    pass
