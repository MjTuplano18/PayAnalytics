"""Security Guard Service for AI Chat Assistant.

This module provides security validation and sanitization for AI chat interactions.
Since this system is admin-only, topic filtering is minimal — the admin has full
access to all payment analytics data. Security focuses on preventing SQL injection
and prompt injection only.
"""

import logging
import re
from dataclasses import dataclass
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ValidationResult:
    """Result of a security validation check."""

    is_valid: bool
    error_message: str | None = None
    details: dict[str, Any] | None = None


class SecurityGuard:
    """Security validation and sanitization service for AI chat interactions.

    Admin-only system: topic filtering is relaxed. The admin can ask anything
    about their payment data. Security focuses on:
    - Preventing SQL injection in generated queries
    - Preventing prompt injection attacks
    - Keeping responses XSS-safe for the frontend
    """

    PROMPT_INJECTION_PATTERNS = [
        r"ignore\s+(?:all\s+)?previous\s+instructions?",
        r"ignore\s+(?:all\s+)?prior\s+instructions?",
        r"disregard\s+(?:all\s+)?previous\s+instructions?",
        r"forget\s+(?:all\s+)?previous\s+instructions?",
        r"ignore\s+(?:your\s+)?system\s+prompt",
        r"override\s+(?:your\s+)?instructions?",
        r"bypass\s+(?:your\s+)?instructions?",
        r"you\s+are\s+now\s+(?:a|an)\s+\w+",
        r"pretend\s+(?:to\s+be|you\s+are)\s+(?:a|an)\s+\w+",
        r"roleplay\s+as\s+(?:a|an)\s+\w+",
        r"from\s+now\s+on,?\s+you\s+are",
        r"reveal\s+(?:your\s+)?(?:system\s+)?prompt",
        r"show\s+(?:me\s+)?(?:your\s+)?system\s+prompt",
        r"jailbreak",
        r"DAN\s+mode",
        r"base64\s*:",
        r"rot13\s*:",
    ]

    MIN_QUERY_LENGTH = 1
    MAX_QUERY_LENGTH = 2000

    def __init__(self) -> None:
        self._compiled_patterns = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.PROMPT_INJECTION_PATTERNS
        ]
        logger.info(f"SecurityGuard initialized with {len(self._compiled_patterns)} prompt injection patterns")

    def validate_input(self, query: str) -> ValidationResult:
        """Validate user input for security threats."""
        if not query or not query.strip():
            return ValidationResult(
                is_valid=False,
                error_message="Query cannot be empty.",
                details={"validation_type": "empty_query"}
            )

        if len(query) > self.MAX_QUERY_LENGTH:
            return ValidationResult(
                is_valid=False,
                error_message=f"Query is too long. Maximum length is {self.MAX_QUERY_LENGTH} characters.",
                details={"validation_type": "length", "length": len(query)}
            )

        for pattern in self._compiled_patterns:
            match = pattern.search(query)
            if match:
                logger.warning(f"Prompt injection attempt detected: '{match.group(0)}'")
                return ValidationResult(
                    is_valid=False,
                    error_message="Your query contains potentially unsafe content. Please rephrase your question.",
                    details={"validation_type": "prompt_injection", "matched_pattern": match.group(0)}
                )

        return ValidationResult(is_valid=True)

    def validate_sql(self, sql: str) -> ValidationResult:
        """Validate generated SQL meets security constraints."""
        if not sql or not sql.strip():
            return ValidationResult(
                is_valid=False,
                error_message="SQL query cannot be empty.",
                details={"validation_type": "empty_sql"}
            )

        sql_normalized = " ".join(sql.lower().split())

        # Only SELECT allowed
        for keyword in ["insert", "update", "delete", "drop", "alter", "create", "truncate", "replace", "merge", "grant", "revoke"]:
            if re.search(r"\b" + keyword + r"\b", sql_normalized):
                return ValidationResult(
                    is_valid=False,
                    error_message=f"SQL query contains unauthorized operation: {keyword.upper()}",
                    details={"validation_type": "dangerous_keyword", "keyword": keyword}
                )

        if not sql_normalized.strip().startswith("select"):
            return ValidationResult(
                is_valid=False,
                error_message="Only SELECT queries are allowed.",
                details={"validation_type": "not_select"}
            )

        if "limit" not in sql_normalized:
            return ValidationResult(
                is_valid=False,
                error_message="SQL query must include a LIMIT clause.",
                details={"validation_type": "missing_limit"}
            )

        # LIMIT max 5000 for admin
        limit_match = re.search(r"\blimit\s+(\d+)", sql_normalized)
        if limit_match:
            limit_value = int(limit_match.group(1))
            if limit_value > 5000:
                return ValidationResult(
                    is_valid=False,
                    error_message=f"LIMIT value {limit_value} exceeds maximum allowed (5000).",
                    details={"validation_type": "limit_exceeded", "limit_value": limit_value}
                )

        # SQL injection patterns
        for pattern in [r";\s*--", r";\s*drop", r";\s*delete", r";\s*insert", r";\s*update",
                        r"'\s*or\s+'1'\s*=\s*'1", r"'\s*or\s+1\s*=\s*1", r"xp_cmdshell",
                        r"exec\s*\(", r"execute\s*\("]:
            if re.search(pattern, sql_normalized):
                return ValidationResult(
                    is_valid=False,
                    error_message="SQL query contains potentially malicious patterns.",
                    details={"validation_type": "sql_injection", "pattern": pattern}
                )

        # Authorized tables only — extract table names after FROM/JOIN, not subquery values
        authorized_tables = [
            "payment_records", "upload_sessions", "uploads", "users",
            "reference_data", "conversations", "chat_messages", "ai_audit_logs", "token_usage",
        ]
        # Match table name after FROM/JOIN but stop at WHERE, ON, SET, or end
        # Use a stricter pattern that won't match string values in WHERE clauses
        from_matches = re.findall(r"\bfrom\s+([a-z_][a-z0-9_]*)\b(?!\s*=)", sql_normalized)
        join_matches = re.findall(r"\bjoin\s+([a-z_][a-z0-9_]*)\b(?!\s*=)", sql_normalized)
        table_matches = from_matches + join_matches
        # Filter out SQL keywords that aren't table names
        sql_keywords = {"select", "where", "and", "or", "not", "in", "on", "as", "by", "order",
                        "group", "having", "limit", "offset", "union", "all", "distinct", "case",
                        "when", "then", "else", "end", "null", "true", "false", "between", "like"}
        for table_name in table_matches:
            if table_name in sql_keywords:
                continue
            if table_name not in authorized_tables:
                return ValidationResult(
                    is_valid=False,
                    error_message=f"Access to table '{table_name}' is not authorized.",
                    details={"validation_type": "unauthorized_table", "table_name": table_name}
                )

        return ValidationResult(is_valid=True)

    def sanitize_output(self, ai_response: str) -> str:
        """Sanitize AI response — remove dangerous tags only, preserve formatting."""
        if not ai_response:
            return ""

        sanitized = ai_response
        sanitized = re.sub(r"<script[^>]*>.*?</script>", "", sanitized, flags=re.IGNORECASE | re.DOTALL)
        for tag in [r"<iframe[^>]*>.*?</iframe>", r"<object[^>]*>.*?</object>",
                    r"<embed[^>]*>.*?</embed>", r"<style[^>]*>.*?</style>"]:
            sanitized = re.sub(tag, "", sanitized, flags=re.IGNORECASE | re.DOTALL)
        sanitized = re.sub(r'\bon\w+\s*=\s*["\'][^"\']*["\']', "", sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r'javascript:[^\s\)]+', "[removed]", sanitized, flags=re.IGNORECASE)

        if len(sanitized) > 10000:
            sanitized = sanitized[:10000] + "\n\n[Response truncated — use a more specific query for full details]"

        return sanitized

    GREETING_PATTERNS = [
        r"^(good\s+)?(morning|afternoon|evening|night|day)[\s!.]*$",
        r"^(hi|hello|hey|howdy|greetings)[\s!.]*$",
        r"^how are you[\s!.?]*$",
        r"^(thanks|thank you|thx|ty)[\s!.]*$",
    ]

    BLOCKED_KEYWORDS = [
        "password", "credential", "api key", "private key",
        "weather", "sports", "movie", "music", "game",
        "recipe", "medical diagnosis", "legal advice",
    ]

    def check_topic(self, user_query: str, ai_client=None) -> ValidationResult:
        """Check if query is appropriate. Admin-only — very permissive."""
        query_lower = user_query.lower().strip()

        for pattern in self.GREETING_PATTERNS:
            if re.match(pattern, query_lower, re.IGNORECASE):
                return ValidationResult(
                    is_valid=False,
                    error_message=(
                        "Hello! I'm your payment analytics assistant. "
                        "Ask me anything about your payment data — banks, collections, "
                        "touchpoints, accounts, environments, or upload history."
                    ),
                    details={"validation_type": "greeting"}
                )

        for keyword in self.BLOCKED_KEYWORDS:
            if keyword in query_lower:
                return ValidationResult(
                    is_valid=False,
                    error_message="I can only help with payment analytics questions.",
                    details={"validation_type": "blocked_topic", "matched_keyword": keyword}
                )

        return ValidationResult(is_valid=True)

    async def check_topic_async(
        self,
        user_query: str,
        ai_client=None,
        has_conversation_context: bool = False,
    ) -> ValidationResult:
        """Async topic check. Admin-only — passes almost everything through."""
        return self.check_topic(user_query, ai_client)
