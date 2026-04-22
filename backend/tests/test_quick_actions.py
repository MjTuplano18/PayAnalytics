"""
Tests for quick actions endpoints.

This module tests the quick actions functionality including:
- GET /api/v1/chat/quick-actions - List quick action templates
- POST /api/v1/chat/quick-actions/{id} - Execute quick action by template ID
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
async def test_get_quick_actions(
    async_client: AsyncClient,
    test_user: User,
    auth_headers: dict,
):
    """
    Test GET /api/v1/chat/quick-actions endpoint.
    
    Verifies that:
    - Endpoint requires authentication
    - Returns list of 10 quick action templates
    - Each template has required fields (id, label, query)
    """
    # Make request to get quick actions
    response = await async_client.get(
        "/api/v1/chat/quick-actions",
        headers=auth_headers,
    )
    
    # Assert successful response
    assert response.status_code == 200
    
    # Parse response
    data = response.json()
    
    # Verify response structure
    assert "templates" in data
    assert "total" in data
    
    # Verify we have 10 templates
    assert data["total"] == 10
    assert len(data["templates"]) == 10
    
    # Verify each template has required fields
    for template in data["templates"]:
        assert "id" in template
        assert "label" in template
        assert "query" in template
        assert template["id"]  # Not empty
        assert template["label"]  # Not empty
        assert template["query"]  # Not empty
        
        # Optional fields
        assert "icon" in template
        assert "description" in template


@pytest.mark.asyncio
async def test_get_quick_actions_requires_auth(
    async_client: AsyncClient,
):
    """
    Test that GET /api/v1/chat/quick-actions requires authentication.
    
    Verifies that:
    - Request without auth token returns 401
    """
    # Make request without auth headers
    response = await async_client.get("/api/v1/chat/quick-actions")
    
    # Assert unauthorized
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_quick_action_template_ids(
    async_client: AsyncClient,
    test_user: User,
    auth_headers: dict,
):
    """
    Test that quick action templates have expected IDs.
    
    Verifies that:
    - All 10 expected template IDs are present
    """
    # Make request to get quick actions
    response = await async_client.get(
        "/api/v1/chat/quick-actions",
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Extract template IDs
    template_ids = {template["id"] for template in data["templates"]}
    
    # Expected template IDs
    expected_ids = {
        "top-banks-month",
        "payment-trends-6m",
        "today-collections",
        "month-comparison",
        "highest-payment",
        "avg-payment-bank",
        "upload-summary",
        "environment-breakdown",
        "monthly-totals",
        "bank-performance",
    }
    
    # Verify all expected IDs are present
    assert template_ids == expected_ids


@pytest.mark.asyncio
async def test_execute_quick_action_not_found(
    async_client: AsyncClient,
    test_user: User,
    auth_headers: dict,
):
    """
    Test POST /api/v1/chat/quick-actions/{id} with invalid template ID.
    
    Verifies that:
    - Invalid template ID returns 404
    """
    # Make request with invalid action ID
    response = await async_client.post(
        "/api/v1/chat/quick-actions/invalid-action-id",
        headers=auth_headers,
    )
    
    # Assert not found
    assert response.status_code == 404
    
    # Verify error message
    data = response.json()
    assert "detail" in data
    assert "not found" in data["detail"].lower()


@pytest.mark.asyncio
async def test_execute_quick_action_requires_auth(
    async_client: AsyncClient,
):
    """
    Test that POST /api/v1/chat/quick-actions/{id} requires authentication.
    
    Verifies that:
    - Request without auth token returns 401
    """
    # Make request without auth headers
    response = await async_client.post(
        "/api/v1/chat/quick-actions/top-banks-month"
    )
    
    # Assert unauthorized
    assert response.status_code == 401


# Note: Full integration test for execute_quick_action would require:
# - Mock AI API client
# - Mock database with payment data
# - Mock query processor
# These are tested in the main query endpoint tests and query processor tests
