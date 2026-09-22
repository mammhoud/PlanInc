import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

from config.routing import application
