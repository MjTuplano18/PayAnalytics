"""Tests for token usage reporting endpoint."""

import pytest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import status
from httpx import AsyncClient

from app.models.token_usage import TokenUsage
from app.models.user import User


@pytest.mark.asyncio
async def test_get_token_usage_json_response(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage returns JSON response by default."""
    
    # Mock token manager to return usage data
    mock_usage_data = {
        "user_id": test_user.id,
        "period_start": datetime.now(timezone.utc) - timedelta(days=30),
        "period_end": datetime.now(timezone.utc),
        "total_tokens": 15000,
        "input_tokens": 10000,
        "output_tokens": 5000,
        "estimated_cost": 0.75,
        "requests_count": 25,
        "by_model": {
            "gpt-4": {
                "total_tokens": 15000,
                "input_tokens": 10000,
                "output_tokens": 5000,
                "estimated_cost": 0.75,
                "requests_count": 25,
            }
        },
        "by_day": {
            "2024-01-15": {
                "total_tokens": 5000,
                "input_tokens": 3000,
                "output_tokens": 2000,
                "estimated_cost": 0.25,
                "requests_count": 10,
            },
            "2024-01-16": {
                "total_tokens": 10000,
                "input_tokens": 7000,
                "output_tokens": 3000,
                "estimated_cost": 0.50,
                "requests_count": 15,
            },
        },
    }
    
    with patch("app.api.v1.routers.chat.TokenManager") as MockTokenManager:
        mock_instance = AsyncMock()
        mock_instance.get_user_usage.return_value = mock_usage_data
        MockTokenManager.return_value = mock_instance
        
        response = await client.get(
            "/api/v1/chat/token-usage",
            headers=auth_headers,
        )
    
    assert response.status_code == status.HTTP_200_OK
    
    data = response.json()
    assert data["user_id"] == test_user.id
    assert data["total_tokens"] == 15000
    assert data["input_tokens"] == 10000
    assert data["output_tokens"] == 5000
    assert data["estimated_cost"] == 0.75
    assert data["requests_count"] == 25


@pytest.mark.asyncio
async def test_get_token_usage_with_date_range(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage with custom date range."""
    
    start_date = "2024-01-01"
    end_date = "2024-01-31"
    
    mock_usage_data = {
        "user_id": test_user.id,
        "period_start": datetime(2024, 1, 1, tzinfo=timezone.utc),
        "period_end": datetime(2024, 1, 31, tzinfo=timezone.utc),
        "total_tokens": 20000,
        "input_tokens": 12000,
        "output_tokens": 8000,
        "estimated_cost": 1.20,
        "requests_count": 40,
        "by_model": {},
        "by_day": {},
    }
    
    with patch("app.api.v1.routers.chat.TokenManager") as MockTokenManager:
        mock_instance = AsyncMock()
        mock_instance.get_user_usage.return_value = mock_usage_data
        MockTokenManager.return_value = mock_instance
        
        response = await client.get(
            f"/api/v1/chat/token-usage?start_date={start_date}&end_date={end_date}",
            headers=auth_headers,
        )
    
    assert response.status_code == status.HTTP_200_OK
    
    data = response.json()
    assert data["total_tokens"] == 20000
    assert data["requests_count"] == 40


@pytest.mark.asyncio
async def test_get_token_usage_csv_export(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage with CSV export via Accept header."""
    
    mock_usage_data = {
        "user_id": test_user.id,
        "period_start": datetime(2024, 1, 1, tzinfo=timezone.utc),
        "period_end": datetime(2024, 1, 31, tzinfo=timezone.utc),
        "total_tokens": 15000,
        "input_tokens": 10000,
        "output_tokens": 5000,
        "estimated_cost": 0.75,
        "requests_count": 25,
        "by_model": {
            "gpt-4": {
                "total_tokens": 15000,
                "input_tokens": 10000,
                "output_tokens": 5000,
                "estimated_cost": 0.75,
                "requests_count": 25,
            }
        },
        "by_day": {
            "2024-01-15": {
                "total_tokens": 5000,
                "input_tokens": 3000,
                "output_tokens": 2000,
                "estimated_cost": 0.25,
                "requests_count": 10,
            },
            "2024-01-16": {
                "total_tokens": 10000,
                "input_tokens": 7000,
                "output_tokens": 3000,
                "estimated_cost": 0.50,
                "requests_count": 15,
            },
        },
    }
    
    with patch("app.api.v1.routers.chat.TokenManager") as MockTokenManager:
        mock_instance = AsyncMock()
        mock_instance.get_user_usage.return_value = mock_usage_data
        MockTokenManager.return_value = mock_instance
        
        # Add Accept header for CSV
        csv_headers = {**auth_headers, "Accept": "text/csv"}
        
        response = await client.get(
            "/api/v1/chat/token-usage",
            headers=csv_headers,
        )
    
    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert "attachment" in response.headers.get("content-disposition", "")
    
    # Verify CSV content
    csv_content = response.text
    assert "Date,Total Tokens,Input Tokens,Output Tokens,Estimated Cost (USD),Requests Count" in csv_content
    assert "2024-01-15,5000,3000,2000,0.250000,10" in csv_content
    assert "2024-01-16,10000,7000,3000,0.500000,15" in csv_content
    assert "Summary" in csv_content
    assert "By Model" in csv_content
    assert "gpt-4" in csv_content


@pytest.mark.asyncio
async def test_get_token_usage_invalid_date_format(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage with invalid date format."""
    
    response = await client.get(
        "/api/v1/chat/token-usage?start_date=invalid-date",
        headers=auth_headers,
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Invalid date format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_token_usage_start_after_end(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage with start_date after end_date."""
    
    response = await client.get(
        "/api/v1/chat/token-usage?start_date=2024-02-01&end_date=2024-01-01",
        headers=auth_headers,
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "start_date must be before or equal to end_date" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_token_usage_date_range_too_large(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage with date range exceeding 365 days."""
    
    response = await client.get(
        "/api/v1/chat/token-usage?start_date=2023-01-01&end_date=2024-12-31",
        headers=auth_headers,
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Date range cannot exceed 365 days" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_token_usage_requires_authentication(client: AsyncClient):
    """Test GET /api/v1/chat/token-usage requires valid JWT token."""
    
    response = await client.get("/api/v1/chat/token-usage")
    
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_get_token_usage_default_date_range(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage defaults to last 30 days."""
    
    mock_usage_data = {
        "user_id": test_user.id,
        "period_start": datetime.now(timezone.utc) - timedelta(days=30),
        "period_end": datetime.now(timezone.utc),
        "total_tokens": 5000,
        "input_tokens": 3000,
        "output_tokens": 2000,
        "estimated_cost": 0.30,
        "requests_count": 10,
        "by_model": {},
        "by_day": {},
    }
    
    with patch("app.api.v1.routers.chat.TokenManager") as MockTokenManager:
        mock_instance = AsyncMock()
        mock_instance.get_user_usage.return_value = mock_usage_data
        MockTokenManager.return_value = mock_instance
        
        response = await client.get(
            "/api/v1/chat/token-usage",
            headers=auth_headers,
        )
        
        # Verify the token manager was called with approximately 30 days range
        call_args = mock_instance.get_user_usage.call_args
        start_dt = call_args.kwargs["start_date"]
        end_dt = call_args.kwargs["end_date"]
        
        date_diff = (end_dt - start_dt).days
        assert 29 <= date_diff <= 31  # Allow for slight timing differences
    
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_get_token_usage_empty_results(client: AsyncClient, test_user: User, auth_headers: dict):
    """Test GET /api/v1/chat/token-usage with no usage data."""
    
    mock_usage_data = {
        "user_id": test_user.id,
        "period_start": datetime.now(timezone.utc) - timedelta(days=30),
        "period_end": datetime.now(timezone.utc),
        "total_tokens": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "estimated_cost": 0.0,
        "requests_count": 0,
        "by_model": {},
        "by_day": {},
    }
    
    with patch("app.api.v1.routers.chat.TokenManager") as MockTokenManager:
        mock_instance = AsyncMock()
        mock_instance.get_user_usage.return_value = mock_usage_data
        MockTokenManager.return_value = mock_instance
        
        response = await client.get(
            "/api/v1/chat/token-usage",
            headers=auth_headers,
        )
    
    assert response.status_code == status.HTTP_200_OK
    
    data = response.json()
    assert data["total_tokens"] == 0
    assert data["requests_count"] == 0
    assert data["estimated_cost"] == 0.0
