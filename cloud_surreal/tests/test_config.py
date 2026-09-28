from app.config import Settings


def test_settings_from_env_reads_values():
    settings = Settings.from_env(
        {
            "PLANINC_DB_FILE": "/tmp/x.db",
            "PLANINC_DB_NS": "space",
            "PLANINC_DB_NAME": "db",
            "NEXTAUTH_SECRET": "secret",
            "PLANINC_PORT": "2222",
        }
    )
    assert settings.db_file == "/tmp/x.db"
    assert settings.db_ns == "space"
    assert settings.db_name == "db"
    assert settings.jwt_secret == "secret"
    assert settings.port == 2222
    assert settings.db_url == "surrealkv:///tmp/x.db"


def test_settings_defaults():
    settings = Settings.from_env({"NEXTAUTH_SECRET": "s"})
    assert settings.db_file == "./data/planinc.db"
    assert settings.db_ns == "planinc"
    assert settings.db_name == "planinc"
    assert settings.port == 1111
