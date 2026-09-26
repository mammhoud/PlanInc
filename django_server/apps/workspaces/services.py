from datetime import timedelta
import secrets

from django.db import transaction
from django.utils import timezone

from apps.tenancy.models import Tenant

from .models import Workspace, WorkspaceInvite, WorkspaceMember


@transaction.atomic
def create_workspace(
    *,
    tenant: Tenant,
    name: str,
    slug: str,
    owner=None,
) -> Workspace:
    workspace = Workspace.objects.create(tenant=tenant, name=name, slug=slug)
    if owner is not None:
        WorkspaceMember.objects.create(
            workspace=workspace,
            user=owner,
            role="owner",
        )
    return workspace


def can_access_workspace(*, workspace: Workspace, user, minimum_role: str = "viewer"):
    if workspace.tenant_id is None or not workspace.is_active:
        return False
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    membership = WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
    ).first()
    if membership is None:
        return False
    role_order = {"viewer": 0, "editor": 1, "admin": 2, "owner": 3}
    return role_order[membership.role] >= role_order[minimum_role]


@transaction.atomic
def create_invite(
    *, workspace: Workspace, created_by, role: str = "editor", ttl_days: int = 7
) -> WorkspaceInvite:
    if role not in ("editor", "viewer"):
        raise ValueError("Invite role must be editor or viewer.")
    if not can_access_workspace(
        workspace=workspace, user=created_by, minimum_role="admin"
    ):
        raise PermissionError("Only workspace admins/owners can invite.")
    return WorkspaceInvite.objects.create(
        workspace=workspace,
        token=secrets.token_urlsafe(24),
        role=role,
        created_by=created_by if getattr(created_by, "pk", None) else None,
        expires_at=timezone.now() + timedelta(days=ttl_days),
    )


@transaction.atomic
def accept_invite(*, token: str, user) -> WorkspaceMember:
    if user is None or not getattr(user, "is_authenticated", False):
        raise PermissionError("Sign in to accept an invite.")
    try:
        invite = WorkspaceInvite.objects.select_related(
            "workspace", "workspace__tenant"
        ).get(token=token)
    except WorkspaceInvite.DoesNotExist:
        raise ValueError("Unknown invite token.")
    if not invite.is_valid():
        raise ValueError("Invite is expired, used, or inactive.")
    member, _ = WorkspaceMember.objects.get_or_create(
        workspace=invite.workspace,
        user=user,
        defaults={"role": invite.role},
    )
    invite.accepted_at = timezone.now()
    invite.save(update_fields=["accepted_at"])
    return member

