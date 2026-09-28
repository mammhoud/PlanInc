"""Shared domain error taxonomy for PlanInc services.

Services and policies raise :class:`ServiceError` subclasses; transport
adapters (django-bolt endpoints, django-fusion fragments, and Django views in
``api.adapters``) translate them into the standard JSON envelope. Error codes
are part of the client contract and must stay stable.
"""

from __future__ import annotations


class ErrorCode:
    """Stable, client-visible error codes."""

    INVALID_PAYLOAD = "invalid_payload"
    UNAUTHENTICATED = "unauthorized"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    ALREADY_EXISTS = "already_exists"
    TENANT_REQUIRED = "tenant_required"
    TENANT_NOT_FOUND = "tenant_not_found"
    SERVER_MISCONFIGURED = "server_misconfigured"
    RATE_LIMITED = "rate_limited"
    INTERNAL = "internal_error"


class ServiceError(Exception):
    """Base class for expected, transport-mappable service failures."""

    code = ErrorCode.INTERNAL
    status = 500
    default_message = "Internal error."

    def __init__(self, message: str | None = None, *, details: dict | None = None):
        self.message = message or self.default_message
        self.details = details or None
        super().__init__(self.message)


class ValidationError(ServiceError):
    code = ErrorCode.INVALID_PAYLOAD
    status = 400
    default_message = "The request payload is invalid."


class AuthenticationError(ServiceError):
    code = ErrorCode.UNAUTHENTICATED
    status = 401
    default_message = "Authentication is required."


class AuthorizationError(ServiceError):
    code = ErrorCode.FORBIDDEN
    status = 403
    default_message = "You do not have access to this resource."


class NotFoundError(ServiceError):
    code = ErrorCode.NOT_FOUND
    status = 404
    default_message = "The resource was not found."


class ConflictError(ServiceError):
    code = ErrorCode.ALREADY_EXISTS
    status = 409
    default_message = "The resource already exists."


class TenantRequiredError(ServiceError):
    code = ErrorCode.TENANT_REQUIRED
    status = 400
    default_message = "Resolve a tenant by hostname or approved header."


class TenantNotFoundError(ServiceError):
    code = ErrorCode.TENANT_NOT_FOUND
    status = 404
    default_message = "Tenant is unknown or inactive."


class ConfigurationError(ServiceError):
    code = ErrorCode.SERVER_MISCONFIGURED
    status = 500
    default_message = "Server is misconfigured."
