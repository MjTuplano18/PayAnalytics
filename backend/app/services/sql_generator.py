"""SQL Generator Service for AI Chat Assistant.

This service converts natural language queries to SQL using AI,
validates generated SQL, and ensures security constraints are met.
"""

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.logging import get_logger
from app.services.ai.base_client import AIAPIClient, AIResponse
from app.services.security_guard import SecurityGuard, ValidationResult
from app.services.system_prompt_loader import SystemPromptLoader

logger = get_logger(__name__)


@dataclass
class SQLGenerationResult:
    """Result of SQL generation from natural language."""
    
    success: bool
    sql_query: str | None = None
    explanation: str | None = None
    error_message: str | None = None
    validation_result: ValidationResult | None = None


class SQLGenerator:
    """Converts natural language queries to SQL using AI.
    
    Responsibilities:
    - Convert natural language to SQL using AI with database schema context
    - Support filters: bank, touchpoint, date range, month, environment, payment amount
    - Support aggregation functions: SUM, AVG, COUNT, MAX, MIN
    - Support GROUP BY and ORDER BY clauses
    - Automatically add LIMIT 1000 to all queries
    - Validate SQL syntax and security constraints before execution
    """

    MAX_SQL_LENGTH = 5000
    DEFAULT_LIMIT = 5000  # Admin can see more data

    def __init__(
        self,
        ai_client: AIAPIClient,
        system_prompt_loader: SystemPromptLoader,
        security_guard: SecurityGuard,
    ):
        """Initialize the SQL generator.
        
        Args:
            ai_client: AI API client for generating SQL
            system_prompt_loader: System prompt loader for schema context
            security_guard: Security guard for SQL validation
        """
        self.ai_client = ai_client
        self.system_prompt_loader = system_prompt_loader
        self.security_guard = security_guard
        
        logger.info("SQLGenerator initialized")

    async def generate_sql(
        self,
        user_query: str,
        conversation_context: list[dict] | None = None,
    ) -> SQLGenerationResult:
        """Generate SQL query from natural language.
        
        Uses AI to convert the user's natural language query into a valid SQL query
        against the payment analytics database schema.
        
        Args:
            user_query: The user's natural language query
            conversation_context: Optional list of previous messages for context
            
        Returns:
            SQLGenerationResult with generated SQL or error message
            
        Requirements: 1.2, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
        """
        try:
            # Build the AI prompt with schema context
            system_prompt = self._build_sql_generation_prompt()
            
            # Prepare messages for AI
            messages = [
                {"role": "system", "content": system_prompt},
            ]
            
            # Add conversation context if provided
            if conversation_context:
                messages.extend(conversation_context[-10:])  # Last 10 messages
            
            # Add the current user query
            messages.append({
                "role": "user",
                "content": self._format_sql_request(user_query)
            })
            
            # Call AI to generate SQL
            logger.info(f"Generating SQL for query: {user_query[:100]}...")
            
            ai_response = await self.ai_client.generate_response(
                messages=messages,
                max_tokens=500,   # SQL queries are short — 500 is plenty
                temperature=0.3,  # Lower temperature for more deterministic SQL
            )
            
            # Extract SQL from AI response
            sql_query = self._extract_sql_from_response(ai_response.content)
            
            if not sql_query:
                logger.warning("AI did not generate valid SQL")
                return SQLGenerationResult(
                    success=False,
                    error_message="I couldn't generate a valid SQL query for your question. Could you rephrase it?"
                )
            
            # Ensure LIMIT clause exists
            sql_query = self._ensure_limit_clause(sql_query)
            
            # Validate the generated SQL
            validation_result = self.validate_sql(sql_query)
            
            if not validation_result.is_valid:
                logger.warning(f"Generated SQL failed validation: {validation_result.error_message}")
                return SQLGenerationResult(
                    success=False,
                    sql_query=sql_query,
                    error_message=validation_result.error_message,
                    validation_result=validation_result,
                )
            
            # Extract explanation from AI response (if any)
            explanation = self._extract_explanation_from_response(ai_response.content)
            
            logger.info(f"Successfully generated SQL: {sql_query[:100]}...")
            
            return SQLGenerationResult(
                success=True,
                sql_query=sql_query,
                explanation=explanation,
                validation_result=validation_result,
            )
            
        except Exception as e:
            logger.error(f"Failed to generate SQL: {e}", exc_info=True)
            return SQLGenerationResult(
                success=False,
                error_message=f"An error occurred while generating the SQL query: {str(e)}"
            )

    def validate_sql(self, sql: str) -> ValidationResult:
        """Validate generated SQL meets security constraints.
        
        Checks for:
        - Only SELECT statements allowed
        - LIMIT clause exists and is <= 1000
        - No unauthorized table access
        - SQL injection patterns
        
        Args:
            sql: The generated SQL query
            
        Returns:
            ValidationResult indicating if the SQL is valid
            
        Requirements: 13.8
        """
        return self.security_guard.validate_sql(sql)

    def _build_sql_generation_prompt(self) -> str:
        """Build a compact system prompt for SQL generation.
        
        Uses the minimal schema-only prompt to save tokens.
        
        Returns:
            Formatted system prompt string
        """
        # Use compact prompt — saves ~400 tokens vs full prompt
        base_prompt = self.system_prompt_loader.get_compact_sql_prompt()
        
        now = datetime.now(timezone.utc)
        current_date_str = now.strftime("%Y-%m-%d")
        
        sql_instructions = f"""
Today: {current_date_str}

CRITICAL RULES:
- month column = uppercase English names: 'JANUARY', 'FEBRUARY' — NEVER '2026-01'
- Use SUM(payment_amount) for totals/rankings, not MAX
- MAX(payment_amount) only for "single largest transaction" queries
- Always include LIMIT (max 5000)
- Only SELECT queries allowed

Aggregation guide:
- top banks/accounts → GROUP BY x, SUM(payment_amount) DESC
- largest single payment → ORDER BY payment_amount DESC LIMIT 1
- trends → GROUP BY month, SUM(payment_amount)
- by touchpoint/environment → GROUP BY x, SUM(payment_amount)

Return SQL in ```sql blocks only.
"""
        return base_prompt + sql_instructions

    def _format_sql_request(self, user_query: str) -> str:
        """Format the user query as a SQL generation request.
        
        Args:
            user_query: The user's natural language query
            
        Returns:
            Formatted request string
        """
        return f"""Generate a SQL query to answer this question:

"{user_query}"

Return only the SQL query wrapped in ```sql code blocks. Include a brief explanation if needed."""

    def _extract_sql_from_response(self, ai_response: str) -> str | None:
        """Extract SQL query from AI response.
        
        Looks for SQL code blocks (```sql ... ```) in the response.
        
        Args:
            ai_response: The AI's response text
            
        Returns:
            Extracted SQL query or None if not found
        """
        # Pattern to match SQL code blocks
        sql_pattern = r"```sql\s*(.*?)\s*```"
        
        match = re.search(sql_pattern, ai_response, re.DOTALL | re.IGNORECASE)
        
        if match:
            sql = match.group(1).strip()
            
            # Remove any leading/trailing whitespace and semicolons
            sql = sql.rstrip(";").strip()
            
            return sql
        
        # Fallback: try to find SQL without code blocks
        # Look for SELECT statements
        select_pattern = r"(SELECT\s+.*?(?:LIMIT\s+\d+|$))"
        
        match = re.search(select_pattern, ai_response, re.DOTALL | re.IGNORECASE)
        
        if match:
            sql = match.group(1).strip()
            sql = sql.rstrip(";").strip()
            return sql
        
        return None

    def _extract_explanation_from_response(self, ai_response: str) -> str | None:
        """Extract explanation text from AI response.
        
        Gets any text before the SQL code block.
        
        Args:
            ai_response: The AI's response text
            
        Returns:
            Extracted explanation or None
        """
        # Split by SQL code block
        parts = re.split(r"```sql", ai_response, maxsplit=1, flags=re.IGNORECASE)
        
        if len(parts) > 1:
            explanation = parts[0].strip()
            
            if explanation and len(explanation) > 10:
                return explanation
        
        return None

    def _ensure_limit_clause(self, sql: str) -> str:
        """Ensure SQL query has a LIMIT clause.
        
        Adds LIMIT 1000 if not present.
        
        Args:
            sql: The SQL query
            
        Returns:
            SQL query with LIMIT clause
            
        Requirements: 13.6
        """
        sql_lower = sql.lower()
        
        if "limit" not in sql_lower:
            # Add LIMIT clause
            sql = f"{sql.rstrip(';')} LIMIT {self.DEFAULT_LIMIT}"
            logger.debug(f"Added LIMIT {self.DEFAULT_LIMIT} to SQL query")
        
        return sql

    def _normalize_sql(self, sql: str) -> str:
        """Normalize SQL query for consistency.
        
        - Remove extra whitespace
        - Remove trailing semicolons
        - Ensure single spaces between keywords
        
        Args:
            sql: The SQL query
            
        Returns:
            Normalized SQL query
        """
        # Remove extra whitespace
        sql = " ".join(sql.split())
        
        # Remove trailing semicolon
        sql = sql.rstrip(";")
        
        return sql
