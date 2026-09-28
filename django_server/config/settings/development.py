from .base import *

DEBUG = True
SECRET_KEY = SECRET_KEY or "local-only-planinc-django-secret"
ALLOWED_HOSTS = ["localhost", "127.0.0.1", *ALLOWED_HOSTS]
PLANINC_TENANT_HEADER_ALLOWED = True
# Local-only credential key so provider encryption works without env setup.
PLANINC_AI_ENCRYPTION_KEY = (
    PLANINC_AI_ENCRYPTION_KEY or "local-only-planinc-ai-encryption-key"
)
# Local-only session JWT secret so dev/test can issue and verify tokens.
PLANINC_JWT_SECRET = PLANINC_JWT_SECRET or "local-only-planinc-jwt-secret-key-32"
