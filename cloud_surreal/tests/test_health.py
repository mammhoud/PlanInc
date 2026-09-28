import json

from robyn import TestClient as RobynTestClient

from app.config import Settings
from app.main import create_app


def test_health_returns_ok():
    app = create_app(Settings.from_env({"PLANINC_DB_FILE": "/tmp/h.db"}))
    client = RobynTestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert json.loads(response.text) == {"status": "ok"}
