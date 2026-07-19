from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://dghr:dghr@postgres:5432/dghr"
    frontend_origin: str = "http://localhost:5173"

    # AI layer (§13) — optional; demo runs fully without these
    anthropic_api_key: str = ""
    demo_ai_mode: str = "fallback"  # "fallback" forces deterministic canned output
    model_name: str = "claude-sonnet-5"

    # Destructive-reset safety switch (default OFF). Seeding an EMPTY database always works;
    # this only gates operations that would TRUNCATE an already-populated DB — a full reseed
    # (app.seed_clean / app.seed) or POST /api/demo/reset. Keep false in any environment that
    # holds data you care about; set true only for a deliberate demo reset. See CLAUDE.md.
    allow_db_reset: bool = False


settings = Settings()


def cors_origins() -> list[str]:
    return [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
