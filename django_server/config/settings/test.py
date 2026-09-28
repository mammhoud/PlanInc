from . import base
from .base import *

DEBUG = False
SECRET_KEY = "test-only-planinc-django-secret"
ALLOWED_HOSTS = [
    "testserver",
    "localhost",
    base.PLANINC_DJANGO_BASE_HOST,
    f".{base.PLANINC_DJANGO_BASE_HOST}",
]
PLANINC_TENANT_HEADER_ALLOWED = True
PLANINC_AI_ENCRYPTION_KEY = "test-only-planinc-ai-encryption-key"
PLANINC_JWT_SECRET = "test-only-planinc-jwt-secret-key-32chars"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
