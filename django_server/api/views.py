from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .bolt_api import API_VERSION, openapi_document


@require_http_methods(["GET"])
def openapi(request, version: str = API_VERSION):
    try:
        document = openapi_document(version)
    except ValueError:
        return JsonResponse(
            {
                "status": "error",
                "error": "not_found",
                "message": "Unknown API version.",
            },
            status=404,
        )
    return JsonResponse(document)
