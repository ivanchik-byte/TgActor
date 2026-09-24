"""inbox indexes

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""
from typing import Sequence, Union
from alembic import op


revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_inbox_acc_peer_created', 'inbox_messages', ['account_id', 'peer_id', 'created_at'])
    op.create_index('ix_inbox_acc_peer_msg', 'inbox_messages', ['account_id', 'peer_id', 'message_id'])


def downgrade() -> None:
    op.drop_index('ix_inbox_acc_peer_msg', table_name='inbox_messages')
    op.drop_index('ix_inbox_acc_peer_created', table_name='inbox_messages')
