import json

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

    def test_workspace_list_supports_pagination_search_and_ordering(self):
        for name, slug in (("Beta", "beta"), ("Alpha", "alpha")):
            response = self.client.post(
                "/api/workspaces",
                data=f'{{"name":"{name}","slug":"{slug}"}}',
                content_type="application/json",
                HTTP_X_PLANINC_TENANT="demo",
            )
            self.assertEqual(response.status_code, 201)

        response = self.client.get(
            "/api/workspaces?page=1&page_size=1",
            HTTP_X_PLANINC_TENANT="demo",
        )
        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(body["data"]), 1)
        self.assertEqual(
            body["meta"], {"page": 1, "page_size": 1, "total": 2}
        )
        # Default ordering is by name: Alpha first.
        self.assertEqual(body["data"][0]["slug"], "alpha")

        response = self.client.get(
            "/api/workspaces?search=beta",
            HTTP_X_PLANINC_TENANT="demo",
        )
        body = response.json()
        self.assertEqual([ws["slug"] for ws in body["data"]], ["beta"])

        response = self.client.get(
            "/api/workspaces?ordering=bogus",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 400)


class WorkspaceInviteTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        call_command("provision_tenant", "demo", name="Demo")
        self.owner = get_user_model().objects.create_user(username="owner")
        self.guest = get_user_model().objects.create_user(username="guest")
        response = self.client.post(
            "/api/workspaces",
            data='{"name":"Personal","slug":"personal"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.workspace_id = response.json()["data"]["id"]
        from .models import WorkspaceMember

        WorkspaceMember.objects.create(
            workspace_id=self.workspace_id, user=self.owner, role="owner"
        )

    def test_invite_requires_admin_and_accept_adds_member(self):
        # Non-member cannot invite.
        self.client.force_login(self.guest)
        response = self.client.post(
            f"/api/workspaces/{self.workspace_id}/invites",
            data='{"role":"editor"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 403)

        # Owner invites; guest accepts and becomes editor.
        self.client.force_login(self.owner)
        response = self.client.post(
            f"/api/workspaces/{self.workspace_id}/invites",
            data='{"role":"editor"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 201)
        token = response.json()["data"]["token"]

        self.client.force_login(self.guest)
        response = self.client.post(
            "/api/workspaces/invites/accept",
            data=json.dumps({"token": token}),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["role"], "editor")

        # Token is single-use.
        response = self.client.post(
            "/api/workspaces/invites/accept",
            data=json.dumps({"token": token}),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 404)

    def test_invite_rejects_bad_role_and_unknown_token(self):
        from django.contrib.auth import get_user_model

        self.client.force_login(self.owner)
        response = self.client.post(
            f"/api/workspaces/{self.workspace_id}/invites",
            data='{"role":"owner"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 400)

        stranger = get_user_model().objects.create_user(username="stranger")
        self.client.force_login(stranger)
        response = self.client.post(
            "/api/workspaces/invites/accept",
            data=json.dumps({"token": "nope"}),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 404)


class WorkspaceTenantScopeTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")

    def test_schema_name_is_wired_at_provisioning(self):
        from apps.tenancy.models import Tenant
        from apps.tenancy.services import schema_name_for_slug, tenant_schema_context

        tenant = Tenant.objects.get(slug="demo")
        self.assertEqual(tenant.schema_name, schema_name_for_slug("demo"))
        with tenant_schema_context(tenant) as scoped:
            self.assertEqual(scoped.pk, tenant.pk)

    def test_workspace_resolves_only_inside_its_tenant(self):
        from django.test import RequestFactory

        from middleware.tenant import TenantContext, resolve_workspace

        response = self.client.post(
            "/api/workspaces",
            data='{"name":"Personal","slug":"personal"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        workspace_id = response.json()["data"]["id"]

        factory = RequestFactory()
        request = factory.get(f"/api/workspaces/{workspace_id}")
        request.tenant_context = TenantContext(slug="demo", source="header")
        error, workspace = resolve_workspace(request, workspace_id)
        self.assertIsNone(error)
        self.assertEqual(workspace.slug, "personal")

        request = factory.get(f"/api/workspaces/{workspace_id}")
        request.tenant_context = TenantContext(slug="other", source="header")
        error, workspace = resolve_workspace(request, workspace_id)
        self.assertIsNone(workspace)
        self.assertEqual(error.status_code, 404)

    def test_workspace_policy_rejects_cross_tenant_space(self):
        from apps.tenancy.models import Tenant
        from domain.policies.tenant import TenantAccessError, require_workspace_scope

        demo = Tenant.objects.get(slug="demo")
        other = Tenant.objects.get(slug="other")
        from .models import Workspace

        workspace = Workspace.objects.create(
            tenant=demo, name="Personal", slug="personal"
        )
        self.assertEqual(
            require_workspace_scope(tenant=demo, workspace=workspace).pk,
            workspace.pk,
        )
        with self.assertRaises(TenantAccessError):
            require_workspace_scope(tenant=other, workspace=workspace)

