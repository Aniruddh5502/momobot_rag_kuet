import re
from typing import Tuple

# List of phrases commonly used in prompt injection attacks
FORBIDDEN_PHRASES = [
    r"ignore previous instructions",
    r"forget your instructions",
    r"you are now a",
    r"dan mode",
    r"system prompt",
    r"act as a",
    r"bypass filters",
    r"do anything now",
]

# Regex for LLM-specific control tokens and delimiters
# This targets tags like <|system|>, <|user|>, [INST], etc.
CONTROL_TOKEN_PATTERN = r"<\|.*?\|>|\[INST\]|\[\/INST\]|\[SYSTEM\]|\[\/SYSTEM\]"

def sanitize_input(text: str) -> Tuple[str, bool]:
    """
    Cleans user input to prevent prompt injection and token manipulation.
    
    Returns:
        Tuple of (sanitized_text, was_modified)
    """
    if not text:
        return "", False
    
    original_text = text
    was_modified = False
    
    # 1. Remove LLM control tokens/delimiters
    text = re.sub(CONTROL_TOKEN_PATTERN, "", text, flags=re.IGNORECASE)
    if text != original_text:
        was_modified = True
    
    # 2. Remove forbidden injection phrases
    for phrase in FORBIDDEN_PHRASES:
        # We use case-insensitive regex replacement
        pattern = re.compile(phrase, re.IGNORECASE)
        if pattern.search(text):
            text = pattern.sub("[REMOVED]", text)
            was_modified = True
            
    return text.strip(), was_modified
