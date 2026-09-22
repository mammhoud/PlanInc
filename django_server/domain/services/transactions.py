from contextlib import contextmanager

from django.db import transaction


@contextmanager
def service_transaction():
    """Make domain writes atomic and publishable only after commit."""
    with transaction.atomic():
        yield

