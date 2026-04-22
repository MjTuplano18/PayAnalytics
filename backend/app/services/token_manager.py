"""Token Manager Service for AI Chat Assistant.

This service tracks AI token usage, calculates costs, and provides usage reports.
It monitors token consumption per user and sends alerts when approaching limits.
"""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.token_usage import TokenUsage


class TokenManager:
    """Manages AI token usage tracking and cost calculation.
    
    Responsibilities:
    - Record input and output tokens for each AI request
    - Calculate estimated costs based on AI provider pricing
    - Provide usage reports by user and date range
    - Aggregate token usage by user, day, and month
    - Send alerts when users exceed 80% of daily token budget
    """

    # Current pricing as of design (per 1K tokens)
    # Requirements: 15.2
    PRICING = {
        "gpt-4": {
            "input": Decimal("0.03"),   # $0.03 per 1K input tokens
            "output": Decimal("0.06"),  # $0.06 per 1K output tokens
        },
        "gpt-4-turbo": {
            "input": Decimal("0.01"),
            "output": Decimal("0.03"),
        },
        "gpt-3.5-turbo": {
            "input": Decimal("0.0005"),
            "output": Decimal("0.0015"),
        },
        "claude-3-opus": {
            "input": Decimal("0.015"),  # $0.015 per 1K input tokens
            "output": Decimal("0.075"), # $0.075 per 1K output tokens
        },
        "claude-3-sonnet": {
            "input": Decimal("0.003"),
            "output": Decimal("0.015"),
        },
        "claude-3-haiku": {
            "input": Decimal("0.00025"),
            "output": Decimal("0.00125"),
        },
        "llama-3.1-70b": {
            "input": Decimal("0.00059"),
            "output": Decimal("0.00079"),
        },
        "llama-3.1-8b": {
            "input": Decimal("0.00005"),
            "output": Decimal("0.00008"),
        },
    }

    # Daily token budget for alerts (80% of 50k limit)
    # Requirements: 15.5
    DAILY_TOKEN_LIMIT = 50000
    ALERT_THRESHOLD = 0.8  # 80%

    def __init__(self, db_session: AsyncSession):
        """Initialize the token manager.
        
        Args:
            db_session: SQLAlchemy async database session
        """
        self.db = db_session
        self.logger = logging.getLogger(__name__)

    async def record_usage(
        self,
        user_id: str,
        conversation_id: str,
        input_tokens: int,
        output_tokens: int,
        model: str,
    ) -> TokenUsage:
        """Record token usage for a request.
        
        Tracks input and output tokens separately and calculates estimated cost.
        Stores the usage in the database for historical analysis.
        
        Args:
            user_id: ID of the user who made the request
            conversation_id: ID of the conversation
            input_tokens: Number of input tokens (query + context)
            output_tokens: Number of output tokens (response)
            model: AI model used (e.g., 'gpt-4', 'claude-3-opus')
            
        Returns:
            Created TokenUsage object
            
        Requirements: 15.1, 15.6
        """
        total_tokens = input_tokens + output_tokens
        estimated_cost = self.calculate_cost(input_tokens, output_tokens, model)
        
        token_usage = TokenUsage(
            id=str(uuid.uuid4()),
            user_id=user_id,
            conversation_id=conversation_id,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost=estimated_cost,
        )
        
        self.db.add(token_usage)
        
        try:
            await self.db.flush()
            self.logger.info(
                "Recorded token usage: user=%s model=%s input=%d output=%d total=%d cost=$%.6f",
                user_id,
                model,
                input_tokens,
                output_tokens,
                total_tokens,
                float(estimated_cost),
            )
            
            # Check if user is approaching daily limit
            await self._check_and_alert_if_approaching_limit(user_id)
            
        except Exception as e:
            self.logger.error("Failed to record token usage: %s", str(e))
        
        return token_usage

    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str,
    ) -> Decimal:
        """Calculate estimated cost based on current AI provider pricing.
        
        Uses the pricing table for the specified model. If model is not found,
        defaults to GPT-4 pricing as a conservative estimate.
        
        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            model: AI model name (e.g., 'gpt-4', 'claude-3-opus')
            
        Returns:
            Estimated cost in USD as Decimal
            
        Requirements: 15.2
        """
        # Normalize model name (handle variations like 'gpt-4-0613')
        model_key = model.lower()
        
        # Try exact match first
        if model_key in self.PRICING:
            pricing = self.PRICING[model_key]
        else:
            # Try prefix match (e.g., 'gpt-4-0613' matches 'gpt-4')
            pricing = None
            for key in self.PRICING:
                if model_key.startswith(key):
                    pricing = self.PRICING[key]
                    break
            
            # Default to GPT-4 pricing if model not found
            if pricing is None:
                self.logger.warning(
                    "Unknown model '%s', using GPT-4 pricing as default",
                    model,
                )
                pricing = self.PRICING["gpt-4"]
        
        # Calculate cost: (tokens / 1000) * price_per_1k
        input_cost = (Decimal(input_tokens) / Decimal(1000)) * pricing["input"]
        output_cost = (Decimal(output_tokens) / Decimal(1000)) * pricing["output"]
        total_cost = input_cost + output_cost
        
        return total_cost

    async def get_user_usage(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> dict:
        """Get token usage report for a user within a date range.
        
        Aggregates token usage and costs for the specified period.
        
        Args:
            user_id: ID of the user
            start_date: Start of the date range (inclusive)
            end_date: End of the date range (inclusive)
            
        Returns:
            Dictionary with usage statistics:
            - user_id: User ID
            - period_start: Start date
            - period_end: End date
            - total_tokens: Total tokens used
            - input_tokens: Total input tokens
            - output_tokens: Total output tokens
            - estimated_cost: Total estimated cost
            - requests_count: Number of requests
            - by_model: Breakdown by model
            - by_day: Daily breakdown
            
        Requirements: 15.3, 15.4
        """
        # Query token usage within date range
        stmt = (
            select(TokenUsage)
            .where(TokenUsage.user_id == user_id)
            .where(TokenUsage.created_at >= start_date)
            .where(TokenUsage.created_at <= end_date)
            .order_by(TokenUsage.created_at)
        )
        
        result = await self.db.execute(stmt)
        usage_records = list(result.scalars().all())
        
        if not usage_records:
            return {
                "user_id": user_id,
                "period_start": start_date,
                "period_end": end_date,
                "total_tokens": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "estimated_cost": 0.0,
                "requests_count": 0,
                "by_model": {},
                "by_day": {},
            }
        
        # Aggregate totals
        total_tokens = sum(r.total_tokens for r in usage_records)
        input_tokens = sum(r.input_tokens for r in usage_records)
        output_tokens = sum(r.output_tokens for r in usage_records)
        estimated_cost = sum(r.estimated_cost for r in usage_records)
        requests_count = len(usage_records)
        
        # Aggregate by model
        by_model = {}
        for record in usage_records:
            if record.model not in by_model:
                by_model[record.model] = {
                    "total_tokens": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "estimated_cost": Decimal("0"),
                    "requests_count": 0,
                }
            
            by_model[record.model]["total_tokens"] += record.total_tokens
            by_model[record.model]["input_tokens"] += record.input_tokens
            by_model[record.model]["output_tokens"] += record.output_tokens
            by_model[record.model]["estimated_cost"] += record.estimated_cost
            by_model[record.model]["requests_count"] += 1
        
        # Convert Decimal to float for JSON serialization
        for model_stats in by_model.values():
            model_stats["estimated_cost"] = float(model_stats["estimated_cost"])
        
        # Aggregate by day
        by_day = {}
        for record in usage_records:
            day_key = record.created_at.date().isoformat()
            
            if day_key not in by_day:
                by_day[day_key] = {
                    "total_tokens": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "estimated_cost": Decimal("0"),
                    "requests_count": 0,
                }
            
            by_day[day_key]["total_tokens"] += record.total_tokens
            by_day[day_key]["input_tokens"] += record.input_tokens
            by_day[day_key]["output_tokens"] += record.output_tokens
            by_day[day_key]["estimated_cost"] += record.estimated_cost
            by_day[day_key]["requests_count"] += 1
        
        # Convert Decimal to float for JSON serialization
        for day_stats in by_day.values():
            day_stats["estimated_cost"] = float(day_stats["estimated_cost"])
        
        return {
            "user_id": user_id,
            "period_start": start_date,
            "period_end": end_date,
            "total_tokens": total_tokens,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost": float(estimated_cost),
            "requests_count": requests_count,
            "by_model": by_model,
            "by_day": by_day,
        }

    async def get_daily_usage(self, user_id: str, date: datetime | None = None) -> int:
        """Get total token usage for a user on a specific day.
        
        Args:
            user_id: ID of the user
            date: Date to check (defaults to today UTC)
            
        Returns:
            Total tokens used on the specified day
        """
        if date is None:
            date = datetime.now(timezone.utc)
        
        # Get start and end of day in UTC
        start_of_day = datetime.combine(date.date(), datetime.min.time(), tzinfo=timezone.utc)
        end_of_day = datetime.combine(date.date(), datetime.max.time(), tzinfo=timezone.utc)
        
        stmt = (
            select(func.sum(TokenUsage.total_tokens))
            .where(TokenUsage.user_id == user_id)
            .where(TokenUsage.created_at >= start_of_day)
            .where(TokenUsage.created_at <= end_of_day)
        )
        
        result = await self.db.execute(stmt)
        total = result.scalar()
        
        return total or 0

    async def get_monthly_usage(self, user_id: str, year: int, month: int) -> dict:
        """Get aggregated token usage for a user for a specific month.
        
        Args:
            user_id: ID of the user
            year: Year (e.g., 2024)
            month: Month (1-12)
            
        Returns:
            Dictionary with monthly usage statistics
            
        Requirements: 15.3
        """
        # Get start and end of month
        start_date = datetime(year, month, 1, tzinfo=timezone.utc)
        
        # Calculate end of month
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        
        return await self.get_user_usage(user_id, start_date, end_date)

    async def _check_and_alert_if_approaching_limit(self, user_id: str) -> None:
        """Check if user is approaching daily token limit and send alert.
        
        Sends an alert when user exceeds 80% of daily token budget.
        
        Args:
            user_id: ID of the user to check
            
        Requirements: 15.5, 6.6
        """
        daily_usage = await self.get_daily_usage(user_id)
        threshold = int(self.DAILY_TOKEN_LIMIT * self.ALERT_THRESHOLD)
        
        if daily_usage >= threshold:
            percentage = (daily_usage / self.DAILY_TOKEN_LIMIT) * 100
            
            self.logger.warning(
                "User %s has used %d tokens (%.1f%% of daily limit). Alert threshold exceeded.",
                user_id,
                daily_usage,
                percentage,
            )
            
            # In a production system, this would send an email, push notification,
            # or trigger an event for the notification service
            # For now, we just log the alert
            # TODO: Integrate with notification service when available
            
            # Could also store alert in database for admin dashboard
            # or trigger a webhook to external monitoring system

    async def get_usage_summary_for_admin(
        self,
        start_date: datetime,
        end_date: datetime,
        limit: int = 100,
    ) -> list[dict]:
        """Get usage summary across all users for admin reporting.
        
        Useful for cost analysis and identifying high-usage users.
        
        Args:
            start_date: Start of the date range
            end_date: End of the date range
            limit: Maximum number of users to return
            
        Returns:
            List of user usage summaries ordered by total tokens descending
        """
        stmt = (
            select(
                TokenUsage.user_id,
                func.sum(TokenUsage.total_tokens).label("total_tokens"),
                func.sum(TokenUsage.input_tokens).label("input_tokens"),
                func.sum(TokenUsage.output_tokens).label("output_tokens"),
                func.sum(TokenUsage.estimated_cost).label("estimated_cost"),
                func.count(TokenUsage.id).label("requests_count"),
            )
            .where(TokenUsage.created_at >= start_date)
            .where(TokenUsage.created_at <= end_date)
            .group_by(TokenUsage.user_id)
            .order_by(func.sum(TokenUsage.total_tokens).desc())
            .limit(limit)
        )
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "user_id": row.user_id,
                "total_tokens": row.total_tokens,
                "input_tokens": row.input_tokens,
                "output_tokens": row.output_tokens,
                "estimated_cost": float(row.estimated_cost),
                "requests_count": row.requests_count,
            }
            for row in rows
        ]
