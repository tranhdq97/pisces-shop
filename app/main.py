from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.exceptions import AppException, app_exception_handler, unhandled_exception_handler
from app.modules.auth.router import router as auth_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.menu.router import router as menu_router
from app.modules.orders.router import router as orders_router
from app.modules.payroll.router import router as payroll_router
from app.modules.rbac.router import router as rbac_router
from app.modules.recipes.router import router as recipes_router
from app.modules.sop.router import router as sop_router
from app.modules.suppliers.router import router as suppliers_router
from app.modules.tables.router import router as tables_router
from app.modules.inventory.router import router as inventory_router
from app.modules.financials.router import router as financials_router

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: idempotently seed default roles and permissions
    from app.modules.rbac.service import RBACService  # noqa: PLC0415
    from app.modules.sop.service import SOPService  # noqa: PLC0415

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await RBACService(session).seed_defaults()
            await SOPService(session).seed_master_data()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Production domains + regex for local/Docker (127.0.0.1:8001, localhost, any port).
    # Module scripts use crossorigin; without a matching ACAO, browsers block assets and the app can appear broken.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["https://pisces-shop.online", "https://www.pisces-shop.online"],
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    app.include_router(auth_router,      prefix="/api/v1")
    app.include_router(menu_router,      prefix="/api/v1")
    app.include_router(orders_router,    prefix="/api/v1")
    app.include_router(sop_router,       prefix="/api/v1")
    app.include_router(dashboard_router, prefix="/api/v1")
    app.include_router(rbac_router,      prefix="/api/v1")
    app.include_router(tables_router,    prefix="/api/v1")
    app.include_router(inventory_router, prefix="/api/v1")
    app.include_router(suppliers_router, prefix="/api/v1")
    app.include_router(payroll_router,   prefix="/api/v1")
    app.include_router(recipes_router,   prefix="/api/v1")
    app.include_router(financials_router, prefix="/api/v1")

    @app.get("/health", tags=["Health"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok", "version": settings.APP_VERSION}

    # Serve built frontend — must be AFTER all API routes
    if FRONTEND_DIST.exists():
        index_html = FRONTEND_DIST / "index.html"

        @app.get("/", include_in_schema=False)
        async def spa_index():
            return FileResponse(index_html)

        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            # Serve real files (favicon.svg, icons.svg, etc.) that live in dist root
            candidate = (FRONTEND_DIST / full_path).resolve()
            dist_root = FRONTEND_DIST.resolve()
            if candidate.is_file() and str(candidate).startswith(str(dist_root)):
                return FileResponse(candidate)
            return FileResponse(index_html)

    return app


app = create_app()
