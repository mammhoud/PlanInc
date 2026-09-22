from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class TenantTaskContext:
    tenant_slug: str
    request_id: str | None = None


def run_tenant_task(
    context: TenantTaskContext,
    operation: Callable[..., Any],
    *args,
    **kwargs,
):
    if not context.tenant_slug:
        raise ValueError("tenant_slug is required for every background task")
    return operation(*args, **kwargs)
