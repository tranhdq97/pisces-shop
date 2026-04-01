import uuid
from contextvars import ContextVar

# Per-request current user — set by get_current_user, read by the before_flush
# event listener to auto-populate created_by_id / updated_by_id on every ORM model.
_current_user_id: ContextVar[uuid.UUID | None] = ContextVar("_current_user_id", default=None)


def set_request_user(user_id: uuid.UUID | None) -> None:
    _current_user_id.set(user_id)


def get_request_user_id() -> uuid.UUID | None:
    return _current_user_id.get()
