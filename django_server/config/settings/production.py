from .base import *

if not SECRET_KEY:
    raise RuntimeError("PLANINC_DJANGO_SECRET_KEY is required in production")
if DEBUG:
    raise RuntimeError("PLANINC_DJANGO_DEBUG must be false in production")
if not ALLOWED_HOSTS or ALLOWED_HOSTS == ["localhost"]:
    raise RuntimeError("PLANINC_DJANGO_ALLOWED_HOSTS must name production hosts")
if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise RuntimeError("Production requires PostgreSQL via PLANINC_DJANGO_DB_ENGINE")
if not os.environ.get("PLANINC_REDIS_URL"):
    raise RuntimeError("Production requires PLANINC_REDIS_URL")
if PLANINC_OBJECT_STORAGE == "local":
    raise RuntimeError("Production requires object storage via PLANINC_OBJECT_STORAGE")

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CHANNEL_LAYERS["default"] = {
    "BACKEND": "channels_redis.core.RedisChannelLayer",
    "CONFIG": {
        "hosts": [os.environ.get("PLANINC_REDIS_URL", "redis://redis:6379/2")]
    },
}
