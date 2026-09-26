from django.core.management import call_command
from django.test import TestCase

from .models import Tenant


class TenancyTests(TestCase):
    def test_provision_command_is_idempotent(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "demo", name="Demo")

        self.assertEqual(Tenant.objects.filter(slug="demo").count(), 1)
        self.assertEqual(Tenant.objects.get(slug="demo").schema_name, "tenant_demo")

    def test_context_requires_a_tenant(self):
        response = self.client.get("/api/tenancy/context")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "tenant_required")

    def test_context_rejects_unknown_tenant(self):
        response = self.client.get(
            "/api/tenancy/context",
            HTTP_X_PLANINC_TENANT="demo",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "tenant_not_found")

    def test_context_returns_active_tenant(self):
        call_command("provision_tenant", "demo", name="Demo")

        response = self.client.get(
            "/api/tenancy/context",
            HTTP_X_PLANINC_TENANT="demo",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["schema_name"], "tenant_demo")


class SessionTokenTests(TestCase):
    def test_token_requires_authentication(self):
        response = self.client.post("/api/auth/token")

        self.assertEqual(response.status_code, 401)

    def test_token_claims_match_typescript_verifier_shape(self):
        import jwt as pyjwt
        from django.contrib.auth import get_user_model
        from django.test import override_settings

        from .jwt import verify_session_token

        user = get_user_model().objects.create_user(
            username="oauth-user", email="oauth-user@example.com"
        )
        self.client.force_login(user)
        with override_settings(
            PLANINC_JWT_SECRET="test-shared-with-typescript-server"
        ):
            response = self.client.post("/api/auth/token")
            self.assertEqual(response.status_code, 200)
            token = response.json()["data"]["token"]
            claims = verify_session_token(token)
        # Exact shape server/lib/helper.ts generateToken produces.
        self.assertEqual(
            set(claims.keys()), {"sub", "name", "role", "exp", "iat"}
        )
        self.assertEqual(claims["sub"], str(user.pk))
        self.assertEqual(claims["role"], "user")
        self.assertGreater(claims["exp"], claims["iat"])
        # Independently decodable with the shared secret (what TS does).
        raw = pyjwt.decode(
            token, "test-shared-with-typescript-server", algorithms=["HS256"]
        )
        self.assertEqual(raw["sub"], str(user.pk))

    def test_token_refuses_without_secret(self):
        from django.contrib.auth import get_user_model
        from django.test import override_settings

        user = get_user_model().objects.create_user(username="no-secret")
        self.client.force_login(user)
        with override_settings(PLANINC_JWT_SECRET=""):
            response = self.client.post("/api/auth/token")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["error"], "server_misconfigured")


class SocialAdapterTests(TestCase):
    def test_verified_email_links_membership_in_default_tenant(self):
        from django.contrib.auth import get_user_model
        from django.test import RequestFactory, override_settings

        from .adapters import PlanIncSocialAdapter, link_membership
        from .models import Membership, Tenant

        call_command("provision_tenant", "demo", name="Demo")
        user = get_user_model().objects.create_user(
            username="gh-user", email="gh-user@example.com"
        )
        sociallogin = type(
            "SocialLogin",
            (),
            {
                "user": user,
                "account": type("A", (), {"provider": "github"})(),
            },
        )()

        adapter = PlanIncSocialAdapter()
        with override_settings(PLANINC_DEFAULT_TENANT_SLUG="demo"):
            self.assertTrue(
                adapter.is_auto_signup_allowed(RequestFactory().get("/"), sociallogin)
            )
            membership = link_membership(user)

        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, "member")
        self.assertEqual(membership.tenant.slug, "demo")
        self.assertEqual(
            Membership.objects.filter(
                tenant__slug="demo", user=user
            ).count(),
            1,
        )
        # Idempotent: a second link does not duplicate.
        with override_settings(PLANINC_DEFAULT_TENANT_SLUG="demo"):
            link_membership(user)
        self.assertEqual(
            Membership.objects.filter(
                tenant__slug="demo", user=user
            ).count(),
            1,
        )
        self.assertIn("demo", {t.slug for t in Tenant.objects.all()})
