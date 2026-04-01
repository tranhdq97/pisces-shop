"""On-disk directory for uploaded landing-page images and videos."""

from pathlib import Path

# app/modules/about/storage.py → parents[3] == repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
ABOUT_MEDIA_DIR = REPO_ROOT / "data" / "about_media"
ABOUT_SITE_DIR = REPO_ROOT / "data" / "about_site"
