from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.tenancy.jwt import issue_session_token
from domain.errors import ValidationError

from .models import AccessToken, UserProfile
from .services import (
    authenticate_access_token,
    issue_access_token,
    revoke_access_token,
    set_preference,
)


class ProfileTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="alice", email="alice@example.com", password="pw"
        )

    def test_profile_is_created_with_user(self):
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())

    def test_profile_requires_authentication(self):
        response = self.client.get("/api/account/profile")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "unauthorized")

    def test_profile_get_and_patch(self):
        self.client.force_login(self.user)
        response = self.client.patch(
            "/api/account/profile",
            data='{"display_name":"Alice","locale":"ar"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["display_name"], "Alice")
        self.assertEqual(response.json()["data"]["locale"], "ar")

        response = self.client.get("/api/account/profile")
        self.assertEqual(response.json()["data"]["display_name"], "Alice")

    def test_profile_patch_rejects_unknown_fields(self):
        self.client.force_login(self.user)
        response = self.client.patch(
            "/api/account/profile",
            data='{"is_staff":true}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class BearerAuthTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="bear", email="bear@example.com"
        )

    @override_settings(PLANINC_JWT_SECRET="test-shared-secret")
    def test_profile_accepts_session_jwt_bearer(self):
        token = issue_session_token(self.user)
        response = self.client.get(
            "/api/account/profile",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(response.status_code, 200)

    def test_invalid_bearer_is_unauthorized(self):
        response = self.client.get(
            "/api/account/profile",
            HTTP_AUTHORIZATION="Bearer not-a-token",
        )
        self.assertEqual(response.status_code, 401)


class PreferenceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="pref", email="pref@example.com"
        )
        self.client.force_login(self.user)

    def test_preferences_merge_over_http(self):
        response = self.client.put(
            "/api/account/preferences",
            data='{"theme":"dark"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"], {"theme": "dark"})

        response = self.client.put(
            "/api/account/preferences",
            data='{"density":"compact"}',
            content_type="application/json",
        )
        self.assertEqual(
            response.json()["data"], {"theme": "dark", "density": "compact"}
        )

        response = self.client.get("/api/account/preferences")
        self.assertEqual(response.json()["data"]["theme"], "dark")

    def test_preference_rejects_blank_key(self):
        with self.assertRaises(ValidationError):
            set_preference(self.user, "  ", 1)


class AccessTokenTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="tok", email="tok@example.com"
        )
        self.client.force_login(self.user)

    def test_issue_returns_plaintext_once_and_stores_hash(self):
        response = self.client.post(
            "/api/account/tokens",
            data='{"name":"cli","ttl_days":30}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        raw = response.json()["data"]["token"]
        self.assertTrue(raw)

        stored = AccessToken.objects.get(user=self.user)
        self.assertNotEqual(stored.token_hash, raw)
        self.assertEqual(stored.token_prefix, raw[:8])

        listing = self.client.get("/api/account/tokens").json()["data"]
        self.assertEqual(len(listing), 1)
        self.assertNotIn("token", listing[0])
        self.assertNotIn("token_hash", listing[0])

    def test_authenticate_and_revoke(self):
        token, raw = issue_access_token(self.user, name="cli")
        found = authenticate_access_token(raw)
        self.assertEqual(found.pk, token.pk)
        self.assertIsNotNone(found.last_used_at)

        self.assertIsNone(authenticate_access_token("nope"))
        self.assertTrue(revoke_access_token(self.user, token.pk))
        self.assertIsNone(authenticate_access_token(raw))

        self.assertEqual(
            self.client.delete(f"/api/account/tokens/{token.pk}").status_code, 200
        )

    def test_revoke_unknown_token_404(self):
        response = self.client.delete("/api/account/tokens/999999")
        self.assertEqual(response.status_code, 404)

    def test_issue_requires_name_and_valid_ttl(self):
        response = self.client.post(
            "/api/account/tokens",
            data="{}",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        with self.assertRaises(ValidationError):
            issue_access_token(self.user, name="cli", ttl_days="soon")
