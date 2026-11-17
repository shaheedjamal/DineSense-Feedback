from datetime import datetime, timedelta, timezone
import uuid
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session

from .ai.provider import provider
from .auth.dependencies import get_current_user, record_audit, require_roles
from .core.config import settings
from .core.security import create_access_token, hash_password, verify_password
from .database.session import Base, engine, get_db
from .models.entities import (
    AuditLog,
    ConsentEvent,
    FeedbackEvent,
    ServiceAction,
    SurveyResponse,
    User,
    Venue,
)
from .schemas.dtos import (
    ConsentCreateRequest,
    InferenceEventRequest,
    LoginRequest,
    RegisterRequest,
    ServiceActionCreateRequest,
    SurveyCreateRequest,
    VenueCreateRequest,
)

Base.metadata.create_all(bind=engine)

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="DineSense Feedback API",
    description="Privacy-first restaurant feedback and optional consent-verified expression-cue analytics API.",
    version="1.0.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "dinesense-fastapi"}


@app.post("/api/auth/register", status_code=201)
@limiter.limit("30/15minutes")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")

    venue_id = None
    role = "restaurant_manager"
    if payload.restaurant_name:
        venue = Venue(
            restaurant_name=payload.restaurant_name.strip(),
            location=(payload.location or "Main Branch").strip(),
            contact_email=email,
        )
        db.add(venue)
        db.flush()
        venue_id = venue.id
        role = "restaurant_admin"

    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=role,
        venue_id=venue_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    record_audit(db, user.id, user.email, "REGISTER_ACCOUNT", "user", str(user.id), "success")

    token = create_access_token({"sub": str(user.id), "role": user.role, "venue_id": user.venue_id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "venue_id": user.venue_id,
        },
    }


@app.post("/api/auth/login")
@limiter.limit("60/15minutes")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        record_audit(db, user.id if user else None, email, "LOGIN_FAILED", "auth", None, "denied")
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="Account is inactive.")

    token = create_access_token({"sub": str(user.id), "role": user.role, "venue_id": user.venue_id})
    record_audit(db, user.id, user.email, "LOGIN_SUCCESS", "auth", str(user.id), "success")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "venue_id": user.venue_id,
        },
    }


@app.get("/api/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "user": {
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role,
            "venue_id": current_user.venue_id,
        }
    }


