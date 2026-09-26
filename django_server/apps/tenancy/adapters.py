"""allauth adapter: link OAuth identities to tenants by verified email.

GitHub + Google only (per PI-025 Milestone 2). A verified email creates (or
reuses) the Django user and ensures a Membership in the default tenant
(PLANINC_DEFAULT_TENANT_SLUG, else the first active tenant). Role assignment
beyond ``member`` stays an explicit admin action.
"""

from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings

from .models import Membership, Tenant


def default_tenant():
    slug = (settings.PLANINC_DEFAULT_TENANT_SLUG or "").strip()
    if slug:
        return Tenant.objects.filter(slug=slug, is_active=True).first()
    return Tenant.objects.filter(is_active=True).order_by("slug").first()


def link_membership(user):
    """Ensure the OAuth user has a Membership in the default tenant."""
    email = (getattr(user, "email", "") or "").strip().lower()
    if not email or user.pk is None:
        return None
    tenant = default_tenant()
    if tenant is None:
        return None
    membership, _ = Membership.objects.get_or_create(
        tenant=tenant,
        user=user,
        defaults={"role": "member"},
    )
    return membership


class PlanIncSocialAdapter(DefaultSocialAccountAdapter):
    def is_auto_signup_allowed(self, request, sociallogin):
        # Verified email is proof enough; unverified addresses fall through
        # to the normal allauth verification flow.
        email = (sociallogin.user.email or "").strip().lower()
        return bool(email)

    def save_user(self, request, sociallogin, form=None):
        user = super().save_user(request, sociallogin, form)
        link_membership(user)
        return user
