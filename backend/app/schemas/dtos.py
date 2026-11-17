from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    restaurant_name: Optional[str] = None
    location: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ConsentCreateRequest(BaseModel):
    venue_id: int
    notice_version: str = "v2.1-2026"
    consent_choice: Literal["accepted", "declined"]


class QualityMetrics(BaseModel):
    face_detected: bool
    brightness: float = Field(ge=0.0, le=1.0)
    blur_score: float = Field(ge=0.0, le=1.0)
    framing_score: float = Field(ge=0.0, le=1.0)
    smile_signal: Optional[float] = Field(default=0.5, ge=0.0, le=1.0)


class InferenceEventRequest(BaseModel):
    venue_id: int
    consent_id: str
    quality_metrics: Optional[QualityMetrics] = None
    image_base64: Optional[str] = None
    is_demo_mode: bool = False


class SurveyCreateRequest(BaseModel):
    venue_id: int
    submission_channel: Literal["web", "qr", "kiosk"] = "web"
    used_camera_cue: bool = False
    food_rating: int = Field(ge=1, le=5)
    service_rating: int = Field(ge=1, le=5)
    cleanliness_rating: int = Field(ge=1, le=5)
    waiting_time_rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1200)


class VenueCreateRequest(BaseModel):
    restaurant_name: str = Field(min_length=2, max_length=160)
    location: str = Field(min_length=2, max_length=160)
    contact_email: EmailStr
    welcome_message: Optional[str] = None
    camera_feedback_enabled: bool = True
    qr_feedback_enabled: bool = True
    retention_days: int = Field(default=90, ge=7, le=365)


class ServiceActionCreateRequest(BaseModel):
    venue_id: int
    issue: str = Field(min_length=3, max_length=255)
    action_description: str = Field(min_length=3)
    assigned_role: str = Field(min_length=2, max_length=100)
