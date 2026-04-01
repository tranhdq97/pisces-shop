"""
Seed các bộ SOP tùy chọn (chậu cây, tô tượng, …) — không chạy tự động khi khởi động app.

Chạy từ thư mục gốc repo (cần file .env / biến môi trường DATABASE_URL):

    python scripts/seed_sop_sets.py --list
    python scripts/seed_sop_sets.py chau_cay
    python scripts/seed_sop_sets.py chau_cay to_tuong
"""

import argparse
import asyncio
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

# Register users table — Base audit columns on SOPCategory FK → users.id.
import app.modules.auth.models  # noqa: F401

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.modules.sop.seed_optional_sets import OPTIONAL_SOP_SETS
from app.modules.sop.service import SOPService


async def _seed(slugs: list[str]) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        async with session.begin():
            svc = SOPService(session)
            for slug in slugs:
                name, order, tasks = OPTIONAL_SOP_SETS[slug]
                created = await svc.seed_category_if_absent(
                    category_name=name,
                    tasks=tasks,
                    sort_order=order,
                )
                if created:
                    print(f"[ok] Đã seed « {name} » ({len(tasks)} nhiệm vụ).")
                else:
                    print(f"[skip] Đã tồn tại « {name} », bỏ qua.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed các bộ SOP tùy chọn vào database.")
    parser.add_argument(
        "sets",
        nargs="*",
        metavar="SLUG",
        help="Một hoặc nhiều slug: " + ", ".join(sorted(OPTIONAL_SOP_SETS)),
    )
    parser.add_argument("--list", action="store_true", help="Liệt kê slug có sẵn rồi thoát.")

    args = parser.parse_args()

    if args.list:
        for slug in sorted(OPTIONAL_SOP_SETS):
            cat_name, order, tasks = OPTIONAL_SOP_SETS[slug]
            print(f"  {slug:12}  sort={order:3}  {cat_name}  ({len(tasks)} tasks)")
        return

    if not args.sets:
        parser.error("Cần ít nhất một SLUG, hoặc dùng --list.")

    unknown = [s for s in args.sets if s not in OPTIONAL_SOP_SETS]
    if unknown:
        print("[error] Slug không hợp lệ:", ", ".join(unknown), file=sys.stderr)
        print("Chạy: python scripts/seed_sop_sets.py --list", file=sys.stderr)
        sys.exit(1)

    asyncio.run(_seed(args.sets))


if __name__ == "__main__":
    main()
