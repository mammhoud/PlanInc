import json

from django.test import RequestFactory, SimpleTestCase, TestCase

from api.adapters import run_service, service_view
from api.envelopes import failure, from_service_error, success
from domain.errors import (
    AuthorizationError,
    NotFoundError,
    ValidationError,
)


def body(response):
    return json.loads(response.content)


class EnvelopeTests(SimpleTestCase):
    def test_success_envelope_shape(self):
        response = success({"id": 1}, meta={"page": 1})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            body(response),
            {
                "status": "success",
                "message": "",
                "data": {"id": 1},
                "meta": {"page": 1},
            },
        )

    def test_failure_envelope_shape(self):
        response = failure("invalid_payload", "bad", status=400)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            body(response),
            {"status": "error", "error": "invalid_payload", "message": "bad"},
        )

    def test_from_service_error_maps_code_and_status(self):
        response = from_service_error(NotFoundError("nope"))

        self.assertEqual(response.status_code, 404)
        payload = body(response)
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error"], "not_found")
        self.assertEqual(payload["message"], "nope")


class AdapterTests(SimpleTestCase):
    def test_service_view_converts_service_error(self):
        @service_view
        def view(request):
            raise AuthorizationError("nope")

        response = view(RequestFactory().get("/"))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(body(response)["error"], "forbidden")

    def test_service_view_passes_through_result(self):
        @service_view
        def view(request):
            return success({"ok": True})

        response = view(RequestFactory().get("/"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(body(response)["data"], {"ok": True})

    def test_run_service_returns_result_or_error(self):
        error, result = run_service(lambda **kwargs: kwargs["value"] + 1, value=1)

        self.assertIsNone(error)
        self.assertEqual(result, 2)

        def boom(**kwargs):
            raise ValidationError("bad")

        error, result = run_service(boom)

        self.assertIsNone(result)
        self.assertEqual(error.status_code, 400)
        self.assertEqual(body(error)["error"], "invalid_payload")

    def test_unexpected_exception_is_not_swallowed(self):
        @service_view
        def view(request):
            raise RuntimeError("boom")

        with self.assertRaises(RuntimeError):
            view(RequestFactory().get("/"))


class BoltRegistryTests(SimpleTestCase):
    def test_registry_paths_are_versioned(self):
        from api.bolt_api import API_PREFIX, route_registry

        routes = route_registry()
        self.assertTrue(routes)
        for spec in routes:
            self.assertTrue(spec.full_path.startswith(API_PREFIX))
            self.assertIn(spec.method, {"GET", "POST", "PATCH", "PUT", "DELETE"})

    def test_openapi_document_has_paths_and_security(self):
        from api.bolt_api import openapi_document

        document = openapi_document()
        self.assertEqual(document["openapi"], "3.1.0")
        self.assertIn("/api/v1/notes", document["paths"])
        self.assertIn("get", document["paths"]["/api/v1/notes"])
        self.assertIn("sessionJwt", document["components"]["securitySchemes"])

    def test_openapi_rejects_unknown_version(self):
        from api.bolt_api import openapi_document

        with self.assertRaises(ValueError):
            openapi_document("v9")

    def test_create_bolt_api_requires_dependency(self):
        from api.bolt_api import create_bolt_api

        try:
            import bolt  # noqa: F401
        except ImportError:
            with self.assertRaises(RuntimeError):
                create_bolt_api()


class OpenApiViewTests(TestCase):
    def test_openapi_endpoint(self):
        response = self.client.get("/api/openapi.json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("paths", response.json())

    def test_versioned_openapi_endpoint(self):
        response = self.client.get("/api/v1/openapi.json")
        self.assertEqual(response.status_code, 200)

    def test_unknown_version_is_404(self):
        response = self.client.get("/api/v9/openapi.json")
        self.assertEqual(response.status_code, 404)
