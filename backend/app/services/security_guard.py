"""Security Guard Service for AI Chat Assistant.

This module provides security validation and sanitization for AI chat interactions,
including prompt injection detection, SQL validation, output sanitization, and topic filtering.
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
    """Security validation and sanitization service for AI chat interactions."""

    # Comprehensive list of prompt injection patterns
    PROMPT_INJECTION_PATTERNS = [
        # Direct instruction overrides
        r"ignore\s+(?:all\s+)?previous\s+instructions?",
        r"ignore\s+(?:all\s+)?prior\s+instructions?",
        r"disregard\s+(?:all\s+)?previous\s+instructions?",
        r"forget\s+(?:all\s+)?previous\s+instructions?",
        r"ignore\s+(?:the\s+)?above",
        r"disregard\s+(?:the\s+)?above",
        r"ignore\s+(?:your\s+)?system\s+prompt",
        r"override\s+(?:your\s+)?instructions?",
        r"bypass\s+(?:your\s+)?instructions?",
        
        # Role manipulation
        r"you\s+are\s+now\s+(?:a|an)\s+\w+",
        r"act\s+as\s+(?:a|an)\s+\w+",
        r"pretend\s+(?:to\s+be|you\s+are)\s+(?:a|an)\s+\w+",
        r"simulate\s+(?:a|an)\s+\w+",
        r"roleplay\s+as\s+(?:a|an)\s+\w+",
        r"behave\s+like\s+(?:a|an)\s+\w+",
        r"you\s+must\s+act\s+as",
        r"from\s+now\s+on,?\s+you\s+are",
        r"new\s+role:\s*\w+",
        
        # System/admin commands
        r"system:\s*",
        r"admin:\s*",
        r"root:\s*",
        r"sudo\s+",
        r"execute\s+as\s+(?:admin|root|system)",
        r"run\s+as\s+(?:admin|root|system)",
        r"<\s*system\s*>",
        r"<\s*admin\s*>",
        r"\[system\]",
        r"\[admin\]",
        
        # Prompt leaking attempts
        r"show\s+(?:me\s+)?(?:your\s+)?(?:system\s+)?prompt",
        r"reveal\s+(?:your\s+)?(?:system\s+)?prompt",
        r"display\s+(?:your\s+)?(?:system\s+)?prompt",
        r"print\s+(?:your\s+)?(?:system\s+)?prompt",
        r"what\s+(?:is|are)\s+your\s+instructions?",
        r"tell\s+me\s+your\s+instructions?",
        r"show\s+(?:me\s+)?your\s+rules",
        r"what\s+are\s+your\s+rules",
        
        # Context manipulation
        r"new\s+conversation",
        r"reset\s+conversation",
        r"clear\s+(?:the\s+)?context",
        r"forget\s+(?:the\s+)?context",
        r"start\s+over",
        r"begin\s+new\s+session",
        
        # Instruction injection
        r"<\s*instruction\s*>",
        r"<\s*/\s*instruction\s*>",
        r"\[instruction\]",
        r"\[/instruction\]",
        r"{{.*instruction.*}}",
        r"new\s+instruction:",
        r"additional\s+instruction:",
        
        # Developer mode attempts
        r"developer\s+mode",
        r"debug\s+mode",
        r"admin\s+mode",
        r"god\s+mode",
        r"jailbreak",
        r"DAN\s+mode",  # "Do Anything Now"
        
        # Encoding/obfuscation attempts
        r"base64\s*:",
        r"hex\s*:",
        r"rot13\s*:",
        r"decode\s+the\s+following",
        r"\\x[0-9a-fA-F]{2}",  # Hex encoding
        r"&#\d+;",  # HTML entities
        
        # Delimiter confusion
        r"---+\s*(?:end|stop|ignore)",
        r"===+\s*(?:end|stop|ignore)",
        r"\*\*\*+\s*(?:end|stop|ignore)",
        r"####+\s*(?:end|stop|ignore)",
        
        # Output manipulation
        r"output\s+format:\s*(?:json|xml|html|code)",
        r"respond\s+(?:only\s+)?(?:in|with)\s+(?:json|xml|html|code)",
        r"format\s+(?:your\s+)?response\s+as\s+(?:json|xml|html|code)",
        
        # Privilege escalation
        r"grant\s+(?:me\s+)?(?:admin|root|system)\s+access",
        r"elevate\s+(?:my\s+)?privileges?",
        r"give\s+me\s+(?:admin|root|system)\s+rights",
        
        # Constraint removal
        r"remove\s+(?:all\s+)?(?:restrictions?|limitations?|constraints?)",
        r"disable\s+(?:all\s+)?(?:restrictions?|limitations?|constraints?)",
        r"bypass\s+(?:all\s+)?(?:restrictions?|limitations?|constraints?)",
        r"ignore\s+(?:all\s+)?(?:restrictions?|limitations?|constraints?)",
        
        # Hypothetical scenarios
        r"hypothetically,?\s+if\s+you\s+(?:were|could|had)",
        r"imagine\s+(?:if\s+)?you\s+(?:were|could|had)",
        r"what\s+if\s+you\s+(?:were|could|had)",
        r"suppose\s+you\s+(?:were|could|had)",
    ]

    # Query length constraints
    MIN_QUERY_LENGTH = 1
    MAX_QUERY_LENGTH = 1000

    def __init__(self) -> None:
        """Initialize the SecurityGuard with compiled regex patterns."""
        self._compiled_patterns = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.PROMPT_INJECTION_PATTERNS
        ]
        logger.info(f"SecurityGuard initialized with {len(self._compiled_patterns)} prompt injection patterns")

    def validate_input(self, query: str) -> ValidationResult:
        """Validate user input for security threats.

        Checks for:
        - Query length constraints (1-1000 characters)
        - Prompt injection patterns
        - Malicious content

        Args:
            query: The user's natural language query

        Returns:
            ValidationResult indicating if the input is valid and any error messages
        """
        # Check if query is empty or None
        if not query or not query.strip():
            return ValidationResult(
                is_valid=False,
                error_message="Query cannot be empty.",
                details={"validation_type": "empty_query"}
            )

        # Check query length
        query_length = len(query)
        if query_length < self.MIN_QUERY_LENGTH:
            return ValidationResult(
                is_valid=False,
                error_message=f"Query is too short. Minimum length is {self.MIN_QUERY_LENGTH} character.",
                details={"validation_type": "length", "length": query_length}
            )

        if query_length > self.MAX_QUERY_LENGTH:
            return ValidationResult(
                is_valid=False,
                error_message=f"Query is too long. Maximum length is {self.MAX_QUERY_LENGTH} characters.",
                details={"validation_type": "length", "length": query_length}
            )

        # Check for prompt injection patterns
        for pattern in self._compiled_patterns:
            match = pattern.search(query)
            if match:
                matched_text = match.group(0)
                logger.warning(
                    f"Prompt injection attempt detected: '{matched_text}' in query: '{query[:100]}...'"
                )
                return ValidationResult(
                    is_valid=False,
                    error_message="Your query contains potentially unsafe content. Please rephrase your question.",
                    details={
                        "validation_type": "prompt_injection",
                        "matched_pattern": matched_text,
                        "pattern_index": self._compiled_patterns.index(pattern)
                    }
                )

        # All checks passed
        return ValidationResult(is_valid=True)

    def validate_sql(self, sql: str) -> ValidationResult:
        """Validate generated SQL meets security constraints.

        Checks for:
        - Only SELECT statements allowed (no INSERT, UPDATE, DELETE, DROP, ALTER)
        - LIMIT clause exists and is <= 1000
        - No unauthorized table access
        - SQL injection patterns

        Args:
            sql: The generated SQL query

        Returns:
            ValidationResult indicating if the SQL is valid and any error messages
        """
        if not sql or not sql.strip():
            return ValidationResult(
                is_valid=False,
                error_message="SQL query cannot be empty.",
                details={"validation_type": "empty_sql"}
            )

        # Normalize SQL for checking (lowercase, remove extra whitespace)
        sql_normalized = " ".join(sql.lower().split())

        # Check 1: Only SELECT statements allowed
        dangerous_keywords = [
            "insert", "update", "delete", "drop", "alter", "create",
            "truncate", "replace", "merge", "grant", "revoke"
        ]
        
        for keyword in dangerous_keywords:
            # Use word boundaries to avoid false positives (e.g., "inserted_at" column)
            pattern = r"\b" + keyword + r"\b"
            if re.search(pattern, sql_normalized):
                logger.warning(f"Dangerous SQL keyword detected: {keyword} in query: {sql[:100]}...")
                return ValidationResult(
                    is_valid=False,
                    error_message=f"SQL query contains unauthorized operation: {keyword.upper()}",
                    details={"validation_type": "dangerous_keyword", "keyword": keyword}
                )

        # Check 2: Must be a SELECT statement
        if not sql_normalized.strip().startswith("select"):
            return ValidationResult(
                is_valid=False,
                error_message="Only SELECT queries are allowed.",
                details={"validation_type": "not_select"}
            )

        # Check 3: LIMIT clause must exist
        if "limit" not in sql_normalized:
            return ValidationResult(
                is_valid=False,
                error_message="SQL query must include a LIMIT clause.",
                details={"validation_type": "missing_limit"}
            )

        # Check 4: LIMIT value must be <= 1000
        limit_match = re.search(r"\blimit\s+(\d+)", sql_normalized)
        if limit_match:
            limit_value = int(limit_match.group(1))
            if limit_value > 1000:
                return ValidationResult(
                    is_valid=False,
                    error_message=f"LIMIT value {limit_value} exceeds maximum allowed (1000).",
                    details={"validation_type": "limit_exceeded", "limit_value": limit_value}
                )
        else:
            # LIMIT exists but couldn't parse the value (might be a parameter)
            # This is acceptable as long as the keyword is present
            pass

        # Check 5: Detect SQL injection patterns
        sql_injection_patterns = [
            r";\s*--",  # Comment after semicolon
            r";\s*drop",  # Drop after semicolon
            r";\s*delete",  # Delete after semicolon
            r";\s*insert",  # Insert after semicolon
            r";\s*update",  # Update after semicolon
            r"union\s+(?:all\s+)?select",  # UNION injection
            r"'\s*or\s+'1'\s*=\s*'1",  # Classic OR injection
            r"'\s*or\s+1\s*=\s*1",  # Numeric OR injection
            r"--\s*$",  # Comment at end
            r"/\*.*\*/",  # Multi-line comment
            r"xp_cmdshell",  # SQL Server command execution
            r"exec\s*\(",  # Execute command
            r"execute\s*\(",  # Execute command
        ]

        for pattern in sql_injection_patterns:
            if re.search(pattern, sql_normalized):
                logger.warning(f"SQL injection pattern detected: {pattern} in query: {sql[:100]}...")
                return ValidationResult(
                    is_valid=False,
                    error_message="SQL query contains potentially malicious patterns.",
                    details={"validation_type": "sql_injection", "pattern": pattern}
                )

        # Check 6: Validate table access (authorized tables only)
        # Define authorized tables for payment analytics
        authorized_tables = [
            "payment_records",
            "uploads",
            "users",
            "reference_data",
            "conversations",
            "chat_messages",
            "ai_audit_logs",
            "token_usage"
        ]

        # Extract table names from FROM and JOIN clauses
        # This is a simplified check - a full SQL parser would be more robust
        from_pattern = r"\bfrom\s+([a-z_][a-z0-9_]*)"
        join_pattern = r"\bjoin\s+([a-z_][a-z0-9_]*)"
        
        table_matches = re.findall(from_pattern, sql_normalized) + re.findall(join_pattern, sql_normalized)
        
        for table_name in table_matches:
            if table_name not in authorized_tables:
                logger.warning(f"Unauthorized table access detected: {table_name} in query: {sql[:100]}...")
                return ValidationResult(
                    is_valid=False,
                    error_message=f"Access to table '{table_name}' is not authorized.",
                    details={"validation_type": "unauthorized_table", "table_name": table_name}
                )

        # All checks passed
        return ValidationResult(is_valid=True)

    def sanitize_output(self, ai_response: str) -> str:
        """Sanitize AI response before sending to frontend.

        Removes or escapes:
        - <script> tags and other executable code
        - HTML entities
        - SQL commands from text
        - Non-HTTPS URLs
        - Limits response length to 5000 characters

        Args:
            ai_response: The raw AI response text

        Returns:
            Sanitized response text safe for frontend display
        """
        if not ai_response:
            return ""

        original_response = ai_response
        sanitized = ai_response

        # Step 1: Remove script tags and their content
        script_pattern = r"<script[^>]*>.*?</script>"
        if re.search(script_pattern, sanitized, re.IGNORECASE | re.DOTALL):
            sanitized = re.sub(script_pattern, "", sanitized, flags=re.IGNORECASE | re.DOTALL)
            logger.warning("Removed <script> tags from AI response")

        # Step 2: Remove other dangerous HTML tags
        dangerous_tags = [
            r"<iframe[^>]*>.*?</iframe>",
            r"<object[^>]*>.*?</object>",
            r"<embed[^>]*>.*?</embed>",
            r"<applet[^>]*>.*?</applet>",
            r"<meta[^>]*>",
            r"<link[^>]*>",
            r"<style[^>]*>.*?</style>",
        ]

        for tag_pattern in dangerous_tags:
            if re.search(tag_pattern, sanitized, re.IGNORECASE | re.DOTALL):
                sanitized = re.sub(tag_pattern, "", sanitized, flags=re.IGNORECASE | re.DOTALL)
                logger.warning(f"Removed dangerous HTML tag from AI response: {tag_pattern}")

        # Step 3: Remove event handlers (onclick, onerror, etc.)
        event_handler_pattern = r'\bon\w+\s*=\s*["\'][^"\']*["\']'
        if re.search(event_handler_pattern, sanitized, re.IGNORECASE):
            sanitized = re.sub(event_handler_pattern, "", sanitized, flags=re.IGNORECASE)
            logger.warning("Removed event handlers from AI response")

        # Step 4: Validate and sanitize URLs (HTTPS only) - BEFORE HTML escaping
        # Match URLs but preserve markdown link format
        url_pattern = r'(?:http://|ftp://|file://|javascript:)([^\s\)]+)'
        
        def replace_non_https(match):
            full_url = match.group(0)
            logger.warning(f"Removed non-HTTPS URL from AI response: {full_url}")
            return "[URL removed for security]"
        
        sanitized = re.sub(url_pattern, replace_non_https, sanitized, flags=re.IGNORECASE)

        # Step 5: Escape HTML entities to prevent XSS
        # Preserve markdown code blocks
        code_block_pattern = r"```[\s\S]*?```|`[^`]+`"
        code_blocks = re.findall(code_block_pattern, sanitized)
        
        # Temporarily replace code blocks with placeholders
        for i, block in enumerate(code_blocks):
            sanitized = sanitized.replace(block, f"__CODE_BLOCK_{i}__", 1)
        
        # Escape HTML in non-code sections
        html_escape_map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#x27;",
            "/": "&#x2F;",
        }
        
        for char, escaped in html_escape_map.items():
            # Only escape if not already escaped
            if char in sanitized and escaped not in sanitized:
                sanitized = sanitized.replace(char, escaped)
        
        # Restore code blocks
        for i, block in enumerate(code_blocks):
            sanitized = sanitized.replace(f"__CODE_BLOCK_{i}__", block, 1)

        # Step 6: Remove SQL commands from text (not in code blocks)
        # SQL commands should only appear in properly formatted code blocks
        sql_keywords = [
            r"\bSELECT\s+\*\s+FROM\b",
            r"\bINSERT\s+INTO\b",
            r"\bUPDATE\s+\w+\s+SET\b",
            r"\bDELETE\s+FROM\b",
            r"\bDROP\s+TABLE\b",
            r"\bCREATE\s+TABLE\b",
            r"\bALTER\s+TABLE\b",
        ]
        
        # Check for SQL outside of code blocks
        temp_sanitized = sanitized
        for i, block in enumerate(code_blocks):
            temp_sanitized = temp_sanitized.replace(block, f"__CODE_BLOCK_{i}__", 1)
        
        for sql_pattern in sql_keywords:
            if re.search(sql_pattern, temp_sanitized, re.IGNORECASE):
                # SQL found outside code blocks - wrap it in code block
                sanitized = re.sub(
                    sql_pattern,
                    lambda m: f"`{m.group(0)}`",
                    sanitized,
                    flags=re.IGNORECASE
                )
                logger.warning(f"Wrapped SQL command in code block: {sql_pattern}")

        # Step 7: Limit response length to 5000 characters
        max_length = 5000
        if len(sanitized) > max_length:
            sanitized = sanitized[:max_length] + "\n\n[Response truncated due to length limit]"
            logger.warning(f"Truncated AI response from {len(original_response)} to {max_length} characters")

        # Step 8: Log sanitization events if content was modified
        if sanitized != original_response:
            logger.info(
                f"AI response sanitized. Original length: {len(original_response)}, "
                f"Sanitized length: {len(sanitized)}"
            )

        return sanitized

    # Topic filtering configuration
    ALLOWED_TOPICS = [
        "payment data",
        "bank performance",
        "collection trends",
        "touchpoint analysis",
        "upload history",
        "date ranges",
        "payment amounts",
        "environments",
        "payment analytics",
        "payment statistics",
        "payment records",
        "transaction data",
        "financial metrics",
        "payment processing",
        "collection rates",
        "payment methods",
        "bank statistics",
        "touchpoint metrics",
    ]

    BLOCKED_TOPICS = [
        "user credentials",
        "passwords",
        "authentication tokens",
        "system configuration",
        "server settings",
        "database credentials",
        "other users' data",
        "personal information",
        "non-payment business data",
        "personal advice",
        "general knowledge",
        "current events",
        "entertainment",
        "politics",
        "health advice",
        "legal advice",
        "financial advice",
        "investment advice",
        "coding help",
        "technical support",
        "system administration",
    ]

    # Keywords for quick topic detection (before AI classification)
    BLOCKED_KEYWORDS = [
        "password", "credential", "api key", "secret", "private key",
        "other user", "someone else", "another user",
        "weather", "news", "sports", "movie", "music", "game",
        "recipe", "health", "medical", "legal", "lawyer",
        "stock", "investment", "crypto", "bitcoin",
    ]

    # Greetings that should get a friendly response instead of a hard block
    GREETING_PATTERNS = [
        r"^(good\s+)?(morning|afternoon|evening|night|day)[\s!.]*$",
        r"^(hi|hello|hey|howdy|greetings|sup|what'?s up)[\s!.]*$",
        r"^how are you[\s!.?]*$",
        r"^(thanks|thank you|thx|ty)[\s!.]*$",
    ]

    def check_topic(self, user_query: str, ai_client=None) -> ValidationResult:
        """Verify query is within allowed topics.

        Uses a two-stage approach:
        1. Quick keyword-based filtering for obvious violations
        2. AI-based classification for ambiguous cases (if ai_client provided)

        Args:
            user_query: The user's natural language query
            ai_client: Optional AI client for topic classification

        Returns:
            ValidationResult indicating if the topic is allowed
        """
        query_lower = user_query.lower().strip()

        # Handle greetings with a friendly redirect
        for pattern in self.GREETING_PATTERNS:
            if re.match(pattern, query_lower, re.IGNORECASE):
                return ValidationResult(
                    is_valid=False,
                    error_message=(
                        "Hello! I'm your payment analytics assistant. "
                        "Ask me anything about your payment data — top banks, collection trends, "
                        "touchpoint performance, or breakdowns by environment."
                    ),
                    details={"validation_type": "greeting"}
                )

        # Stage 1: Quick keyword-based filtering
        for keyword in self.BLOCKED_KEYWORDS:
            if keyword in query_lower:
                logger.warning(f"Blocked topic keyword detected: '{keyword}' in query: '{user_query[:100]}...'")
                return ValidationResult(
                    is_valid=False,
                    error_message=(
                        "I can only help with payment analytics questions. "
                        "Your query appears to be about a topic outside my scope."
                    ),
                    details={
                        "validation_type": "blocked_topic",
                        "detection_method": "keyword",
                        "matched_keyword": keyword
                    }
                )

        # Stage 2: Check for payment analytics keywords (positive signals)
        payment_keywords = [
            "payment", "bank", "collection", "touchpoint", "upload",
            "amount", "transaction", "financial", "analytics", "data",
            "record", "statistics", "metric", "performance", "trend",
            "environment", "date", "month", "year", "total", "average",
            "sum", "count", "top", "bottom", "highest", "lowest"
        ]

        has_payment_keyword = any(keyword in query_lower for keyword in payment_keywords)

        # If no payment keywords found, use AI classification if available
        if not has_payment_keyword and ai_client is not None:
            return self._classify_topic_with_ai(user_query, ai_client)

        # If no payment keywords and no AI client, err on the side of rejection
        if not has_payment_keyword:
            logger.warning(f"No payment analytics keywords found in query: '{user_query[:100]}...'")
            return ValidationResult(
                is_valid=False,
                error_message=(
                    "I can only help with payment analytics questions. "
                    "Please ask about payment data, bank performance, collections, or touchpoints."
                ),
                details={
                    "validation_type": "blocked_topic",
                    "detection_method": "no_payment_keywords"
                }
            )

        # Query contains payment keywords and no blocked keywords
        return ValidationResult(is_valid=True)

    def _classify_topic_with_ai(self, user_query: str, ai_client) -> ValidationResult:
        """Use AI to classify query topic when keyword matching is insufficient.

        This is a synchronous wrapper that should be called from an async context.
        For now, we'll return a conservative result and log that AI classification is needed.

        Args:
            user_query: The user's natural language query
            ai_client: AI client for classification

        Returns:
            ValidationResult indicating if the topic is allowed
        """
        # Note: This is a placeholder for AI-based classification
        # In a real implementation, this would make an async AI API call
        # For now, we err on the side of caution and reject ambiguous queries
        
        logger.info(f"AI topic classification needed for query: '{user_query[:100]}...'")
        
        # Conservative approach: reject if uncertain
        return ValidationResult(
            is_valid=False,
            error_message=(
                "I can only help with payment analytics questions. "
                "Please ask about payment data, bank performance, collections, or touchpoints."
            ),
            details={
                "validation_type": "blocked_topic",
                "detection_method": "ai_classification_unavailable"
            }
        )

    async def check_topic_async(
        self,
        user_query: str,
        ai_client=None,
        has_conversation_context: bool = False,
    ) -> ValidationResult:
        """Async version of check_topic with AI classification support.

        Args:
            user_query: The user's natural language query
            ai_client: Optional AI client for topic classification
            has_conversation_context: If True, short follow-up queries are allowed
                through even without payment keywords (e.g. "How about January?")

        Returns:
            ValidationResult indicating if the topic is allowed
        """
        query_lower = user_query.lower().strip()

        # Handle greetings with a friendly redirect instead of a hard block
        for pattern in self.GREETING_PATTERNS:
            if re.match(pattern, query_lower, re.IGNORECASE):
                logger.info(f"Greeting detected, returning friendly redirect: '{user_query[:50]}'")
                return ValidationResult(
                    is_valid=False,
                    error_message=(
                        "Hello! I'm your payment analytics assistant. "
                        "Ask me anything about your payment data — top banks, collection trends, "
                        "touchpoint performance, or breakdowns by environment."
                    ),
                    details={"validation_type": "greeting"}
                )

        # Stage 1: Quick keyword-based filtering (same as sync version)
        for keyword in self.BLOCKED_KEYWORDS:
            if keyword in query_lower:
                logger.warning(f"Blocked topic keyword detected: '{keyword}' in query: '{user_query[:100]}...'")
                return ValidationResult(
                    is_valid=False,
                    error_message=(
                        "I can only help with payment analytics questions. "
                        "Your query appears to be about a topic outside my scope."
                    ),
                    details={
                        "validation_type": "blocked_topic",
                        "detection_method": "keyword",
                        "matched_keyword": keyword
                    }
                )

        # Stage 2: Check for payment analytics keywords
        payment_keywords = [
            "payment", "bank", "collection", "touchpoint", "upload",
            "amount", "transaction", "financial", "analytics", "data",
            "record", "statistics", "metric", "performance", "trend",
            "environment", "date", "month", "year", "total", "average",
            "sum", "count", "top", "bottom", "highest", "lowest",
            # Common follow-up / refinement words
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
            "q1", "q2", "q3", "q4", "quarter", "weekly", "daily",
            "show", "compare", "breakdown", "detail", "more", "less",
            "how about", "what about", "and", "also", "instead",
        ]

        has_payment_keyword = any(keyword in query_lower for keyword in payment_keywords)

        # Allow short follow-up queries when there is existing conversation context.
        # These are refinements like "How about in January?" or "What about ENV2?"
        # that only make sense in the context of a prior payment analytics exchange.
        if not has_payment_keyword and has_conversation_context and len(user_query.strip()) <= 120:
            logger.info(
                f"Allowing follow-up query without payment keywords (conversation context present): "
                f"'{user_query[:100]}'"
            )
            return ValidationResult(is_valid=True)

        # If no payment keywords found, use AI classification if available
        if not has_payment_keyword and ai_client is not None:
            try:
                # Create a classification prompt
                classification_prompt = f"""You are a topic classifier for a payment analytics system.

