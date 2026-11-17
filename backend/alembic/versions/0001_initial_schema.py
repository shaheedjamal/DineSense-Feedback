"""Initial DineSense Feedback schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "venues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("restaurant_name", sa.String(160), nullable=False),
        sa.Column("location", sa.String(160), nullable=False),
        sa.Column("contact_email", sa.String(160), nullable=False),
        sa.Column("welcome_message", sa.Text(), nullable=False),
        sa.Column("camera_feedback_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("qr_feedback_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("status", sa.String(24), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(160), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "consent_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notice_version", sa.String(32), nullable=False),
        sa.Column("consent_choice", sa.String(16), nullable=False),
        sa.Column("used_for_inference", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "feedback_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("time_bucket", sa.String(32), nullable=False),
        sa.Column("model_version", sa.String(48), nullable=False),
        sa.Column("expression_cue", sa.String(32), nullable=False),
        sa.Column("confidence_band", sa.String(16), nullable=False),
        sa.Column("quality_status", sa.String(16), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "survey_responses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submission_channel", sa.String(16), nullable=False),
        sa.Column("used_camera_cue", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("food_rating", sa.Integer(), nullable=False),
        sa.Column("service_rating", sa.Integer(), nullable=False),
        sa.Column("cleanliness_rating", sa.Integer(), nullable=False),
        sa.Column("waiting_time_rating", sa.Integer(), nullable=False),
        sa.Column("overall_rating", sa.Float(), nullable=False),
        sa.Column("feedback_category", sa.String(16), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "service_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issue", sa.String(255), nullable=False),
        sa.Column("action_description", sa.Text(), nullable=False),
        sa.Column("assigned_role", sa.String(100), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="open"),
        sa.Column("outcome", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_email", sa.String(160), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("object_type", sa.String(48), nullable=False),
        sa.Column("object_id", sa.String(64), nullable=True),
        sa.Column("result", sa.String(16), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("service_actions")
    op.drop_table("survey_responses")
    op.drop_table("feedback_events")
    op.drop_table("consent_events")
    op.drop_table("users")
    op.drop_table("venues")
