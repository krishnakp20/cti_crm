from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from app.models.user import User, UserRole
from app.models.session import UserSession
from app.middleware.auth import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    mobile: Optional[str] = None
    company_name: str
    company_email: str
    company_mobile: Optional[str] = None
    website: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    access_token = create_access_token({"sub": str(user.id), "role": user.role, "client_id": user.client_id})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=expires_at,
    )
    db.add(session)
    await db.execute(update(User).where(User.id == user.id).values(last_login=datetime.now(timezone.utc)))
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "client_id": user.client_id,
            "avatar_url": user.avatar_url,
        }
    }


@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    from app.models.client import Client, ClientStatus
    import re

    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    slug = re.sub(r'[^a-z0-9]', '-', req.company_name.lower())

    client = Client(
        company_name=req.company_name,
        slug=slug,
        email=req.company_email,
        mobile=req.company_mobile,
        website=req.website,
        status=ClientStatus.PENDING,
    )
    db.add(client)
    await db.flush()

    user = User(
        email=req.email,
        full_name=req.full_name,
        mobile=req.mobile,
        hashed_password=get_password_hash(req.password),
        role=UserRole.CLIENT,
        client_id=client.id,
        is_active=False,
    )
    db.add(user)
    await db.commit()
    return {"message": "Registration successful. Awaiting admin approval."}


@router.post("/refresh")
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(
        select(UserSession).where(
            UserSession.refresh_token == req.refresh_token,
            UserSession.is_active == True,
        )
    )
    session = result.scalar_one_or_none()
    if not session or session.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=401, detail="Session expired")

    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    access_token = create_access_token({"sub": str(user.id), "role": user.role, "client_id": user.client_id})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(UserSession).where(UserSession.refresh_token == req.refresh_token).values(is_active=False)
    )
    await db.commit()
    return {"message": "Logged out"}


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.execute(
        update(User).where(User.id == current_user.id).values(hashed_password=get_password_hash(req.new_password))
    )
    await db.commit()
    return {"message": "Password changed"}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "client_id": current_user.client_id,
        "avatar_url": current_user.avatar_url,
        "is_active": current_user.is_active,
    }
