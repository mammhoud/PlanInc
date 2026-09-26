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
    "django.contrib.sites",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.github",
    "allauth.socialaccount.providers.google",
    "apps.health",
    "apps.tenancy",
    "apps.workspaces",
    "apps.notes",
    "apps.operations",
    "apps.realtime",
]

SITE_ID = int(os.environ.get("PLANINC_DJANGO_SITE_ID", "1"))

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# allauth: email-verified login, OAuth app credentials from env (never commit).
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
SOCIALACCOUNT_ADAPTER = "apps.tenancy.adapters.PlanIncSocialAdapter"
SOCIALACCOUNT_PROVIDERS = {
    "github": {
        "APP": {
            "client_id": os.environ.get("PLANINC_GITHUB_CLIENT_ID", ""),
            "secret": os.environ.get("PLANINC_GITHUB_CLIENT_SECRET", ""),
        }
    },
    "google": {
        "APP": {
            "client_id": os.environ.get("PLANINC_GOOGLE_CLIENT_ID", ""),
            "secret": os.environ.get("PLANINC_GOOGLE_CLIENT_SECRET", ""),
        },
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
    },
}

# Session JWT authority: must match the TS server secret (it reads
# process.env.JWT_SECRET first, else the Surreal config JWT_SECRET).
# Copy the same value here so TS verifyToken() accepts Django-issued tokens.
PLANINC_JWT_SECRET = os.environ.get(
    "JWT_SECRET", os.environ.get("PLANINC_JWT_SECRET", "")
)
PLANINC_JWT_TTL_SECONDS = int(
    os.environ.get("PLANINC_JWT_TTL_SECONDS", str(30 * 24 * 60 * 60))
)
# Tenant that OAuth newcomers join when no invite/tenant context is present.
PLANINC_DEFAULT_TENANT_SLUG = os.environ.get("PLANINC_DEFAULT_TENANT_SLUG", "")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.common.CommonMiddleware",
    "middleware.request_id.RequestIdMiddleware",
    "middleware.tenant.TenantResolutionMiddleware",
    "allauth.account.middleware.AccountMiddleware",
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
