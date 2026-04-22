"""Tests for TokenManager service."""

import pytest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.services.token_manager import TokenManager
from app.models.token_usage import TokenUsage


@pytest.mark.asyncio
async def test_calculate_cost_gpt4(db_session):
    """Test cost calculation for GPT-4."""
    token_manager = TokenManager(db_session)
    
    # GPT-4: $0.03/1K input, $0.06/1K output
    cost = token_manager.calculate_cost(
        input_tokens=1000,
        output_tokens=1000,
        model="gpt-4"
    )
    
    expected = Decimal("0.03") + Decimal("0.06")  # $0.09
    assert cost == expected


@pytest.mark.asyncio
async def test_calculate_cost_claude(db_session):
    """Test cost calculation for Claude."""
    token_manager = TokenManager(db_session)
    
    # Claude 3 Opus: $0.015/1K input, $0.075/1K output
    cost = token_manager.calculate_cost(
        input_tokens=2000,
        output_tokens=1000,
        model="claude-3-opus"
    )
    
    expected = (Decimal("2000") / Decimal("1000")) * Decimal("0.015") + \
               (Decimal("1000") / Decimal("1000")) * Decimal("0.075")
    assert cost == expected


@pytest.mark.asyncio
async def test_calculate_cost_unknown_model(db_session):
    """Test cost calculation defaults to GPT-4 for unknown models."""
    token_manager = TokenManager(db_session)
    
    cost = token_manager.calculate_cost(
        input_tokens=1000,
        output_tokens=1000,
        model="unknown-model-xyz"
    )
    
    # Should default to GPT-4 pricing
    expected = Decimal("0.03") + Decimal("0.06")
    assert cost == expected


@pytest.mark.asyncio
async def test_record_usage(db_session, test_user):
    """Test recording token usage."""
    token_manager = TokenManager(db_session)
    
    usage = await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-123",
        input_tokens=500,
        output_tokens=300,
        model="gpt-4"
    )
    
    assert usage.user_id == test_user.id
    assert usage.conversation_id == "conv-123"
    assert usage.input_tokens == 500
    assert usage.output_tokens == 300
    assert usage.total_tokens == 800
    assert usage.model == "gpt-4"
    assert usage.estimated_cost > 0
    
    # Verify it was saved to database
    await db_session.commit()
    await db_session.refresh(usage)
    assert usage.id is not None


@pytest.mark.asyncio
async def test_get_daily_usage(db_session, test_user):
    """Test getting daily token usage."""
    token_manager = TokenManager(db_session)
    
    # Record some usage for today
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-1",
        input_tokens=1000,
        output_tokens=500,
        model="gpt-4"
    )
    
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-2",
        input_tokens=2000,
        output_tokens=1000,
        model="gpt-4"
    )
    
    await db_session.commit()
    
    # Get daily usage
    daily_usage = await token_manager.get_daily_usage(test_user.id)
    
    assert daily_usage == 4500  # 1500 + 3000


@pytest.mark.asyncio
async def test_get_user_usage_report(db_session, test_user):
    """Test getting user usage report for date range."""
    token_manager = TokenManager(db_session)
    
    now = datetime.now(timezone.utc)
    
    # Record usage with different models
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-1",
        input_tokens=1000,
        output_tokens=500,
        model="gpt-4"
    )
    
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-2",
        input_tokens=2000,
        output_tokens=1000,
        model="claude-3-opus"
    )
    
    await db_session.commit()
    
    # Get usage report
    start_date = now - timedelta(days=1)
    end_date = now + timedelta(days=1)
    
    report = await token_manager.get_user_usage(
        user_id=test_user.id,
        start_date=start_date,
        end_date=end_date
    )
    
    assert report["user_id"] == test_user.id
    assert report["total_tokens"] == 4500
    assert report["input_tokens"] == 3000
    assert report["output_tokens"] == 1500
    assert report["requests_count"] == 2
    assert report["estimated_cost"] > 0
    
    # Check by_model breakdown
    assert "gpt-4" in report["by_model"]
    assert "claude-3-opus" in report["by_model"]
    assert report["by_model"]["gpt-4"]["total_tokens"] == 1500
    assert report["by_model"]["claude-3-opus"]["total_tokens"] == 3000
    
    # Check by_day breakdown
    assert len(report["by_day"]) > 0