Allowed topics: {', '.join(self.ALLOWED_TOPICS)}
Blocked topics: {', '.join(self.BLOCKED_TOPICS)}

User query: "{user_query}"

Is this query about payment analytics? Respond with only "ALLOWED" or "BLOCKED" and a brief reason.
"""
                
                messages = [
                    {"role": "system", "content": "You are a topic classifier. Respond with only ALLOWED or BLOCKED followed by a reason."},
                    {"role": "user", "content": classification_prompt}
                ]
                
                response = await ai_client.generate_response(
                    messages=messages,
                    max_tokens=50,
                    temperature=0.0  # Deterministic classification
                )
                
                classification = response.content.strip().upper()
                
                if "ALLOWED" in classification:
                    logger.info(f"AI classified query as ALLOWED: '{user_query[:100]}...'")
                    return ValidationResult(is_valid=True)
                else:
                    logger.warning(f"AI classified query as BLOCKED: '{user_query[:100]}...'")
                    return ValidationResult(
                        is_valid=False,
                        error_message=(
                            "I can only help with payment analytics questions. "
                            "Your query appears to be about a topic outside my scope."
                        ),
                        details={
                            "validation_type": "blocked_topic",
                            "detection_method": "ai_classification",
                            "ai_response": classification
                        }
                    )
            except Exception as e:
                logger.error(f"AI topic classification failed: {e}")
                # On error, err on the side of caution
                return ValidationResult(
                    is_valid=False,
                    error_message=(
                        "I can only help with payment analytics questions. "
                        "Please ask about payment data, bank performance, collections, or touchpoints."
                    ),
                    details={
                        "validation_type": "blocked_topic",
                        "detection_method": "ai_classification_error",
                        "error": str(e)
                    }
                )

        # If no payment keywords and no AI client, err on the side of rejection
        if not has_payment_keyword:
            logger.warning(f"No payment analytics keywords found in query: '{user_query[:100]}...'")
            return ValidationResult(
                is_valid=False,
                error_message=(
                    "I can only help with payment analytics questions. "
                    "Please ask about payment data, bank performance, collections, or touchpoints."
                ),
                details={
                    "validation_type": "blocked_topic",
                    "detection_method": "no_payment_keywords"
                }
            )

        # Query contains payment keywords and no blocked keywords
        return ValidationResult(is_valid=True)
