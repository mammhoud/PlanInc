"""django-bolt integration boundary.

The exact public constructor is kept in one module so package upgrades do not
leak through every domain app. Endpoint registration will be added with the
first migrated domain slice.
"""


def create_bolt_api():
    try:
        from bolt import BoltAPI
    except ImportError as exc:
        raise RuntimeError(
            "django-bolt is required to construct the PlanInc Bolt API."
        ) from exc
    return BoltAPI()
