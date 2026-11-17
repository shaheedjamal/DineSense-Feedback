from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from ..core.security import decode_access_token
from ..database.session import get_db
from ..models.entities import AuditLog, User

bearer_scheme = HTTPBearer(auto_error=False)


def record_audit(
    db: Session,
    actor_id: int | None,
    actor_email: str | None,
    action: str,
    object_type: str,
    object_id: str | None,
    result: str,
) -> None:
    entry = AuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        object_type=object_type,
        object_id=object_id,
        result=result,
    )
    db.add(entry)
    db.commit()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
        )
    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive or does not exist.",
        )
    return user


def require_roles(*roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return checker
