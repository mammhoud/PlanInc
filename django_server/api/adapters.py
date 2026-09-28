"""Transport adapters between domain services and the API surfaces.

Views, django-bolt endpoints, and django-fusion fragments validate transport
input, call a service (inside
``domain.services.transactions.service_transaction`` for writes), and serialize
the result with the shared envelope. Expected ``ServiceError`` failures become
the standard error envelope; anything else is left to Django's error handling
so genuine bugs are not masked.
"""

from __future__ import annotations

from functools import wraps

from domain.errors import ServiceError

from .envelopes import from_service_error


def service_view(view):
    """Decorator: render ``ServiceError`` from a Django view as an envelope."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except ServiceError as exc:
            return from_service_error(exc)

    return wrapper


def run_service(service, /, **kwargs):
    """Call a domain service, returning ``(error_response, result)``.

    Exactly one of the two is ``None``. Bolt endpoints and Fusion fragments
    cannot use view decorators, so they adapt service calls through this
    single helper instead of re-implementing error handling.
    """
    try:
        return None, service(**kwargs)
    except ServiceError as exc:
        return from_service_error(exc), None
