"""Audit Logger Service for AI Chat Assistant.

This service logs all AI interactions for compliance, debugging, and monitoring.
It records successful queries, errors, security violations, and rate limit events.
"""

import logging
import traceback
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_audit_log import AIAuditLog


class AuditLogger:
    """Logs all AI chat interactions for compliance and debugging.
    
    Responsibilities:
    - Log successful query interactions with response and token usage
    - Log errors with stack traces for debugging
    - Log security violations (prompt injection, topic filtering)
    - Log rate limit violations
    - Enforce 90-day retention policy
    """

    RETENTION_DAYS = 90

    def __init__(self, db_session: AsyncSession):
        """Initialize the audit logger.
        
        Args:
            db_session: SQLAlchemy async database session
        """
        self.db = db_session
        self.logger = logging.getLogger(__name__)

    async def log_query(
        self,
        user_id: str,
        conversation_id: str,
        query: str,
        response: str,
        tokens_used: int,
        processing_time_ms: int,
        metadata: dict | None = None,
    ) -> AIAuditLog:
        """Log a successful query interaction.
        
        Records the user query, AI response, token usage, and processing time.
        
        Args:
            user_id: ID of the user who submitted the query
            conversation_id: ID of the conversation
            query: The user's natural language query
            response: The AI's response
            tokens_used: Total tokens consumed (input + output)
            processing_time_ms: Time taken to process the query in milliseconds
            metadata: Optional metadata (SQL query, chart data, etc.)
            
        Returns:
            Created AIAuditLog object
            
        Requirements: 9.1, 9.2
        """
        audit_log = AIAuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            conversation_id=conversation_id,
            event_type="query",
            query_text=query,
            response_text=response,
            sql_generated=metadata.get("sql_query") if metadata else None,
            tokens_used=tokens_used,
            processing_time_ms=processing_time_ms,
            metadata_=metadata,
        )
        
        self.db.add(audit_log)
        
        try:
            await self.db.flush()
            self.logger.info(
                "Logged query: user=%s conversation=%s tokens=%d time_ms=%d",
                user_id,
                conversation_id,
                tokens_used,
                processing_time_ms,
            )
        except Exception as e:
            # Logging should never block the main request flow
            self.logger.error("Failed to log query: %s", str(e))
        
        return audit_log

    async def log_error(
        self,
        user_id: str,
        query: str,
        error_type: str,
        error_message: str,
        stack_trace: str | None = None,
        conversation_id: str | None = None,
        metadata: dict | None = None,
    ) -> AIAuditLog:
        """Log an error during query processing.
        
        Records error details including type, message, and stack trace for debugging.
        
        Args:
            user_id: ID of the user who submitted the query
            query: The user's natural language query that caused the error
            error_type: Type/category of the error (e.g., 'ValidationError', 'AIAPIError')
            error_message: Human-readable error message
            stack_trace: Optional full stack trace for debugging
            conversation_id: Optional conversation ID if available
            metadata: Optional additional error context
            
        Returns:
            Created AIAuditLog object
            
        Requirements: 9.3
        """
        # Combine error message and stack trace for storage
        full_error_message = error_message
        if stack_trace:
            full_error_message = f"{error_message}\n\nStack Trace:\n{stack_trace}"
        
        audit_log = AIAuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            conversation_id=conversation_id,
            event_type="error",
            query_text=query,
            error_type=error_type,
            error_message=full_error_message,
            metadata_=metadata,
        )
        
        self.db.add(audit_log)
        
        try:
            await self.db.flush()
            self.logger.error(
                "Logged error: user=%s type=%s message=%s",
                user_id,
                error_type,
                error_message,
            )
        except Exception as e:
            # Logging should never block the main request flow
            self.logger.error("Failed to log error: %s", str(e))
        
        return audit_log

    async def log_security_violation(
        self,
        user_id: str,
        query: str,
        violation_type: str,
        details: dict,
        conversation_id: str | None = None,
    ) -> AIAuditLog:
        """Log security violations for audit and review.
        
        Records prompt injection attempts, topic filtering violations, and other
        security-related events with full query text for analysis.
        
        Args:
            user_id: ID of the user who submitted the query
            query: The full query text that triggered the violation
            violation_type: Type of security violation (e.g., 'prompt_injection', 'topic_filter')
            details: Dictionary with violation details (patterns matched, blocked topics, etc.)
            conversation_id: Optional conversation ID if available
            
        Returns:
            Created AIAuditLog object
            
        Requirements: 9.5
        """
        audit_log = AIAuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            conversation_id=conversation_id,
            event_type="security_violation",
            query_text=query,
            error_type=violation_type,
            error_message=f"Security violation: {violation_type}",
            metadata_=details,
        )
        
        self.db.add(audit_log)
        
        try:
            await self.db.flush()
            self.logger.warning(
                "Logged security violation: user=%s type=%s query=%s",
                user_id,
                violation_type,
                query[:100],  # Log only first 100 chars for brevity
            )
        except Exception as e:
            # Logging should never block the main request flow
            self.logger.error("Failed to log security violation: %s", str(e))
        
        return audit_log

    async def log_rate_limit(
        self,
        user_id: str,
        limit_type: str,
        details: dict,
        query: str | None = None,
    ) -> AIAuditLog:
        """Log rate limit violations.
        
        Records when users exceed request or token limits.
        
        Args:
            user_id: ID of the user who exceeded the limit
            limit_type: Type of limit exceeded (e.g., 'request_limit', 'token_limit')
            details: Dictionary with limit details (current count, limit, retry_after, etc.)
            query: Optional query text if available
            
        Returns:
            Created AIAuditLog object
            
        Requirements: 9.4
        """
        audit_log = AIAuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            conversation_id=None,
            event_type="rate_limit",
            query_text=query,
            error_type=limit_type,
            error_message=f"Rate limit exceeded: {limit_type}",
            metadata_=details,
        )
        
        self.db.add(audit_log)
        
        try:
            await self.db.flush()
            self.logger.warning(
                "Logged rate limit: user=%s type=%s",
                user_id,
                limit_type,
            )
        except Exception as e:
            # Logging should never block the main request flow
            self.logger.error("Failed to log rate limit: %s", str(e))
        
        return audit_log

    async def cleanup_old_logs(self, retention_days: int | None = None) -> int:
        """Delete audit logs older than the retention period.
        
        This should be called by a background task to enforce the 90-day retention policy.
        
        Args:
            retention_days: Number of days to retain logs (default: 90)
            
        Returns:
            Number of logs deleted
            
        Requirements: 9.6, 9.7
        """
        if retention_days is None:
            retention_days = self.RETENTION_DAYS
        
        # Use naive datetime for SQLite compatibility
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        try:
            stmt = delete(AIAuditLog).where(AIAuditLog.created_at < cutoff_date)
            result = await self.db.execute(stmt)
            deleted_count = result.rowcount or 0
            
            await self.db.flush()
            
            self.logger.info(
                "Cleaned up %d audit logs older than %d days",
                deleted_count,
                retention_days,
            )
            
            return deleted_count
        except Exception as e:
            self.logger.error("Failed to cleanup old logs: %s", str(e))
            return 0

    async def get_user_logs(
        self,
        user_id: str,
        event_type: str | None = None,
        limit: int = 100,
    ) -> list[AIAuditLog]:
        """Retrieve audit logs for a specific user.
        
        Useful for debugging and user-specific audit trails.
        
        Args:
            user_id: ID of the user
            event_type: Optional filter by event type
            limit: Maximum number of logs to retrieve
            
        Returns:
            List of AIAuditLog objects ordered by created_at descending
        """
        stmt = select(AIAuditLog).where(AIAuditLog.user_id == user_id)
        
        if event_type:
            stmt = stmt.where(AIAuditLog.event_type == event_type)
        
        stmt = stmt.order_by(AIAuditLog.created_at.desc()).limit(limit)
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    def capture_exception() -> str:
        """Capture the current exception stack trace.
        
        Helper method to capture stack traces for error logging.
        Should be called within an exception handler.
        
        Returns:
            Formatted stack trace string
        """
        return traceback.format_exc()
