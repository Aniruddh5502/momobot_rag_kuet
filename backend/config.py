# backend/config.py
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # Supabase Configuration
    SUPABASE_URL: str = Field(..., description="Supabase project URL")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., description="Supabase service role key for admin access")
    DATABASE_URL: str = Field(..., description="Postgres connection string for LangGraph checkpointer")
    
    # Ollama Configuration
    OLLAMA_URL: str = Field("http://localhost:11434", description="OLLAMA base URL")
    OLLAMA_EMBEDDING_MODEL: str = Field("nomic-embed-text", description="Model used for embeddings")
    
    # Application Settings
    LOG_LEVEL: str = Field("INFO", description="Logging level (DEBUG, INFO, WARNING, ERROR)")
    OLLAMA_TIMEOUT: int = Field(120, description="Timeout for Ollama API requests in seconds")
    
    # Pydantic configuration to read from .env file automatically
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8",
        extra="ignore" 
    )

# Instantiate a singleton for the app to use
settings = Settings()
