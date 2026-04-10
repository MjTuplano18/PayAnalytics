"""Change payment_amount and total_amount from Float to Numeric(15,2)

Revision ID: 001_float_to_numeric
Revises:
Create Date: 2026-04-10
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "001_float_to_numeric"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "payment_records",
        "payment_amount",
        existing_type=sa.Float(),
        type_=sa.Numeric(15, 2),
        existing_nullable=False,
    )
    op.alter_column(
        "upload_sessions",
        "total_amount",
        existing_type=sa.Float(),
        type_=sa.Numeric(15, 2),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "payment_records",
        "payment_amount",
        existing_type=sa.Numeric(15, 2),
        type_=sa.Float(),
        existing_nullable=False,
    )
    op.alter_column(
        "upload_sessions",
        "total_amount",
        existing_type=sa.Numeric(15, 2),
        type_=sa.Float(),
        existing_nullable=False,
    )
