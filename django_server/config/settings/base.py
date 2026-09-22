import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

SECRET_KEY = os.environ.get("PLANINC_DJANGO_SECRET_KEY", "")
DEBUG = os.environ.get("PLANINC_DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("PLANINC_DJANGO_ALLOWED_HOSTS", "localhost").split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.health",
    "apps.tenancy",
    "apps.workspaces",
    "apps.notes",
    "apps.operations",
    "apps.realtime",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "middleware.request_id.RequestIdMiddleware",
    "middleware.tenant.TenantResolutionMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

DATABASES = {
    "default": {
        "ENGINE": os.environ.get(
            "PLANINC_DJANGO_DB_ENGINE",
            "django.db.backends.sqlite3",
        ),
        "NAME": os.environ.get(
            "PLANINC_DJANGO_DB_NAME",
            str(BASE_DIR / "data" / "django.sqlite3"),
        ),
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
ROOT_URLCONF = "config.urls"

PLANINC_TENANT_HEADER = "HTTP_X_PLANINC_TENANT"
PLANINC_DJANGO_BASE_HOST = os.environ.get(
    "PLANINC_DJANGO_BASE_HOST",
    "notes.structa.cloud",
)
PLANINC_TENANT_HEADER_ALLOWED = (
    os.environ.get("PLANINC_DJANGO_ALLOW_TENANT_HEADER", "false").lower() == "true"
)

PLANINC_FEATURES = {
    name: os.environ.get(f"PLANINC_ENABLE_{name}", "true").lower() == "true"
    for name in (
        "BOLT_API",
        "CHANNELS",
        "AI",
        "IMPORTS",
        "EXTERNAL_INTEGRATIONS",
    )
}
PLANINC_OBJECT_STORAGE = os.environ.get("PLANINC_OBJECT_STORAGE", "local")
PLANINC_MEDIA_ROOT = os.environ.get(
    "PLANINC_MEDIA_ROOT",
    str(BASE_DIR / "data" / "media"),
)
PLANINC_MEDIA_BUCKET = os.environ.get("PLANINC_MEDIA_BUCKET", "")
PLANINC_LOG_LEVEL = os.environ.get("PLANINC_LOG_LEVEL", "INFO").upper()
PLANINC_METRICS_ENABLED = (
    os.environ.get("PLANINC_METRICS_ENABLED", "false").lower() == "true"
)
PLANINC_SENTRY_DSN = os.environ.get("PLANINC_SENTRY_DSN", "")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": os.environ.get(
            "PLANINC_CHANNEL_LAYER",
            "channels.layers.InMemoryChannelLayer",
        ),
        "CONFIG": {
            "hosts": [
                os.environ.get("PLANINC_REDIS_URL", "redis://127.0.0.1:6379/2")
            ]
        },
    }
}
