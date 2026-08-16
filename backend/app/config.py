from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    pluggy_client_id: str = ""
    pluggy_client_secret: str = ""
    db_path: str = "financas.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
