from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from ..database.session import Base


def utcnow():
    return datetime.now(timezone.utc)


class Venue(Base):
    __tablename__ = "venues"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_name = Column(String(160), nullable=False)
    location = Column(String(160), nullable=False)
    contact_email = Column(String(160), nullable=False)
    welcome_message = Column(Text, nullable=False, default="We value your dining experience.")
    camera_feedback_enabled = Column(Boolean, nullable=False, default=True)
    qr_feedback_enabled = Column(Boolean, nullable=False, default=True)
    retention_days = Column(Integer, nullable=False, default=90)
    status = Column(String(24), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    users = relationship("User", back_populates="venue")
    surveys = relationship("SurveyResponse", back_populates="venue", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(160), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(24), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    venue = relationship("Venue", back_populates="users")


class ConsentEvent(Base):
    __tablename__ = "consent_events"

    id = Column(String(64), primary_key=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    notice_version = Column(String(32), nullable=False, default="v2.1-2026")
    consent_choice = Column(String(16), nullable=False)  # accepted | declined
    used_for_inference = Column(Boolean, nullable=False, default=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class FeedbackEvent(Base):
    __tablename__ = "feedback_events"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    time_bucket = Column(String(32), nullable=False, index=True)
    model_version = Column(String(48), nullable=False)
    expression_cue = Column(String(32), nullable=False)
    confidence_band = Column(String(16), nullable=False)
    quality_status = Column(String(16), nullable=False)
    is_demo = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("idx_feedback_events_venue_bucket", "venue_id", "time_bucket"),
    )


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_channel = Column(String(16), nullable=False, default="web")
    used_camera_cue = Column(Boolean, nullable=False, default=False)
    food_rating = Column(Integer, nullable=False)
    service_rating = Column(Integer, nullable=False)
    cleanliness_rating = Column(Integer, nullable=False)
    waiting_time_rating = Column(Integer, nullable=False)
    overall_rating = Column(Float, nullable=False)
    feedback_category = Column(String(16), nullable=False)
    comment = Column(Text, nullable=True)
    is_demo = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    venue = relationship("Venue", back_populates="surveys")

    __table_args__ = (
        CheckConstraint("food_rating BETWEEN 1 AND 5", name="ck_food_rating"),
        CheckConstraint("service_rating BETWEEN 1 AND 5", name="ck_service_rating"),
        CheckConstraint("cleanliness_rating BETWEEN 1 AND 5", name="ck_cleanliness_rating"),
        CheckConstraint("waiting_time_rating BETWEEN 1 AND 5", name="ck_wait_rating"),
        Index("idx_survey_venue_created", "venue_id", "created_at"),
    )


class ServiceAction(Base):
    __tablename__ = "service_actions"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    issue = Column(String(255), nullable=False)
    action_description = Column(Text, nullable=False)
    assigned_role = Column(String(100), nullable=False)
    status = Column(String(24), nullable=False, default="open")
    outcome = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(160), nullable=True)
    action = Column(String(100), nullable=False)
    object_type = Column(String(48), nullable=False)
    object_id = Column(String(64), nullable=True)
    result = Column(String(16), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
