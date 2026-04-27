"""Create audit_logs table

Revision ID: 002_create_audit_logs
Revises: 001_float_to_numeric
Create Date: 2026-04-27
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "002_create_audit_logs"
down_revision = "001_float_to_numeric"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("action", sa.String(50), nullable=False, index=True),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("record_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("details", sa.String(500), nullable=True),
        sa.Column("snapshot_data", sa.Text, nullable=True),
        sa.Column("is_undone", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
