"""add_reaction_source_to_steps

Revision ID: f7e8d9c8b7a6
Revises: a1b2c3d4e5f6
Create Date: 2026-08-04 02:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7e8d9c8b7a6'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('scenario_steps', sa.Column('reaction_source', sa.String(length=20), server_default='pool', nullable=False))
    op.add_column('scenario_steps', sa.Column('reaction_roles', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('scenario_steps', 'reaction_roles')
    op.drop_column('scenario_steps', 'reaction_source')
