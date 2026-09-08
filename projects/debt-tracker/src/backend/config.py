from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env from the repo root regardless of where uvicorn is launched from.
# resolve() first: under pytest __file__ arrives as tests/../src/backend/config.py,
# and walking .parent up an unnormalised path lands two directories short.
_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # The only key this app needs. Data lives in a local SQLite file and
    # receipts in a local folder, so there are no database credentials.
    gemini_api_key: str


settings = Settings()
