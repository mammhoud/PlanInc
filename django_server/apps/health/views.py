from django.db import connection
from django.http import JsonResponse


def health(request):
    return JsonResponse({"status": "ok", "service": "planinc-django"})


def readiness(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as exc:
        return JsonResponse(
            {"status": "not_ready", "database": "unavailable", "error": str(exc)},
            status=503,
        )
    return JsonResponse({"status": "ready", "database": "available"})
