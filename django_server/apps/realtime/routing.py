from django.urls import path

from .consumers import TenantConsumer

websocket_urlpatterns = [
    path("ws/tenant", TenantConsumer.as_asgi()),
]
