"""HTTP Accept-Language → app locale slug for user-facing messages."""


def preferred_locale_from_accept_language(value: str | None) -> str:
    if not value or not str(value).strip():
        return "en"
    first = str(value).split(",")[0].split(";")[0].strip().lower()
    if first.startswith("vi"):
        return "vi"
    return "en"
