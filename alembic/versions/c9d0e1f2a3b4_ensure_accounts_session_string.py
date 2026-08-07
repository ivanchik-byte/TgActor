"""ensure_accounts_session_string

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-08-07 20:16:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    account_columns = [c['name'] for c in inspector.get_columns('accounts')]

    if 'encrypted_session' in account_columns and 'session_string' not in account_columns:
        op.alter_column('accounts', 'encrypted_session', new_column_name='session_string')
    elif 'session_string' not in account_columns:
        op.add_column('accounts', sa.Column('session_string', sa.Text(), nullable=True))

    if 'is_active' not in account_columns:
        op.add_column('accounts', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))


def downgrade() -> None:
    pass
