from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from middleware.tenant import require_tenant

from .jwt import issue_session_token, role_for_user
from .models import Tenant


def context(request):
    missing = require_tenant(request)
    if missing:
        return missing
    tenant_context = request.tenant_context
    try:
        tenant = Tenant.objects.get(slug=tenant_context.slug, is_active=True)
    except Tenant.DoesNotExist:
        return JsonResponse(
            {"error": "tenant_not_found", "message": "Tenant is unknown or inactive."},
            status=404,
        )
    return JsonResponse(
        {
            "status": "success",
            "data": {
                "slug": tenant.slug,
                "name": tenant.name,
                "schema_name": tenant.schema_name,
                "source": tenant_context.source,
            },
        }
    )


@require_http_methods(["POST"])
def session_token(request):
    """Exchange an authenticated Django session (post-allauth OAuth) for a JWT.

    The token carries the TS claims shape so the Express server and the
    ``/api/auth/profile`` bearer flow accept it directly.
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return JsonResponse({"error": "unauthorized"}, status=401)
    try:
        token = issue_session_token(user)
    except ValueError:
        return JsonResponse(
            {"error": "server_misconfigured", "message": "JWT secret is not set."},
            status=500,
        )
    return JsonResponse(
        {
            "status": "success",
            "data": {
                "token": token,
                "role": role_for_user(user),
                "username": user.get_username(),
            },
        }
    )
