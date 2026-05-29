from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User, UserPermission, RolePermission, Permission, UserRole


SYSTEM_PERMISSIONS = {
    "tickets": ["create_ticket", "edit_ticket", "delete_ticket", "close_ticket", "reopen_ticket", "assign_ticket", "export_ticket"],
    "reports": ["view_reports", "export_reports"],
    "calling": ["upload_data", "manual_calling", "predictive_calling"],
    "users": ["create_user", "edit_user", "deactivate_user"],
    "forms": ["create_form", "edit_form", "delete_form"],
    "clients": ["view_clients", "edit_clients", "activate_client"],
    "campaigns": ["create_campaign", "edit_campaign", "delete_campaign"],
    "alerts": ["create_alert", "edit_alert", "delete_alert"],
    "audit": ["view_audit"],
}


async def get_user_permissions(user: User, db: AsyncSession) -> List[str]:
    if user.role == UserRole.ADMIN:
        perms = []
        for module_perms in SYSTEM_PERMISSIONS.values():
            perms.extend(module_perms)
        return perms

    permissions = set()

    if user.role_id:
        result = await db.execute(
            select(Permission.slug)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == user.role_id, RolePermission.granted == True)
        )
        for row in result.fetchall():
            permissions.add(row[0])

    result = await db.execute(
        select(Permission.slug, UserPermission.granted)
        .join(UserPermission, UserPermission.permission_id == Permission.id)
        .where(UserPermission.user_id == user.id)
    )
    for slug, granted in result.fetchall():
        if granted:
            permissions.add(slug)
        else:
            permissions.discard(slug)

    return list(permissions)


async def has_permission(user: User, permission: str, db: AsyncSession) -> bool:
    perms = await get_user_permissions(user, db)
    return permission in perms


def require_permission(permission: str):
    from fastapi import Depends, HTTPException, status
    from app.middleware.auth import get_current_user
    from app.core.database import get_db

    async def checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if current_user.role == UserRole.ADMIN:
            return current_user
        allowed = await has_permission(current_user, permission, db)
        if not allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Permission denied: {permission}")
        return current_user
    return checker
