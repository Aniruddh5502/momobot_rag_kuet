import logging
import os
import sys

def setup_logging():
    """
    Configures the logging system for the backend.
    Log level is determined by the LOG_LEVEL environment variable.
    """
    log_level_str = os.environ.get("LOG_LEVEL", "INFO").upper()
    
    # Valid levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
    level = getattr(logging, log_level_str, logging.INFO)
    
    # Formatter for consistent, structured log messages
    # Format: [Timestamp] [Level] [Module] Message
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console handler for standard output
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    
    # Initialize root logger
    logging.basicConfig(
        level=level,
        handlers=[console_handler],
        force=True # Overwrite any existing configuration
    )
    
    # Optional: Reduce noise from third-party libraries
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("fastapi").setLevel(logging.WARNING)
    logging.getLogger("supabase").setLevel(logging.WARNING)

def get_logger(name: str):
    """
    Returns a logger instance for a specific module.
    """
    return logging.getLogger(name)
