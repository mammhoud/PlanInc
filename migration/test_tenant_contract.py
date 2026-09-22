from __future__ import annotations

import unittest

from tenant_contract import TenantResolutionError, resolve_tenant, validate_slug


class TenantContractTests(unittest.TestCase):
    def test_validates_slug_and_normalizes_case(self) -> None:
        self.assertEqual(validate_slug(" Acme-1 "), "acme-1")

    def test_rejects_unsafe_slug(self) -> None:
        for slug in ("", "a", "has_underscore", "../admin", "a" * 64):
            with self.subTest(slug=slug):
                with self.assertRaises(TenantResolutionError):
                    validate_slug(slug)

    def test_hostname_has_priority(self) -> None:
        result = resolve_tenant(
            host="Acme-1.Notes.Structa.Cloud.",
            tenant_header="wrong",
            environment="development",
        )
        self.assertEqual(result.slug, "acme-1")
        self.assertEqual(result.source, "hostname")

    def test_header_is_local_only(self) -> None:
        result = resolve_tenant(
            host="localhost",
            tenant_header="local-shop",
            environment="development",
        )
        self.assertEqual(result, resolve_tenant(
            host="localhost",
            tenant_header="local-shop",
            environment="test",
        ))

        with self.assertRaises(TenantResolutionError):
            resolve_tenant(
                host="localhost",
                tenant_header="local-shop",
                environment="production",
            )

    def test_unknown_host_is_rejected(self) -> None:
        with self.assertRaises(TenantResolutionError):
            resolve_tenant(host="notes.structa.cloud")


if __name__ == "__main__":
    unittest.main()
