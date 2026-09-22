from .base import *

DEBUG = True
SECRET_KEY = SECRET_KEY or "local-only-planinc-django-secret"
ALLOWED_HOSTS = ["localhost", "127.0.0.1", *ALLOWED_HOSTS]
PLANINC_TENANT_HEADER_ALLOWED = True
