from .base import *

DEBUG = False
SECRET_KEY = "test-only-planinc-django-secret"
ALLOWED_HOSTS = ["testserver", "localhost"]
PLANINC_TENANT_HEADER_ALLOWED = True
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
