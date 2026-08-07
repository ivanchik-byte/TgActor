"""add_channels_and_weight

Revision ID: a1b2c3d4e5f6
Revises: 386bfafe4ec2
Create Date: 2026-08-04 01:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '386bfafe4ec2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add weight column to scenarios
    op.add_column('scenarios', sa.Column('weight', sa.Integer(), server_default='1', nullable=False))
    
    # Create monitored_channels table
    op.create_table(
        'monitored_channels',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('channel_username', sa.String(length=255), nullable=False, unique=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('no_repeat_scenarios', sa.Integer(), server_default='3', nullable=False),
        sa.Column('min_delay_seconds', sa.Integer(), server_default='10', nullable=False),
        sa.Column('max_delay_seconds', sa.Integer(), server_default='30', nullable=False),
        sa.Column('history_json', sa.Text(), server_default='[]', nullable=True),
    )


def downgrade() -> None:
    op.drop_table('monitored_channels')
    op.drop_column('scenarios', 'weight')
