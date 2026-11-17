import os
import secrets
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: str = "development"
    DATABASE_URL: str = "sqlite:///./dinesense_fastapi.db"
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    MODEL_PATH: str = "./ml/models/mobilenetv2_cue_v1.onnx"
    INFERENCE_PROVIDER: str = "demo"
    RETENTION_DAYS: int = 90
    K_ANONYMITY_THRESHOLD: int = 5
    ABSTENTION_THRESHOLD: float = 0.55

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