@pytest.mark.asyncio
async def test_get_user_usage_empty(db_session, test_user):
    """Test getting usage report when no usage exists."""
    token_manager = TokenManager(db_session)
    
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=1)
    end_date = now + timedelta(days=1)
    
    report = await token_manager.get_user_usage(
        user_id=test_user.id,
        start_date=start_date,
        end_date=end_date
    )
    
    assert report["user_id"] == test_user.id
    assert report["total_tokens"] == 0
    assert report["input_tokens"] == 0
    assert report["output_tokens"] == 0
    assert report["estimated_cost"] == 0.0
    assert report["requests_count"] == 0
    assert report["by_model"] == {}
    assert report["by_day"] == {}


@pytest.mark.asyncio
async def test_get_monthly_usage(db_session, test_user):
    """Test getting monthly usage aggregation."""
    token_manager = TokenManager(db_session)
    
    now = datetime.now(timezone.utc)
    
    # Record some usage
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-1",
        input_tokens=5000,
        output_tokens=3000,
        model="gpt-4"
    )
    
    await db_session.commit()
    
    # Get monthly usage
    report = await token_manager.get_monthly_usage(
        user_id=test_user.id,
        year=now.year,
        month=now.month
    )
    
    assert report["total_tokens"] == 8000
    assert report["requests_count"] == 1


@pytest.mark.asyncio
async def test_alert_threshold_not_triggered(db_session, test_user, caplog):
    """Test that alert is not triggered below 80% threshold."""
    token_manager = TokenManager(db_session)
    
    # Record usage below 80% threshold (50k * 0.8 = 40k)
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-1",
        input_tokens=20000,
        output_tokens=10000,
        model="gpt-4"
    )
    
    await db_session.commit()
    
    # Check that no warning was logged
    assert "Alert threshold exceeded" not in caplog.text


@pytest.mark.asyncio
async def test_alert_threshold_triggered(db_session, test_user, caplog):
    """Test that alert is triggered at 80% threshold."""
    token_manager = TokenManager(db_session)
    
    # Record usage above 80% threshold (50k * 0.8 = 40k)
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-1",
        input_tokens=30000,
        output_tokens=15000,
        model="gpt-4"
    )
    
    await db_session.commit()
    
    # Check that warning was logged
    assert "Alert threshold exceeded" in caplog.text
    assert test_user.id in caplog.text


@pytest.mark.asyncio
async def test_get_usage_summary_for_admin(db_session, test_user):
    """Test getting admin usage summary across users."""
    token_manager = TokenManager(db_session)
    
    now = datetime.now(timezone.utc)
    
    # Record usage for test user
    await token_manager.record_usage(
        user_id=test_user.id,
        conversation_id="conv-1",
        input_tokens=5000,
        output_tokens=3000,
        model="gpt-4"
    )
    
    await db_session.commit()
    
    # Get admin summary
    start_date = now - timedelta(days=1)
    end_date = now + timedelta(days=1)
    
    summary = await token_manager.get_usage_summary_for_admin(
        start_date=start_date,
        end_date=end_date,
        limit=10
    )
    
    assert len(summary) > 0
    assert summary[0]["user_id"] == test_user.id
    assert summary[0]["total_tokens"] == 8000
    assert summary[0]["requests_count"] == 1
    assert summary[0]["estimated_cost"] > 0


@pytest.mark.asyncio
async def test_model_name_variations(db_session):
    """Test that model name variations are handled correctly."""
    token_manager = TokenManager(db_session)
    
    # Test with version suffix
    cost1 = token_manager.calculate_cost(1000, 1000, "gpt-4-0613")
    cost2 = token_manager.calculate_cost(1000, 1000, "gpt-4")
    
    # Should use same pricing
    assert cost1 == cost2
    
    # Test case insensitivity
    cost3 = token_manager.calculate_cost(1000, 1000, "GPT-4")
    assert cost3 == cost2
