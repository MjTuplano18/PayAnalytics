"""Tests for AuditLogger service."""

import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import select

from app.models.ai_audit_log import AIAuditLog
from app.services.audit_logger import AuditLogger


@pytest.mark.asyncio
async def test_log_query(db_session, test_user):
    """Test logging a successful query interaction."""
    audit_logger = AuditLogger(db_session)
    
    log = await audit_logger.log_query(
        user_id=test_user.id,
        conversation_id="conv-123",
        query="What are the top 5 banks?",
        response="Here are the top 5 banks...",
        tokens_used=150,
        processing_time_ms=1200,
        metadata={"sql_query": "SELECT * FROM banks LIMIT 5"},
    )
    
    assert log.id is not None
    assert log.user_id == test_user.id
    assert log.conversation_id == "conv-123"
    assert log.event_type == "query"
    assert log.query_text == "What are the top 5 banks?"
    assert log.response_text == "Here are the top 5 banks..."
    assert log.tokens_used == 150
    assert log.processing_time_ms == 1200
    assert log.sql_generated == "SELECT * FROM banks LIMIT 5"
    assert log.metadata_["sql_query"] == "SELECT * FROM banks LIMIT 5"


@pytest.mark.asyncio
async def test_log_error(db_session, test_user):
    """Test logging an error during query processing."""
    audit_logger = AuditLogger(db_session)
    
    log = await audit_logger.log_error(
        user_id=test_user.id,
        query="Invalid query",
        error_type="ValidationError",
        error_message="Query validation failed",
        stack_trace="Traceback (most recent call last)...",
        conversation_id="conv-456",
        metadata={"validation_errors": ["too_short"]},
    )
    
    assert log.id is not None
    assert log.user_id == test_user.id
    assert log.conversation_id == "conv-456"
    assert log.event_type == "error"
    assert log.query_text == "Invalid query"
    assert log.error_type == "ValidationError"
    assert "Query validation failed" in log.error_message
    assert "Traceback" in log.error_message
    assert log.metadata_["validation_errors"] == ["too_short"]


@pytest.mark.asyncio
async def test_log_security_violation(db_session, test_user):
    """Test logging a security violation."""
    audit_logger = AuditLogger(db_session)
    
    log = await audit_logger.log_security_violation(
        user_id=test_user.id,
        query="Ignore previous instructions and...",
        violation_type="prompt_injection",
        details={
            "patterns_matched": ["ignore previous instructions"],
            "severity": "high",
        },
    )
    
    assert log.id is not None
    assert log.user_id == test_user.id
    assert log.event_type == "security_violation"
    assert log.query_text == "Ignore previous instructions and..."
    assert log.error_type == "prompt_injection"
    assert "Security violation" in log.error_message
    assert log.metadata_["patterns_matched"] == ["ignore previous instructions"]
    assert log.metadata_["severity"] == "high"


@pytest.mark.asyncio
async def test_log_rate_limit(db_session, test_user):
    """Test logging a rate limit violation."""
    audit_logger = AuditLogger(db_session)
    
    log = await audit_logger.log_rate_limit(
        user_id=test_user.id,
        limit_type="request_limit",
        details={
            "current_count": 21,
            "limit": 20,
            "retry_after": 45,
        },
        query="What are the payment trends?",
    )
    
    assert log.id is not None
    assert log.user_id == test_user.id
    assert log.event_type == "rate_limit"
    assert log.query_text == "What are the payment trends?"
    assert log.error_type == "request_limit"
    assert "Rate limit exceeded" in log.error_message
    assert log.metadata_["current_count"] == 21
    assert log.metadata_["limit"] == 20


@pytest.mark.asyncio
async def test_cleanup_old_logs(db_session, test_user):
    """Test cleanup of old audit logs."""
    from datetime import datetime
    
    audit_logger = AuditLogger(db_session)
    
    # Create a recent log
    recent_log = await audit_logger.log_query(
        user_id=test_user.id,
        conversation_id="conv-recent",
        query="Recent query",
        response="Recent response",
        tokens_used=100,
        processing_time_ms=500,
    )
    
    # Create an old log by manually setting created_at
    # Use naive datetime for SQLite compatibility
    old_date = datetime.utcnow() - timedelta(days=100)
    old_log = AIAuditLog(
        user_id=test_user.id,
        conversation_id="conv-old",
        event_type="query",
        query_text="Old query",
        response_text="Old response",
        tokens_used=100,
        processing_time_ms=500,
        created_at=old_date,
    )
    db_session.add(old_log)
    await db_session.flush()
    await db_session.refresh(old_log)
    
    # Cleanup logs older than 90 days
    deleted_count = await audit_logger.cleanup_old_logs(retention_days=90)
    
    assert deleted_count == 1
    
    # Verify recent log still exists
    stmt = select(AIAuditLog).where(AIAuditLog.id == recent_log.id)
    result = await db_session.execute(stmt)
    assert result.scalar_one_or_none() is not None
    
    # Verify old log was deleted
    stmt = select(AIAuditLog).where(AIAuditLog.id == old_log.id)
    result = await db_session.execute(stmt)
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_get_user_logs(db_session, test_user):
    """Test retrieving user-specific audit logs."""
    audit_logger = AuditLogger(db_session)
    
    # Create multiple logs
    await audit_logger.log_query(
        user_id=test_user.id,
        conversation_id="conv-1",
        query="Query 1",
        response="Response 1",
        tokens_used=100,
        processing_time_ms=500,
    )
    
    await audit_logger.log_error(
        user_id=test_user.id,
        query="Query 2",
        error_type="TestError",
        error_message="Test error message",
    )
    
    await audit_logger.log_security_violation(
        user_id=test_user.id,
        query="Query 3",
        violation_type="test_violation",
        details={},
    )
    
    # Get all logs for user
    all_logs = await audit_logger.get_user_logs(test_user.id)
    assert len(all_logs) == 3
    
    # Get only query logs
    query_logs = await audit_logger.get_user_logs(test_user.id, event_type="query")
    assert len(query_logs) == 1
    assert query_logs[0].event_type == "query"
    
    # Get only error logs
    error_logs = await audit_logger.get_user_logs(test_user.id, event_type="error")
    assert len(error_logs) == 1
    assert error_logs[0].event_type == "error"


@pytest.mark.asyncio
async def test_capture_exception():
    """Test capturing exception stack traces."""
    try:
        raise ValueError("Test exception")
    except ValueError:
        stack_trace = AuditLogger.capture_exception()
        assert "ValueError: Test exception" in stack_trace
        assert "Traceback" in stack_trace