@app.get("/api/venues")
def list_venues(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == "super_admin":
        venues = db.query(Venue).all()
    else:
        venues = db.query(Venue).filter(Venue.id == current_user.venue_id).all()
    return {"venues": venues}


@app.post("/api/venues", status_code=201)
def create_venue(
    payload: VenueCreateRequest,
    current_user: User = Depends(require_roles("super_admin")),
    db: Session = Depends(get_db),
):
    venue = Venue(
        restaurant_name=payload.restaurant_name,
        location=payload.location,
        contact_email=payload.contact_email.lower(),
        welcome_message=payload.welcome_message or "We value your dining experience.",
        camera_feedback_enabled=payload.camera_feedback_enabled,
        qr_feedback_enabled=payload.qr_feedback_enabled,
        retention_days=payload.retention_days,
    )
    db.add(venue)
    db.commit()
    db.refresh(venue)
    record_audit(db, current_user.id, current_user.email, "CREATE_VENUE", "venue", str(venue.id), "success")
    return {"venue": venue}


@app.post("/api/consents", status_code=201)
def create_consent(payload: ConsentCreateRequest, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == payload.venue_id, Venue.status == "active").first()
    if not venue:
        raise HTTPException(status_code=404, detail="Active venue not found.")
    consent_id = f"consent-{uuid.uuid4()}"
    row = ConsentEvent(
        id=consent_id,
        venue_id=payload.venue_id,
        notice_version=payload.notice_version,
        consent_choice=payload.consent_choice,
    )
    db.add(row)
    db.commit()
    return {"consent_id": consent_id, "consent_choice": payload.consent_choice}


@app.post("/api/inference-events")
def run_inference(payload: InferenceEventRequest, db: Session = Depends(get_db)):
    consent = db.query(ConsentEvent).filter(ConsentEvent.id == payload.consent_id).first()
    if not consent or consent.venue_id != payload.venue_id:
        raise HTTPException(status_code=403, detail="Valid affirmative consent is required before inference.")
    if consent.consent_choice != "accepted":
        raise HTTPException(status_code=403, detail="Camera consent was declined.")
    if consent.used_for_inference:
        raise HTTPException(status_code=409, detail="Consent token already used for single brief interaction.")

    consent.used_for_inference = True
    db.commit()

    result = provider.predict(
        image_base64=payload.image_base64,
        quality_metrics=payload.quality_metrics.model_dump() if payload.quality_metrics else None,
    )

    bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:00")
    event = FeedbackEvent(
        venue_id=payload.venue_id,
        time_bucket=bucket,
        model_version=result["model_version"],
        expression_cue=result["expression_cue"],
        confidence_band=result["confidence_band"],
        quality_status=result["quality_status"],
        is_demo=payload.is_demo_mode or result["is_demo"],
    )
    db.add(event)
    db.commit()
    return result


@app.post("/api/survey-responses", status_code=201)
def submit_survey(payload: SurveyCreateRequest, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == payload.venue_id, Venue.status == "active").first()
    if not venue:
        raise HTTPException(status_code=404, detail="Active venue not found.")

    overall = round(
        (payload.food_rating + payload.service_rating + payload.cleanliness_rating + payload.waiting_time_rating)
        / 4.0,
        2,
    )
    category = "positive" if overall >= 4.0 else "neutral" if overall >= 3.0 else "negative"

    row = SurveyResponse(
        venue_id=payload.venue_id,
        submission_channel=payload.submission_channel,
        used_camera_cue=payload.used_camera_cue,
        food_rating=payload.food_rating,
        service_rating=payload.service_rating,
        cleanliness_rating=payload.cleanliness_rating,
        waiting_time_rating=payload.waiting_time_rating,
        overall_rating=overall,
        feedback_category=category,
        comment=payload.comment.strip() if payload.comment else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "overall_rating": overall, "feedback_category": category}


@app.get("/api/survey-responses")
def list_surveys(
    venue_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_venue = venue_id if current_user.role == "super_admin" else current_user.venue_id
    q = db.query(SurveyResponse)
    if target_venue is not None:
        q = q.filter(SurveyResponse.venue_id == target_venue)
    rows = q.order_by(SurveyResponse.created_at.desc()).limit(200).all()
    return {"responses": rows}


@app.get("/api/dashboard/summary")
def dashboard_summary(
    venue_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_venue = venue_id if current_user.role == "super_admin" else current_user.venue_id
    q = db.query(SurveyResponse)
    cue_q = db.query(FeedbackEvent.expression_cue, func.count(FeedbackEvent.id))
    if target_venue is not None:
        q = q.filter(SurveyResponse.venue_id == target_venue)
        cue_q = cue_q.filter(FeedbackEvent.venue_id == target_venue)

    surveys = q.all()
    total = len(surveys)
    avg_overall = round(sum(s.overall_rating for s in surveys) / total, 2) if total else 0.0

    raw_cues = cue_q.group_by(FeedbackEvent.expression_cue).all()
    cues = [
        {
            "expression_cue": cue,
            "count": count if count >= settings.K_ANONYMITY_THRESHOLD else None,
            "suppressed": count < settings.K_ANONYMITY_THRESHOLD,
        }
        for cue, count in raw_cues
    ]
    return {
        "summary": {
            "total_feedback": total,
            "avg_overall_rating": avg_overall,
        },
        "expression_cue_analytics": {
            "k_anonymity_threshold": settings.K_ANONYMITY_THRESHOLD,
            "cues": cues,
        },
    }


@app.post("/api/actions", status_code=201)
def create_action(
    payload: ServiceActionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_venue = payload.venue_id if current_user.role == "super_admin" else current_user.venue_id
    if target_venue is None:
        raise HTTPException(status_code=400, detail="Venue ID required.")
    action = ServiceAction(
        venue_id=target_venue,
        issue=payload.issue,
        action_description=payload.action_description,
        assigned_role=payload.assigned_role,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return {"action": action}


@app.get("/api/admin/audit-logs")
def get_audit_logs(
    current_user: User = Depends(require_roles("super_admin")),
    db: Session = Depends(get_db),
):
    return {"logs": db.query(AuditLog).order_by(AuditLog.id.desc()).limit(100).all()}


@app.post("/api/admin/retention/purge")
def purge_old_records(
    venue_id: int | None = None,
    current_user: User = Depends(require_roles("super_admin", "restaurant_admin")),
    db: Session = Depends(get_db),
):
    target_venue = venue_id if current_user.role == "super_admin" else current_user.venue_id
    venue = db.query(Venue).filter(Venue.id == target_venue).first() if target_venue else None
    days = venue.retention_days if venue else settings.RETENTION_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    survey_q = db.query(SurveyResponse).filter(SurveyResponse.created_at < cutoff)
    cue_q = db.query(FeedbackEvent).filter(FeedbackEvent.created_at < cutoff)
    if target_venue:
        survey_q = survey_q.filter(SurveyResponse.venue_id == target_venue)
        cue_q = cue_q.filter(FeedbackEvent.venue_id == target_venue)

    deleted_surveys = survey_q.delete()
    deleted_cues = cue_q.delete()
    db.commit()
    return {
        "deleted_survey_responses": deleted_surveys,
        "deleted_feedback_events": deleted_cues,
    }


@app.get("/api/reports/export", response_class=PlainTextResponse)
def export_report(
    venue_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_venue = venue_id if current_user.role == "super_admin" else current_user.venue_id
    q = db.query(SurveyResponse)
    if target_venue is not None:
        q = q.filter(SurveyResponse.venue_id == target_venue)
    rows = q.all()
    if len(rows) < settings.K_ANONYMITY_THRESHOLD:
        raise HTTPException(
            status_code=403,
            detail=f"Export suppressed: minimum {settings.K_ANONYMITY_THRESHOLD} records required.",
        )
    avg = round(sum(r.overall_rating for r in rows) / len(rows), 2)
    return f"submissions,avg_overall_rating\n{len(rows)},{avg}\n"
