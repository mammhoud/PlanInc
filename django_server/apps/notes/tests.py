from django.core.management import call_command
from django.test import TestCase

from .models import Note
from apps.operations.models import OutboxEvent


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
        self.assertEqual(OutboxEvent.objects.filter(tenant__slug="demo").count(), 1)

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
