from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.notes.models import Note
from apps.notes.services import attach_tag, create_tag
from apps.tenancy.models import Tenant
from apps.workspaces.services import create_workspace

from .models import SearchDocument
from .services import index_note, index_resource, reindex_tenant, search


class SearchProjectionTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.tenant = Tenant.objects.get(slug="demo")
        self.other = Tenant.objects.get(slug="other")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def test_index_and_tenant_scoped_search(self):
        note = Note.objects.create(tenant=self.tenant, title="Alpha note", body="body")
        index_note(note=note)
        other_note = Note.objects.create(
            tenant=self.other, title="Alpha other", body="body"
        )
        index_note(note=other_note)

        response = self.client.get("/api/search?q=alpha", **self.headers)
        body = response.json()
        self.assertEqual(body["meta"]["total"], 1)
        self.assertEqual(body["data"][0]["title"], "Alpha note")

    def test_tag_filter(self):
        note = Note.objects.create(tenant=self.tenant, title="Tagged")
        tag = create_tag(tenant=self.tenant, name="Urgent")
        attach_tag(note=note, tag=tag)
        index_note(note=note)
        response = self.client.get("/api/search?tag=urgent", **self.headers)
        self.assertEqual(response.json()["meta"]["total"], 1)
        response = self.client.get("/api/search?tag=missing", **self.headers)
        self.assertEqual(response.json()["meta"]["total"], 0)

    def test_workspace_visibility_is_permission_aware(self):
        user_model = get_user_model()
        member = user_model.objects.create_user(username="member", password="x")
        outsider = user_model.objects.create_user(username="outsider", password="x")
        workspace = create_workspace(
            tenant=self.tenant, name="Team", slug="team", owner=member
        )
        note = Note.objects.create(
            tenant=self.tenant, title="Private", workspace=workspace
        )
        index_note(note=note)
        tenant_wide = Note.objects.create(tenant=self.tenant, title="Public")
        index_note(note=tenant_wide)

        # Anonymous cannot see the workspace-scoped document.
        documents, total = search(tenant=self.tenant, query="")
        self.assertEqual(total, 1)
        self.assertEqual(documents[0].title, "Public")

        # A member sees both.
        documents, total = search(tenant=self.tenant, user=member)
        self.assertEqual(total, 2)

        # A non-member still cannot see the private document.
        documents, total = search(tenant=self.tenant, user=outsider)
        self.assertEqual(total, 1)

    def test_reindex_rebuilds_from_sources(self):
        Note.objects.create(tenant=self.tenant, title="One")
        Note.objects.create(tenant=self.tenant, title="Two")
        counts = reindex_tenant(tenant=self.tenant)
        self.assertEqual(counts["note"], 2)
        self.assertEqual(
            SearchDocument.objects.filter(tenant=self.tenant).count(), 2
        )

    def test_remove_document(self):
        from .services import remove_document

        note = Note.objects.create(tenant=self.tenant, title="Bye")
        index_note(note=note)
        remove_document(tenant=self.tenant, object_type="note", object_id=note.pk)
        self.assertEqual(SearchDocument.objects.count(), 0)

    def test_resource_projection(self):
        from apps.knowledge.models import Resource

        resource = Resource.objects.create(
            tenant=self.tenant, title="Docs", description="read me"
        )
        index_resource(resource=resource)
        response = self.client.get("/api/search?q=read", **self.headers)
        self.assertEqual(response.json()["meta"]["total"], 1)
