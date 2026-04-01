from fastapi import Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    def __init__(self, status_code: int, detail: str, code: str | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    content: dict = {"error": exc.detail}
    if exc.code:
        content["code"] = exc.code
    return JSONResponse(status_code=exc.status_code, content=content)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "An unexpected internal error occurred."},
    )
