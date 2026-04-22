"""Tests for SQL generation and query processing services."""

import os
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Set minimal environment variables for testing
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.services.sql_generator import SQLGenerator, SQLGenerationResult
from app.services.system_prompt_loader import SystemPromptLoader
from app.services.security_guard import SecurityGuard, ValidationResult
from app.services.response_formatter import ResponseFormatter, ChartMetadata
from app.services.ai.base_client import AIResponse


class TestSystemPromptLoader:
    """Tests for SystemPromptLoader."""
    
    def test_load_prompt_success(self):
        """Test successful prompt loading."""
        loader = SystemPromptLoader()
        
        # Should load without errors
        assert loader._prompt_data is not None
        assert "role" in loader._prompt_data
        assert "database_schema" in loader._prompt_data
        
    def test_get_prompt_returns_string(self):
        """Test get_prompt returns formatted string."""
        loader = SystemPromptLoader()
        prompt = loader.get_prompt()
        
        assert isinstance(prompt, str)
        assert len(prompt) > 0
        assert "payment analytics" in prompt.lower()
    
    def test_get_database_schema(self):
        """Test get_database_schema returns schema dict."""
        loader = SystemPromptLoader()
        schema = loader.get_database_schema()
        
        assert isinstance(schema, dict)
        assert "payment_records" in schema
        assert "upload_sessions" in schema


class TestSQLGenerator:
    """Tests for SQLGenerator."""
    
    @pytest.fixture
    def mock_ai_client(self):
        """Create mock AI client."""
        client = AsyncMock()
        client.generate_response = AsyncMock(return_value=AIResponse(
            content="```sql\nSELECT * FROM payment_records LIMIT 10;\n```",
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
        ))
        return client
    
    @pytest.fixture
    def sql_generator(self, mock_ai_client):
        """Create SQLGenerator instance."""
        loader = SystemPromptLoader()
        guard = SecurityGuard()
        return SQLGenerator(mock_ai_client, loader, guard)
    
    @pytest.mark.asyncio
    async def test_generate_sql_success(self, sql_generator):
        """Test successful SQL generation."""
        result = await sql_generator.generate_sql(
            user_query="Show me all payments",
            conversation_context=None,
        )
        
        assert result.success
        assert result.sql_query is not None
        assert "SELECT" in result.sql_query.upper()
        assert "LIMIT" in result.sql_query.upper()
    
    @pytest.mark.asyncio
    async def test_generate_sql_adds_limit(self, sql_generator, mock_ai_client):
        """Test that LIMIT is added if missing."""
        # Mock AI response without LIMIT
        mock_ai_client.generate_response = AsyncMock(return_value=AIResponse(
            content="```sql\nSELECT * FROM payment_records;\n```",
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
        ))
        
        result = await sql_generator.generate_sql(
            user_query="Show me all payments",
            conversation_context=None,
        )
        
        assert result.success
        assert "LIMIT" in result.sql_query.upper()
    
    def test_validate_sql_rejects_non_select(self, sql_generator):
        """Test SQL validation rejects non-SELECT queries."""
        result = sql_generator.validate_sql("DELETE FROM payment_records;")
        
        assert not result.is_valid
        assert "DELETE" in result.error_message.upper()
    
    def test_validate_sql_requires_limit(self, sql_generator):
        """Test SQL validation requires LIMIT clause."""
        result = sql_generator.validate_sql("SELECT * FROM payment_records;")
        
        assert not result.is_valid
        assert "LIMIT" in result.error_message.upper()
    
    def test_validate_sql_accepts_valid_query(self, sql_generator):
        """Test SQL validation accepts valid SELECT query."""
        result = sql_generator.validate_sql(
            "SELECT bank, SUM(payment_amount) FROM payment_records GROUP BY bank LIMIT 10;"
        )
        
        assert result.is_valid


class TestResponseFormatter:
    """Tests for ResponseFormatter."""
    
    @pytest.fixture
    def formatter(self):
        """Create ResponseFormatter instance."""
        return ResponseFormatter()
    
    @pytest.mark.asyncio
    async def test_format_response_without_chart(self, formatter):
        """Test formatting response without chart data."""
        result = await formatter.format_response(
            ai_response="Here are your results.",
            query_results=None,
            user_query="Show me data",
        )
        
        assert result.content == "Here are your results."
        assert result.chart_metadata is None
    
    @pytest.mark.asyncio
    async def test_format_response_with_chart(self, formatter):
        """Test formatting response with chart data."""
        query_results = [
            {"bank": "Bank A", "total_amount": 1000.0},
            {"bank": "Bank B", "total_amount": 2000.0},
            {"bank": "Bank C", "total_amount": 1500.0},
        ]
        
        result = await formatter.format_response(
            ai_response="Here are the top banks.",
            query_results=query_results,
            user_query="Show me top banks",
        )
        
        assert result.content == "Here are the top banks."
        assert result.chart_metadata is not None
        assert result.chart_metadata.type == "bar"
        assert len(result.chart_metadata.data) == 3
        assert len(result.chart_metadata.labels) == 3
    
    def test_determine_chart_type_bar_for_top_n(self, formatter):
        """Test bar chart detection for top-N queries."""
        query_results = [
            {"bank": "Bank A", "total": 1000},
            {"bank": "Bank B", "total": 2000},
        ]
        
        chart = formatter.determine_chart_type(
            query_results=query_results,
            user_query="Show me top 5 banks",
        )
        
        assert chart is not None
        assert chart.type == "bar"
    
    def test_determine_chart_type_line_for_trends(self, formatter):
        """Test line chart detection for trend queries."""
        query_results = [
            {"month": "2024-01", "total": 1000},
            {"month": "2024-02", "total": 2000},
            {"month": "2024-03", "total": 1500},
        ]
        
        chart = formatter.determine_chart_type(
            query_results=query_results,
            user_query="Show me payment trends over time",
        )
        
        assert chart is not None
        assert chart.type == "line"
    
    def test_determine_chart_type_pie_for_distribution(self, formatter):
        """Test pie chart detection for distribution queries."""
        query_results = [
            {"touchpoint": "SMS", "total": 1000},
            {"touchpoint": "Email", "total": 2000},
            {"touchpoint": "IVR", "total": 1500},
        ]
        
        chart = formatter.determine_chart_type(
            query_results=query_results,
            user_query="Show me payment breakdown by touchpoint",
        )
        
        assert chart is not None
        assert chart.type == "pie"
    
    def test_determine_chart_type_none_for_too_many_results(self, formatter):
        """Test no chart for too many results."""
        query_results = [{"bank": f"Bank {i}", "total": i * 100} for i in range(15)]
        
        chart = formatter.determine_chart_type(
            query_results=query_results,
            user_query="Show me all banks",
        )
        
        assert chart is None
    
    def test_determine_chart_type_none_for_single_result(self, formatter):
        """Test no chart for single result."""
        query_results = [{"bank": "Bank A", "total": 1000}]
        
        chart = formatter.determine_chart_type(
            query_results=query_results,
            user_query="Show me highest payment",
        )
        
        assert chart is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
