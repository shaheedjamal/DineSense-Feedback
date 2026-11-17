import os
import pytest
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_dinesense.db"

from app.main import app  # noqa: E402
from app.database.session import Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def test_registration_login_and_rbac_isolation():
    reg = client.post(
        "/api/auth/register",
        json={
            "full_name": "Venue Owner",
            "email": "owner@bistro.test",
            "password": "StrongPassword123",
            "restaurant_name": "Test Bistro",
            "location": "Bengaluru",
        },
    )
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    venue_id = reg.json()["user"]["venue_id"]

    # Non-super-admin cannot create another venue
    denied = client.post(
        "/api/venues",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "restaurant_name": "Unauthorized Venue",
            "location": "Mumbai",
            "contact_email": "x@y.com",
        },
    )
    assert denied.status_code == 403

    # Survey submission works without authentication
    survey = client.post(
        "/api/survey-responses",
        json={
            "venue_id": venue_id,
            "food_rating": 5,
            "service_rating": 4,
            "cleanliness_rating": 5,
            "waiting_time_rating": 4,
            "comment": "Great hospitality",
        },
    )
    assert survey.status_code == 201
    assert survey.json()["feedback_category"] == "positive"


def test_consent_required_before_inference_and_abstention_on_poor_lighting():
    reg = client.post(
        "/api/auth/register",
        json={
            "full_name": "Owner Two",
            "email": "owner2@bistro.test",
            "password": "StrongPassword123",
            "restaurant_name": "Consent Cafe",
            "location": "Kochi",
        },
    )
    venue_id = reg.json()["user"]["venue_id"]

    # Inference without consent must fail with 403
    no_consent = client.post(
        "/api/inference-events",
        json={
            "venue_id": venue_id,
            "consent_id": "missing-consent",
            "quality_metrics": {
                "face_detected": True,
                "brightness": 0.5,
                "blur_score": 0.7,
                "framing_score": 0.7,
            },
        },
    )
    assert no_consent.status_code == 403

    # Declined consent must fail with 403
    declined = client.post(
        "/api/consents",
        json={"venue_id": venue_id, "consent_choice": "declined"},
    )
    assert declined.status_code == 201
    declined_inf = client.post(
        "/api/inference-events",
        json={
            "venue_id": venue_id,
            "consent_id": declined.json()["consent_id"],
            "quality_metrics": {
                "face_detected": True,
                "brightness": 0.5,
                "blur_score": 0.7,
                "framing_score": 0.7,
            },
        },
    )
    assert declined_inf.status_code == 403

    # Accepted consent with poor lighting returns safe abstention
    accepted = client.post(
        "/api/consents",
        json={"venue_id": venue_id, "consent_choice": "accepted"},
    )
    poor_light = client.post(
        "/api/inference-events",
        json={
            "venue_id": venue_id,
            "consent_id": accepted.json()["consent_id"],
            "quality_metrics": {
                "face_detected": True,
                "brightness": 0.08,
                "blur_score": 0.7,
                "framing_score": 0.7,
            },
        },
    )
    assert poor_light.status_code == 200
    assert poor_light.json()["status"] == "abstention"
    assert poor_light.json()["expression_cue"] == "uncertain"
