from django.test import RequestFactory, SimpleTestCase, override_settings
from django.http import HttpResponse

from .request_id import RequestIdMiddleware
from .tenant import TenantResolutionMiddleware, resolve_tenant

TENANT_TEST_HOSTS = [
    "testserver",
    "localhost",
    "notes.structa.cloud",
    ".notes.structa.cloud",
]


class MiddlewareTests(SimpleTestCase):
    def test_request_id_is_returned(self):
        request = RequestFactory().get("/health")
        middleware = RequestIdMiddleware(lambda request: HttpResponse())

        response = middleware(request)

        self.assertTrue(response["X-Request-ID"])

    def test_local_tenant_header_is_explicit(self):
        request = RequestFactory().get(
            "/api/example",
            HTTP_X_PLANINC_TENANT="demo",
            HTTP_HOST="localhost",
        )

        context = resolve_tenant(request)

        self.assertEqual(context.slug, "demo")
        self.assertEqual(context.source, "header")

    def test_invalid_tenant_header_is_rejected(self):
        request = RequestFactory().get(
            "/api/example",
            HTTP_X_PLANINC_TENANT="INVALID",
            HTTP_HOST="localhost",
        )

        self.assertIsNone(resolve_tenant(request))

    @override_settings(ALLOWED_HOSTS=TENANT_TEST_HOSTS)
    def test_canonical_host_does_not_become_a_tenant(self):
        request = RequestFactory().get(
            "/health",
            HTTP_HOST="notes.structa.cloud",
        )

        self.assertIsNone(resolve_tenant(request))

    @override_settings(ALLOWED_HOSTS=TENANT_TEST_HOSTS)
    def test_tenant_subdomain_is_resolved(self):
        request = RequestFactory().get(
            "/api/example",
            HTTP_HOST="demo.notes.structa.cloud",
        )

        context = resolve_tenant(request)

        self.assertEqual(context.slug, "demo")
        self.assertEqual(context.source, "hostname")

        # and it must not respawn from the raw hostname
        self.assertEqual(context.slug, "demo")
