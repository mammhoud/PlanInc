import json

from django.core.management import call_command
from django.test import TestCase

from apps.notes.models import Note
from apps.operations.models import OutboxEvent

from .models import StudyItem, Task, TaskLink, Ticket


class PlanningTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def _post(self, url, payload, tenant="demo"):
        return self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT=tenant,
        )

    def test_task_crud_and_isolation(self):
        response = self._post(
            "/api/planning/tasks",
            {"title": "Write plan", "priority": "high"},
        )
        self.assertEqual(response.status_code, 201)
        task_id = response.json()["data"]["id"]

        response = self._post(
            "/api/planning/tasks",
            {"title": "Other task"},
            tenant="other",
        )
        self.assertEqual(response.status_code, 201)

        response = self.client.get(
            "/api/planning/tasks", HTTP_X_PLANINC_TENANT="demo"
        )
        body = response.json()
        self.assertEqual(body["meta"]["total"], 1)
        self.assertEqual(body["data"][0]["title"], "Write plan")

        response = self.client.get(
            f"/api/planning/tasks/{task_id}", HTTP_X_PLANINC_TENANT="other"
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.patch(
            f"/api/planning/tasks/{task_id}",
            data=json.dumps({"status": "done"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.json()["data"]["status"], "done")

        response = self.client.delete(
            f"/api/planning/tasks/{task_id}", **self.headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Task.objects.filter(tenant__slug="demo").count(), 0)

    def test_task_rejects_bad_status(self):
        response = self._post(
            "/api/planning/tasks", {"title": "Bad", "status": "exploded"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_payload")

    def test_task_links(self):
        first = self._post("/api/planning/tasks", {"title": "A"}).json()["data"]["id"]
        second = self._post("/api/planning/tasks", {"title": "B"}).json()["data"]["id"]
        response = self._post(
            f"/api/planning/tasks/{first}/links",
            {"target_id": second, "kind": "blocks"},
        )
        self.assertEqual(response.status_code, 201)
        link_id = response.json()["data"]["id"]

        response = self.client.get(
            f"/api/planning/tasks/{first}/links", **self.headers
        )
        self.assertEqual(len(response.json()["data"]), 1)

        response = self._post(
            f"/api/planning/tasks/{first}/links", {"target_id": first}
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.delete(
            f"/api/planning/links/{link_id}", **self.headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(TaskLink.objects.count(), 0)

    def test_category_attach(self):
        category = self._post(
            "/api/planning/categories", {"name": "Research"}
        ).json()["data"]["id"]
        response = self._post(
            "/api/planning/tasks",
            {"title": "With category", "category_ids": [category]},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            [c["slug"] for c in response.json()["data"]["categories"]],
            ["research"],
        )

        # Cross-tenant category ids are rejected.
        response = self._post(
            "/api/planning/tasks",
            {"title": "Bad", "category_ids": [category]},
            tenant="other",
        )
        self.assertEqual(response.status_code, 400)

    def test_ticket_flow(self):
        task_id = self._post("/api/planning/tasks", {"title": "Parent"}).json()[
            "data"
        ]["id"]
        response = self._post(
            "/api/planning/tickets",
            {"title": "Bug", "task_id": task_id},
        )
        self.assertEqual(response.status_code, 201)
        ticket_id = response.json()["data"]["id"]
        self.assertEqual(response.json()["data"]["task_id"], task_id)

        response = self.client.patch(
            f"/api/planning/tickets/{ticket_id}",
            data=json.dumps({"status": "closed"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.json()["data"]["status"], "closed")
        self.assertEqual(Ticket.objects.count(), 1)

    def test_study_review_spacing(self):
        response = self._post(
            "/api/planning/study", {"title": "Card", "status": "new"}
        )
        self.assertEqual(response.status_code, 201)
        item_id = response.json()["data"]["id"]

        response = self._post(
            f"/api/planning/study/{item_id}/review", {"correct": True}
        )
        data = response.json()["data"]
        self.assertEqual(data["review_count"], 1)
        self.assertEqual(data["interval_days"], 2)
        self.assertEqual(data["status"], "learning")

        response = self._post(
            f"/api/planning/study/{item_id}/review", {"correct": False}
        )
        data = response.json()["data"]
        self.assertEqual(data["review_count"], 2)
        self.assertEqual(data["interval_days"], 1)

        # Cross-tenant review is a 404.
        response = self._post(
            f"/api/planning/study/{item_id}/review",
            {"correct": True},
            tenant="other",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(StudyItem.objects.filter(tenant__slug="other").count(), 0)

    def test_task_can_reference_note_in_same_tenant(self):
        from apps.tenancy.models import Tenant

        tenant = Tenant.objects.get(slug="demo")
        note = Note.objects.create(tenant=tenant, title="Linked note")
        response = self._post(
            "/api/planning/tasks", {"title": "T", "note_id": note.id}
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["note_id"], note.id)

    def test_planning_emits_outbox(self):
        self._post("/api/planning/tasks", {"title": "Evented"})
        self.assertIn(
            "task.created",
            set(OutboxEvent.objects.values_list("event_type", flat=True)),
        )
