from django.core.management import call_command
from django.test import TestCase


class WorkspaceIsolationTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")

    def test_workspace_creation_and_tenant_isolation(self):
        response = self.client.post(
            "/api/workspaces",
            data='{"name":"Personal","slug":"personal"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 201)
        workspace_id = response.json()["data"]["id"]

        response = self.client.get(
            "/api/workspaces",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.json()["data"], [])

        response = self.client.get(
            f"/api/workspaces/{workspace_id}",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)

