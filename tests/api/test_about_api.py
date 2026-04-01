"""API tests for public landing / about content."""

import uuid

import pytest

# Minimal 1×1 PNG
_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture
def about_upload_dir(tmp_path, monkeypatch):
    import app.modules.about.service as about_svc

    root = tmp_path / "about_media"
    root.mkdir()
    monkeypatch.setattr(about_svc, "ABOUT_MEDIA_DIR", root)
    return root


@pytest.fixture
def about_site_dir(tmp_path, monkeypatch):
    import app.modules.about.service as about_svc

    root = tmp_path / "about_site"
    root.mkdir()
    monkeypatch.setattr(about_svc, "ABOUT_SITE_DIR", root)
    return root


@pytest.mark.asyncio
async def test_get_about_public_returns_defaults(client):
    r = await client.get("/api/v1/about")
    assert r.status_code == 200
    data = r.json()
    assert data["restaurant_intro"] == ""
    assert data["workshop_intro"] == ""
    assert data["social_facebook_url"] is None
    assert data["tiktok_qr_url"] is None
    assert data["media"] == []


@pytest.mark.asyncio
async def test_put_about_requires_superadmin(client, admin_token):
    r = await client.put(
        "/api/v1/about",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"restaurant_intro": "Hello"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_put_about_superadmin_text_only(client, superadmin_token):
    body = {
        "restaurant_intro": "Our café",
        "workshop_intro": "Pottery workshop",
        "contact_phone": "+84 9",
        "contact_email": "hi@example.com",
        "contact_address": "District 1",
        "social_facebook_url": "https://facebook.com/example",
        "social_zalo_phone": "84901234567",
        "social_tiktok_url": "https://www.tiktok.com/@example",
    }
    r = await client.put(
        "/api/v1/about",
        headers={"Authorization": f"Bearer {superadmin_token}"},
        json=body,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["restaurant_intro"] == "Our café"
    assert data["social_facebook_url"] == "https://facebook.com/example"
    assert data["social_tiktok_url"] == "https://www.tiktok.com/@example"
    assert data["media"] == []

    pub = await client.get("/api/v1/about")
    assert pub.status_code == 200
    assert pub.json()["contact_email"] == "hi@example.com"


@pytest.mark.asyncio
async def test_tiktok_qr_upload_public_file_and_delete(client, superadmin_token, about_upload_dir, about_site_dir):
    up = await client.post(
        "/api/v1/about/tiktok-qr",
        headers={"Authorization": f"Bearer {superadmin_token}"},
        files={"file": ("qr.png", _PNG, "image/png")},
    )
    assert up.status_code == 200
    payload = up.json()
    assert payload["tiktok_qr_url"] == "/api/v1/about/files/tiktok-qr"

    raw = await client.get("/api/v1/about/files/tiktok-qr")
    assert raw.status_code == 200
    assert raw.content.startswith(b"\x89PNG")

    cleared = await client.delete(
        "/api/v1/about/tiktok-qr",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert cleared.status_code == 200
    assert cleared.json()["tiktok_qr_url"] is None

    gone = await client.get("/api/v1/about/files/tiktok-qr")
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_upload_get_delete_media(client, superadmin_token, about_upload_dir):
    r = await client.post(
        "/api/v1/about/media",
        headers={"Authorization": f"Bearer {superadmin_token}"},
        files={"file": ("test.png", _PNG, "image/png")},
    )
    assert r.status_code == 200
    row = r.json()
    mid = uuid.UUID(row["id"])
    assert row["media_type"] == "image"
    assert row["url"].startswith("/api/v1/about/files/")

    raw = await client.get(f"/api/v1/about/files/{mid}")
    assert raw.status_code == 200
    assert raw.content.startswith(b"\x89PNG")

    pub = await client.get("/api/v1/about")
    assert len(pub.json()["media"]) == 1

    d = await client.delete(
        f"/api/v1/about/media/{mid}",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert d.status_code == 204

    gone = await client.get(f"/api/v1/about/files/{mid}")
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_patch_media_order(client, superadmin_token, about_upload_dir):
    r1 = await client.post(
        "/api/v1/about/media",
        headers={"Authorization": f"Bearer {superadmin_token}"},
        files={"file": ("a.png", _PNG, "image/png")},
    )
    r2 = await client.post(
        "/api/v1/about/media",
        headers={"Authorization": f"Bearer {superadmin_token}"},
        files={"file": ("b.png", _PNG, "image/png")},
    )
    id1 = uuid.UUID(r1.json()["id"])
    id2 = uuid.UUID(r2.json()["id"])

    p = await client.patch(
        "/api/v1/about/media",
        headers={"Authorization": f"Bearer {superadmin_token}"},
        json={
            "items": [
                {"id": str(id1), "caption": "second", "sort_order": 1},
                {"id": str(id2), "caption": "first", "sort_order": 0},
            ]
        },
    )
    assert p.status_code == 200
    media = p.json()["media"]
    assert media[0]["id"] == str(id2)
    assert media[0]["caption"] == "first"
