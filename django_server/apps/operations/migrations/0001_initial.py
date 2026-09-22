from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [("tenancy", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="OutboxEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("event_type", models.CharField(max_length=120)),
                ("aggregate_type", models.CharField(max_length=80)),
                ("aggregate_id", models.CharField(max_length=120)),
                ("payload", models.JSONField(default=dict)),
                ("idempotency_key", models.CharField(max_length=180, unique=True)),
                ("available_at", models.DateTimeField()),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("attempts", models.PositiveIntegerField(default=0)),
                ("last_error", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="outbox_events",
                        to="tenancy.tenant",
                    ),
                ),
            ],
            options={"ordering": ["available_at", "id"]},
        ),
        migrations.CreateModel(
            name="JobAttempt",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("status", models.CharField(max_length=20)),
                ("error", models.TextField(blank=True)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                (
                    "event",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="job_attempts",
                        to="operations.outboxevent",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="outboxevent",
            index=models.Index(
                fields=["published_at", "available_at"],
                name="operations__publish_5c43f9_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="outboxevent",
            index=models.Index(
                fields=["tenant", "event_type"],
                name="operations__tenant_i_1d5f86_idx",
            ),
        ),
    ]

