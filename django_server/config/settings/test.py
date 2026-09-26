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
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
