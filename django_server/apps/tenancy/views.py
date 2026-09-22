from django.http import JsonResponse

from middleware.tenant import require_tenant

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
