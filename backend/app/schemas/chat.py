from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Request Schemas ──────────────────────────────────────────────────────────


class ChatQueryRequest(BaseModel):
    """Request schema for submitting a chat query."""

    query: str = Field(..., min_length=1, max_length=1000, description="Natural language query")
    conversation_id: str | None = Field(None, description="Optional conversation ID for context")
    stream: bool = Field(False, description="Enable streaming response")


class ConversationCreateRequest(BaseModel):
    """Request schema for creating a new conversation."""

    title: str | None = Field(None, max_length=255, description="Optional conversation title")


class QuickActionRequest(BaseModel):
    """Request schema for executing a quick action template."""

    template_id: str = Field(..., description="ID of the quick action template")


class QuickActionTemplate(BaseModel):
    """Schema for a quick action template."""

    id: str = Field(..., description="Template ID")
    label: str = Field(..., description="Display label for the quick action")
    query: str = Field(..., description="Pre-defined query text")
    icon: str | None = Field(None, description="Optional icon identifier")
    description: str | None = Field(None, description="Optional description of what the action does")


class QuickActionsResponse(BaseModel):
    """Response schema for listing quick action templates."""

    templates: list[QuickActionTemplate] = Field(..., description="List of quick action templates")
    total: int = Field(..., description="Total number of templates")


# ── Response Schemas ─────────────────────────────────────────────────────────


class ChartMetadata(BaseModel):
    """Metadata for chart visualization."""

    type: Literal["bar", "line", "pie"] = Field(..., description="Chart type")
    data: list[float] = Field(..., description="Chart data points")
    labels: list[str] = Field(..., description="Chart labels")
    title: str | None = Field(None, description="Chart title")
    x_axis_label: str | None = Field(None, description="X-axis label")
    y_axis_label: str | None = Field(None, description="Y-axis label")


class Message(BaseModel):
    """Schema for a chat message."""

    id: str = Field(..., description="Message ID")
    role: Literal["user", "assistant"] = Field(..., description="Message role")
    content: str = Field(..., description="Message content")
    created_at: datetime = Field(..., description="Message creation timestamp")
    metadata: dict | None = Field(None, description="Optional message metadata")

    model_config = ConfigDict(from_attributes=True)


class ChatQueryResponse(BaseModel):
    """Response schema for a chat query."""

    message_id: str = Field(..., description="ID of the generated message")
    conversation_id: str = Field(..., description="Conversation ID")
    role: Literal["assistant"] = Field("assistant", description="Message role")
    content: str = Field(..., description="AI response content")
    chart_metadata: ChartMetadata | None = Field(None, description="Optional chart data")
    tokens_used: int = Field(..., description="Number of tokens used")
    processing_time_ms: int = Field(..., description="Processing time in milliseconds")
    cached: bool = Field(False, description="Whether response was cached")


class Conversation(BaseModel):
    """Schema for a conversation."""

    id: str = Field(..., description="Conversation ID")
    title: str | None = Field(None, description="Conversation title")
    message_count: int = Field(..., description="Number of messages in conversation")
    created_at: datetime = Field(..., description="Conversation creation timestamp")
    updated_at: datetime = Field(..., description="Conversation last update timestamp")

    model_config = ConfigDict(from_attributes=True)


class ConversationListResponse(BaseModel):
    """Response schema for listing conversations."""

    conversations: list[Conversation] = Field(..., description="List of conversations")
    total: int = Field(..., description="Total number of conversations")


class ConversationHistoryResponse(BaseModel):
    """Response schema for conversation history."""

    conversation_id: str = Field(..., description="Conversation ID")
    messages: list[Message] = Field(..., description="List of messages")
    total: int = Field(..., description="Total number of messages")


class TokenUsageResponse(BaseModel):
    """Response schema for token usage report."""

    user_id: str = Field(..., description="User ID")
    period_start: datetime = Field(..., description="Report period start")
    period_end: datetime = Field(..., description="Report period end")
    total_tokens: int = Field(..., description="Total tokens used")
    input_tokens: int = Field(..., description="Input tokens used")
    output_tokens: int = Field(..., description="Output tokens used")
    estimated_cost: float = Field(..., description="Estimated cost in USD")
    requests_count: int = Field(..., description="Number of requests made")


class ErrorResponse(BaseModel):
    """Response schema for errors."""

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: dict | None = Field(None, description="Optional error details")
