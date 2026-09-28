def create_user_profile(sender, instance, created, **kwargs):
    """Give every new user a profile so account reads never 404."""
    if not created:
        return
    from .services import ensure_profile

    ensure_profile(instance)
