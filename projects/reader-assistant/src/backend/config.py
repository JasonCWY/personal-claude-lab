from __future__ import annotations

from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env from the repo root regardless of where uvicorn is launched from
_ENV_FILE = Path(__file__).parent.parent.parent.parent.parent / ".env"

# Populate os.environ too, so shared/claude_client.py's os.environ read works
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str
    supabase_service_key: str


settings = Settings()
