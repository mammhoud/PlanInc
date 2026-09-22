from django.db import transaction

from apps.tenancy.models import Tenant

from .models import Workspace, WorkspaceMember


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
    membership = WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
    ).first()
    if membership is None:
        return False
    role_order = {"viewer": 0, "editor": 1, "admin": 2, "owner": 3}
    return role_order[membership.role] >= role_order[minimum_role]

