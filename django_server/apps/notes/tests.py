import json

from django.core.management import call_command
from django.test import TestCase

from apps.operations.models import OutboxEvent

from .models import Note, NoteComment, NoteVersion


class NotesIsolationTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")

    def test_notes_are_scoped_to_tenant(self):
        response = self.client.post(
            "/api/notes",
            data='{"title":"Same id","body":"demo"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 201)
        note_id = response.json()["data"]["id"]

        response = self.client.get(
            "/api/notes",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.json()["data"], [])

        response = self.client.get(
            f"/api/notes/{note_id}",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Note.objects.count(), 1)
        self.assertEqual(
            OutboxEvent.objects.filter(
                tenant__slug="demo", event_type="note.created"
            ).count(),
            1,
        )

    def test_notes_list_supports_pagination_search_and_ordering(self):
        for title in ("Alpha", "Beta", "Gamma"):
            response = self.client.post(
                "/api/notes",
                data=f'{{"title":"{title}","body":"{title} body"}}',
                content_type="application/json",
                HTTP_X_PLANINC_TENANT="demo",
            )
            self.assertEqual(response.status_code, 201)

        response = self.client.get(
            "/api/notes?page=1&page_size=2",
            HTTP_X_PLANINC_TENANT="demo",
        )
        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(body["data"]), 2)
        self.assertEqual(
            body["meta"], {"page": 1, "page_size": 2, "total": 3}
        )

        response = self.client.get(
            "/api/notes?search=beta",
            HTTP_X_PLANINC_TENANT="demo",
        )
        body = response.json()
        self.assertEqual([note["title"] for note in body["data"]], ["Beta"])

        response = self.client.get(
            "/api/notes?ordering=title",
            HTTP_X_PLANINC_TENANT="demo",
        )
        body = response.json()
        self.assertEqual(
            [note["title"] for note in body["data"]],
            ["Alpha", "Beta", "Gamma"],
        )

        response = self.client.get(
            "/api/notes?page=0",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.get(
            "/api/notes?ordering=bogus",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 400)


class NotesRichModelTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def _create(self, title, body=""):
        response = self.client.post(
            "/api/notes",
            data=json.dumps({"title": title, "body": body}),
            content_type="application/json",
            **self.headers,
        )
        assert response.status_code == 201, response.content
        return response.json()["data"]["id"]

    def test_updates_create_version_history(self):
        note_id = self._create("Alpha", "one")
        response = self.client.get(f"/api/notes/{note_id}/versions", **self.headers)
        self.assertEqual(len(response.json()["data"]), 1)
        self.assertEqual(response.json()["data"][0]["version"], 1)

        self.client.patch(
            f"/api/notes/{note_id}",
            data=json.dumps({"body": "two"}),
            content_type="application/json",
            **self.headers,
        )
        response = self.client.get(f"/api/notes/{note_id}/versions", **self.headers)
        versions = response.json()["data"]
        self.assertEqual([row["version"] for row in versions], [2, 1])
        self.assertEqual(versions[0]["body"], "two")

        response = self.client.get(f"/api/notes/{note_id}/history", **self.headers)
        body = response.json()["data"]
        self.assertEqual(len(body["versions"]), 2)
        self.assertIn("comments", body)

    def test_restore_version(self):
        note_id = self._create("Alpha", "one")
        self.client.patch(
            f"/api/notes/{note_id}",
            data=json.dumps({"body": "two"}),
            content_type="application/json",
            **self.headers,
        )
        version_one = NoteVersion.objects.get(note_id=note_id, version=1)
        response = self.client.post(
            f"/api/notes/{note_id}/versions/{version_one.id}/restore",
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["body"], "one")
        self.assertEqual(NoteVersion.objects.filter(note_id=note_id).count(), 3)

    def test_tags_attach_set_and_isolate(self):
        note_id = self._create("Alpha")
        response = self.client.post(
            "/api/tags",
            data=json.dumps({"name": "Urgent"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        tag_id = response.json()["data"]["id"]

        response = self.client.post(
            f"/api/notes/{note_id}/tags",
            data=json.dumps({"tag_id": tag_id}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(len(response.json()["data"]), 1)

        response = self.client.get(f"/api/notes/{note_id}", **self.headers)
        self.assertEqual(response.json()["data"]["tags"][0]["slug"], "urgent")

        response = self.client.get(
            "/api/notes?tag=urgent", **self.headers
        )
        self.assertEqual(len(response.json()["data"]), 1)

        # A tag from another tenant cannot be attached.
        response = self.client.post(
            f"/api/notes/{note_id}/tags",
            data=json.dumps({"tag_id": tag_id}),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)

    def test_duplicate_tag_conflict(self):
        self.client.post(
            "/api/tags",
            data=json.dumps({"name": "Urgent"}),
            content_type="application/json",
            **self.headers,
        )
        response = self.client.post(
            "/api/tags",
            data=json.dumps({"name": "urgent"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 409)

    def test_comments_lifecycle(self):
        note_id = self._create("Alpha")
        response = self.client.post(
            f"/api/notes/{note_id}/comments",
            data=json.dumps({"body": "first"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        comment_id = response.json()["data"]["id"]

        response = self.client.get(
            f"/api/notes/{note_id}/comments", **self.headers
        )
        self.assertEqual(len(response.json()["data"]), 1)

        response = self.client.patch(
            f"/api/notes/{note_id}/comments/{comment_id}",
            data=json.dumps({"body": "first!", "resolved": True}),
            content_type="application/json",
            **self.headers,
        )
        self.assertTrue(response.json()["data"]["is_resolved"])

        response = self.client.delete(
            f"/api/notes/{note_id}/comments/{comment_id}", **self.headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            NoteComment.objects.filter(note_id=note_id).count(), 0
        )

    def test_comments_are_tenant_scoped(self):
        note_id = self._create("Alpha")
        self.client.post(
            f"/api/notes/{note_id}/comments",
            data=json.dumps({"body": "private"}),
            content_type="application/json",
            **self.headers,
        )
        response = self.client.get(
            f"/api/notes/{note_id}/comments",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)

    def test_links_and_backlinks(self):
        source_id = self._create("Source")
        target_id = self._create("Target")
        response = self.client.post(
            f"/api/notes/{source_id}/links",
            data=json.dumps({"target_id": target_id}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)

        response = self.client.get(
            f"/api/notes/{target_id}/backlinks", **self.headers
        )
        backlinks = response.json()["data"]
        self.assertEqual(len(backlinks), 1)
        self.assertEqual(backlinks[0]["note_id"], source_id)

        # Self links are rejected at the service and DB level.
        response = self.client.post(
            f"/api/notes/{source_id}/links",
            data=json.dumps({"target_id": source_id}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 400)

        # Cross-tenant target is a 404, never a cross-tenant link.
        response = self.client.post(
            f"/api/notes/{source_id}/links",
            data=json.dumps({"target_id": target_id}),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)

    def test_rich_writes_emit_outbox_events(self):
        note_id = self._create("Alpha")
        self.client.patch(
            f"/api/notes/{note_id}",
            data=json.dumps({"body": "changed"}),
            content_type="application/json",
            **self.headers,
        )
        self.client.post(
            f"/api/notes/{note_id}/comments",
            data=json.dumps({"body": "hi"}),
            content_type="application/json",
            **self.headers,
        )
        event_types = set(
            OutboxEvent.objects.filter(tenant__slug="demo").values_list(
                "event_type", flat=True
            )
        )
        self.assertIn("note.versioned", event_types)
        self.assertIn("note.commented", event_types)
