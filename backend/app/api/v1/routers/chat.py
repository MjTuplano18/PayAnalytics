from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import ChatQueryRequest, ChatQueryResponse, ConversationCreateRequest, Conversation, ConversationListResponse, ConversationHistoryResponse, Message, QuickActionsResponse, QuickActionTemplate
from app.services.ai.factory import get_ai_client
from app.services.audit_logger import AuditLogger
from app.services.cache_manager import CacheManager
from app.services.conversation_manager import ConversationManager
from app.services.query_processor import QueryProcessor
from app.services.rate_limiter import get_rate_limiter
from app.services.response_formatter import ResponseFormatter
from app.services.security_guard import SecurityGuard
from app.services.sql_generator import SQLGenerator
from app.services.system_prompt_loader import SystemPromptLoader
from app.services.token_manager import TokenManager

router = APIRouter(prefix="/chat", tags=["AI Chat Assistant"])


# All endpoints in this router require authentication via JWT token
# The get_current_user dependency validates the JWT token and extracts user_id
# This satisfies requirements 4.1, 4.2, 4.3, 4.4, 4.5


def get_query_processor(db: Annotated[AsyncSession, Depends(get_db)]) -> QueryProcessor:
    """
    Dependency function to create QueryProcessor with all required services.
    
    This creates a new instance for each request with all dependencies properly initialized.
    """
    # Initialize all required services
    system_prompt_loader = SystemPromptLoader()
    security_guard = SecurityGuard()
    ai_client = get_ai_client()
    
    sql_generator = SQLGenerator(
        ai_client=ai_client,
        system_prompt_loader=system_prompt_loader,
        security_guard=security_guard,
    )
    
    response_formatter = ResponseFormatter()
    conversation_manager = ConversationManager(db_session=db)
    cache_manager = CacheManager()
    audit_logger = AuditLogger(db_session=db)
    token_manager = TokenManager(db_session=db)
    
    return QueryProcessor(
        sql_generator=sql_generator,
        response_formatter=response_formatter,
        conversation_manager=conversation_manager,
        security_guard=security_guard,
        cache_manager=cache_manager,
        audit_logger=audit_logger,
        token_manager=token_manager,
        db_session=db,
    )


@router.post("/query", response_model=ChatQueryResponse)
async def chat_query(
    request: ChatQueryRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    query_processor: Annotated[QueryProcessor, Depends(get_query_processor)],
):
    """
    Process a natural language query and return AI-generated response.
    
    Requires valid JWT authentication token.
    Extracts user_id from JWT for rate limiting and audit logging.
    
    Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2
    
    Args:
        request: ChatQueryRequest with query text and optional conversation_id
        current_user: Authenticated user from JWT token
        db: Database session
        query_processor: QueryProcessor service instance
        
    Returns:
        ChatQueryResponse with message content, chart metadata, tokens used
        
    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 400: Invalid request
        HTTPException 500: Internal server error
    """
    # Apply rate limiting (check request and token limits)
    rate_limiter = get_rate_limiter()
    
    try:
        # Check rate limits and raise HTTPException if exceeded
        # This checks both request rate (20/min) and token limit (50k/day)
        rate_limiter.raise_if_rate_limited(
            user_id=current_user.id,
            estimated_tokens=500,  # Estimate ~500 tokens per request
        )
        
        # Increment request count after passing rate limit check
        rate_limiter.increment_request_count(current_user.id)
        
    except HTTPException:
        # Re-raise rate limit exceptions with proper status code and headers
        raise
    
    try:
        # Call QueryProcessor.process_query()
        response = await query_processor.process_query(
            user_id=current_user.id,
            query=request.query,
            conversation_id=request.conversation_id,
        )
        
        # Return ChatQueryResponse with message content, chart metadata, tokens used
        return ChatQueryResponse(
            message_id=response.message_id,
            conversation_id=response.conversation_id,
            role="assistant",
            content=response.content,
            chart_metadata=response.chart_metadata,
            tokens_used=response.tokens_used,
            processing_time_ms=response.processing_time_ms,
            cached=response.cached,
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (e.g., from rate limiting)
        raise
        
    except Exception as e:
        # Handle unexpected errors and return appropriate HTTP status codes
        # Log the error but don't expose internal details to the user
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Chat query failed for user {current_user.id}: {e}", exc_info=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your query. Please try again.",
        )


@router.get("/stream")
async def chat_stream(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    query_processor: Annotated[QueryProcessor, Depends(get_query_processor)],
    query: str,
    conversation_id: str | None = None,
):
    """
    Process a query with Server-Sent Events (SSE) streaming response.
    
    Requires valid JWT authentication token.
    Extracts user_id from JWT for rate limiting and audit logging.
    
    Requirements: 2.7, 2.8, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7
    
    Args:
        query: Natural language query text (query parameter)
        conversation_id: Optional conversation ID (query parameter)
        current_user: Authenticated user from JWT token
        db: Database session
        query_processor: QueryProcessor service instance
        
    Returns:
        StreamingResponse with Server-Sent Events
        
    Raises:
        HTTPException 400: Invalid request (missing query)
        HTTPException 429: Rate limit exceeded
        HTTPException 500: Internal server error
    """
    from fastapi.responses import StreamingResponse
    import json
    
    # Validate query parameter
    if not query or not query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query parameter is required and cannot be empty",
        )
    
    # Validate query length (1-1000 characters)
    if len(query) > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query must be 1000 characters or less",
        )
    
    # Apply rate limiting
    rate_limiter = get_rate_limiter()
    
    try:
        # Check rate limits and raise HTTPException if exceeded
        rate_limiter.raise_if_rate_limited(
            user_id=current_user.id,
            estimated_tokens=500,  # Estimate ~500 tokens per request
        )
        
        # Increment request count after passing rate limit check
        rate_limiter.increment_request_count(current_user.id)
        
    except HTTPException:
        # Re-raise rate limit exceptions
        raise
    
    async def event_generator():
        """Generate Server-Sent Events from streaming query processor.
        
        SSE format:
        data: <chunk>\n\n
        
        Supports client-initiated cancellation by detecting disconnection.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        # Track the conversation_id — it gets set when the first message is stored
        # We resolve it by running the full streaming pipeline and capturing it
        resolved_conversation_id = conversation_id
        
        try:
            # We need to capture the conversation_id that gets created/used during streaming.
            # Process the query non-streaming first to get the conversation_id, then stream
            # the response. This is done by intercepting the conversation manager.
            
            # Alternative: use process_query (non-streaming) to get conversation_id,
            # then stream the stored response. But that loses real-time streaming.
            
            # Best approach: patch the query processor to yield conversation_id as first event.
            # For now, run streaming and send conversation_id in the done event by
            # checking what conversation was created.
            
            # Get conversation count before to detect new conversation creation
            async for chunk in query_processor.process_streaming_query(
                user_id=current_user.id,
                query=query,
                conversation_id=conversation_id,
            ):
                # Check if this is a metadata chunk (starts with __META__)
                if isinstance(chunk, str) and chunk.startswith("__CONV_ID__:"):
                    resolved_conversation_id = chunk.split(":", 1)[1].strip()
                    # Send conversation_id to frontend immediately
                    yield f"data: {json.dumps({'conversation_id': resolved_conversation_id})}\n\n"
                else:
                    # Send as SSE data event
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            
            # Send completion event with conversation_id
            yield f"data: {json.dumps({'done': True, 'conversation_id': resolved_conversation_id})}\n\n"
            
        except Exception as e:
            logger.error(f"Streaming error for user {current_user.id}: {e}", exc_info=True)
            
            # Send error event
            error_data = {
                "error": True,
                "message": "An error occurred while processing your query. Please try again."
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    # Return StreamingResponse with SSE media type
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/conversations", response_model=Conversation, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    request: ConversationCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new conversation.
    
    Requires valid JWT authentication token.
    Creates a new conversation for the authenticated user with optional title.
    If no title is provided, it will be auto-generated from the first user message.
    
    Requirements: 7.5
    
    Args:
        request: ConversationCreateRequest with optional title
        current_user: Authenticated user from JWT token
        db: Database session
        
    Returns:
        Conversation object with ID, title, and metadata
        
    Raises:
        HTTPException 500: Internal server error
    """
    try:
        conversation_manager = ConversationManager(db_session=db)
        
        # Create new conversation
        conversation = await conversation_manager.create_conversation(
            user_id=current_user.id,
            title=request.title,
        )
        
        # Commit the transaction
        await db.commit()
        
        return Conversation(
            id=conversation.id,
            title=conversation.title,
            message_count=conversation.message_count,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to create conversation for user {current_user.id}: {e}", exc_info=True)
        
        await db.rollback()
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation. Please try again.",
        )


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 10,
):
    """
    List user's recent conversations (last 10 by default).
    
    Requires valid JWT authentication token.
    Returns only conversations belonging to the authenticated user.
    Conversations are ordered by most recently updated first.
    
    Requirements: 7.6
    
    Args:
        current_user: Authenticated user from JWT token
        db: Database session
        limit: Maximum number of conversations to return (default: 10, max: 100)
        
    Returns:
        ConversationListResponse with list of conversations and total count
        
    Raises:
        HTTPException 400: Invalid limit parameter
        HTTPException 500: Internal server error
    """
    # Validate limit parameter
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 100",
        )
    
    try:
        conversation_manager = ConversationManager(db_session=db)
        
        # Get user's conversations
        conversations = await conversation_manager.list_user_conversations(
            user_id=current_user.id,
            limit=limit,
            include_deleted=False,
        )
        
        # Convert to response schema
        conversation_list = [
            Conversation(
                id=conv.id,
                title=conv.title,
                message_count=conv.message_count,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
            )
            for conv in conversations
        ]
        
        return ConversationListResponse(
            conversations=conversation_list,
            total=len(conversation_list),
        )
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to list conversations for user {current_user.id}: {e}", exc_info=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve conversations. Please try again.",
        )


@router.get("/conversations/{conversation_id}/history", response_model=ConversationHistoryResponse)
async def get_conversation_history(
    conversation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
):
    """
    Get conversation messages.
    
    Requires valid JWT authentication token.
    Returns only conversations belonging to the authenticated user.
    Messages are returned in chronological order (oldest first).
    
    Requirements: 7.6
    
    Args:
        conversation_id: ID of the conversation
        current_user: Authenticated user from JWT token
        db: Database session
        limit: Maximum number of messages to return (default: 50, max: 100)
        
    Returns:
        ConversationHistoryResponse with conversation ID, messages, and total count
        
    Raises:
        HTTPException 400: Invalid limit parameter
        HTTPException 403: User does not have access to this conversation
        HTTPException 404: Conversation not found
        HTTPException 500: Internal server error
    """
    # Validate limit parameter
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 100",
        )
    
    try:
        conversation_manager = ConversationManager(db_session=db)
        
        # Verify conversation exists and belongs to user
        conversation = await conversation_manager.get_conversation(
            conversation_id=conversation_id,
            user_id=current_user.id,
        )
        
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found",
            )
        
        # Check if user owns this conversation
        if conversation.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this conversation",
            )
        
        # Get conversation messages
        messages = await conversation_manager.get_conversation_context(
            conversation_id=conversation_id,
            limit=limit,
        )
        
        # Convert to response schema
        message_list = [
            Message(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                created_at=msg.created_at,
                metadata=msg.metadata_,
            )
            for msg in messages
        ]
        
        return ConversationHistoryResponse(
            conversation_id=conversation_id,
            messages=message_list,
            total=len(message_list),
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to get conversation history for {conversation_id}: {e}", exc_info=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve conversation history. Please try again.",
        )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete a conversation.
    
    Requires valid JWT authentication token.
    Can only delete conversations belonging to the authenticated user.
    Performs a soft delete (marks as deleted) for audit trail.
    
    Requirements: 7.7
    
    Args:
        conversation_id: ID of the conversation to delete
        current_user: Authenticated user from JWT token
        db: Database session
        
    Returns:
        204 No Content on success
        
    Raises:
        HTTPException 403: User does not have access to this conversation
        HTTPException 404: Conversation not found
        HTTPException 500: Internal server error
    """
    try:
        conversation_manager = ConversationManager(db_session=db)
        
        # Attempt to delete the conversation
        deleted = await conversation_manager.delete_conversation(
            conversation_id=conversation_id,
            user_id=current_user.id,
            soft_delete=True,  # Soft delete for audit trail
        )
        
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found or you do not have access to it",
            )
        
        # Commit the transaction
        await db.commit()
        
        # Return 204 No Content (no response body)
        return None
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to delete conversation {conversation_id}: {e}", exc_info=True)
        
        await db.rollback()
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete conversation. Please try again.",
        )


@router.get("/quick-actions", response_model=QuickActionsResponse)
async def get_quick_actions(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Return list of quick action templates.
    
    Requires valid JWT authentication token.
    Returns pre-defined query templates for common payment analytics questions.
    
    Requirements: 17.1, 17.2, 17.3
    
    Args:
        current_user: Authenticated user from JWT token
        
    Returns:
        QuickActionsResponse with list of quick action templates
    """
    # Define 10 default quick action templates
    # These templates cover common payment analytics queries
    templates = [
        QuickActionTemplate(
            id="top-banks-month",
            label="Top 5 Banks This Month",
            query="Show me the top 5 banks by collection amount this month",
            icon="trending_up",
            description="View the highest performing banks for the current month",
        ),
        QuickActionTemplate(
            id="payment-trends-6m",
            label="Payment Trends (6 Months)",
            query="What are the payment trends over the last 6 months?",
            icon="show_chart",
            description="Analyze payment collection trends over the past 6 months",
        ),
        QuickActionTemplate(
            id="today-collections",
            label="Today's Collections by Touchpoint",
            query="Show me today's collections broken down by touchpoint",
            icon="today",
            description="View today's payment collections grouped by touchpoint",
        ),
        QuickActionTemplate(
            id="month-comparison",
            label="Compare This Month vs Last Month",
            query="Compare this month's collections to last month",
            icon="compare_arrows",
            description="Compare current month performance against previous month",
        ),
        QuickActionTemplate(
            id="highest-payment",
            label="Highest Single Payment",
            query="What was the highest single payment amount?",
            icon="attach_money",
            description="Find the largest individual payment transaction",
        ),
        QuickActionTemplate(
            id="avg-payment-bank",
            label="Average Payment by Bank",
            query="Show me the average payment amount for each bank",
            icon="account_balance",
            description="Calculate average payment amounts grouped by bank",
        ),
        QuickActionTemplate(
            id="upload-summary",
            label="Upload Summary",
            query="Give me a summary of recent uploads",
            icon="cloud_upload",
            description="View summary of recent data uploads",
        ),
        QuickActionTemplate(
            id="environment-breakdown",
            label="Environment Breakdown",
            query="Show me payment breakdown by environment",
            icon="dns",
            description="Analyze payment distribution across environments",
        ),
        QuickActionTemplate(
            id="monthly-totals",
            label="Monthly Totals",
            query="What are the total collections for each month this year?",
            icon="calendar_today",
            description="View monthly collection totals for the current year",
        ),
        QuickActionTemplate(
            id="bank-performance",
            label="Bank Performance Ranking",
            query="Rank all banks by their total collection performance",
            icon="leaderboard",
            description="View complete ranking of banks by collection performance",
        ),
    ]
    
    return QuickActionsResponse(
        templates=templates,
        total=len(templates),
    )


@router.post("/quick-actions/{action_id}", response_model=ChatQueryResponse)
async def execute_quick_action(
    action_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    query_processor: Annotated[QueryProcessor, Depends(get_query_processor)],
    conversation_id: str | None = None,
):
    """
    Execute a quick action by template ID.
    
    Requires valid JWT authentication token.
    Executes the pre-defined query associated with the quick action template.
    
    Requirements: 17.1, 17.2, 17.3
    
    Args:
        action_id: ID of the quick action template to execute
        current_user: Authenticated user from JWT token
        db: Database session
        query_processor: QueryProcessor service instance
        conversation_id: Optional conversation ID (query parameter)
        
    Returns:
        ChatQueryResponse with message content, chart metadata, tokens used
        
    Raises:
        HTTPException 404: Quick action template not found
        HTTPException 429: Rate limit exceeded
        HTTPException 500: Internal server error
    """
    # Define the same templates as in get_quick_actions
    # In a production system, these would be stored in a database or configuration file
    templates_map = {
        "top-banks-month": "Show me the top 5 banks by collection amount this month",
        "payment-trends-6m": "What are the payment trends over the last 6 months?",
        "today-collections": "Show me today's collections broken down by touchpoint",
        "month-comparison": "Compare this month's collections to last month",
        "highest-payment": "What was the highest single payment amount?",
        "avg-payment-bank": "Show me the average payment amount for each bank",
        "upload-summary": "Give me a summary of recent uploads",
        "environment-breakdown": "Show me payment breakdown by environment",
        "monthly-totals": "What are the total collections for each month this year?",
        "bank-performance": "Rank all banks by their total collection performance",
    }
    
    # Check if action_id exists
    if action_id not in templates_map:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quick action template '{action_id}' not found",
        )
    
    # Get the query text for this action
    query_text = templates_map[action_id]
    
    # Apply rate limiting
    rate_limiter = get_rate_limiter()
    
    try:
        # Check rate limits and raise HTTPException if exceeded
        rate_limiter.raise_if_rate_limited(
            user_id=current_user.id,
            estimated_tokens=500,  # Estimate ~500 tokens per request
        )
        
        # Increment request count after passing rate limit check
        rate_limiter.increment_request_count(current_user.id)
        
    except HTTPException:
        # Re-raise rate limit exceptions
        raise
    
    try:
        # Execute the query using the query processor
        response = await query_processor.process_query(
            user_id=current_user.id,
            query=query_text,
            conversation_id=conversation_id,
        )
        
        # Return ChatQueryResponse
        return ChatQueryResponse(
            message_id=response.message_id,
            conversation_id=response.conversation_id,
            role="assistant",
            content=response.content,
            chart_metadata=response.chart_metadata,
            tokens_used=response.tokens_used,
            processing_time_ms=response.processing_time_ms,
            cached=response.cached,
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
        
    except Exception as e:
        # Handle unexpected errors
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Quick action execution failed for user {current_user.id}, action {action_id}: {e}", exc_info=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while executing the quick action. Please try again.",
        )


@router.get("/token-usage", response_model=None)
async def get_token_usage(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: str | None = None,
    end_date: str | None = None,
):
    """
    Get user's token usage report.
    
    Requires valid JWT authentication token.
    Returns token usage data only for the authenticated user.
    Supports CSV export via Accept header.
    
    Requirements: 15.4, 15.7
    
    Args:
        current_user: Authenticated user from JWT token
        db: Database session
        start_date: Optional start date (ISO format: YYYY-MM-DD)
        end_date: Optional end date (ISO format: YYYY-MM-DD)
        
    Returns:
        TokenUsageResponse with aggregated usage and estimated cost (JSON)
        or CSV file if Accept: text/csv header is provided
        
    Raises:
        HTTPException 400: Invalid date format
        HTTPException 500: Internal server error
    """
    from datetime import datetime, timezone, timedelta
    from fastapi import Request
    from fastapi.responses import Response
    import io
    import csv
    
    # Parse date parameters
    try:
        # Default to last 30 days if no dates provided
        if end_date is None:
            end_dt = datetime.now(timezone.utc)
        else:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
        
        if start_date is None:
            start_dt = end_dt - timedelta(days=30)
        else:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
        
        # Validate date range
        if start_dt > end_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date must be before or equal to end_date",
            )
        
        # Limit to 1 year maximum
        if (end_dt - start_dt).days > 365:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Date range cannot exceed 365 days",
            )
            
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS): {str(e)}",
        )
    
    try:
        # Get token usage data
        token_manager = TokenManager(db_session=db)
        
        usage_data = await token_manager.get_user_usage(
            user_id=current_user.id,
            start_date=start_dt,
            end_date=end_dt,
        )
        
        # Check if CSV export is requested via Accept header
        accept_header = request.headers.get("accept", "")
        if accept_header and 'text/csv' in accept_header.lower():
            # Generate CSV response
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write header
            writer.writerow([
                'Date',
                'Total Tokens',
                'Input Tokens',
                'Output Tokens',
                'Estimated Cost (USD)',
                'Requests Count',
            ])
            
            # Write daily breakdown
            for date_str, day_data in sorted(usage_data['by_day'].items()):
                writer.writerow([
                    date_str,
                    day_data['total_tokens'],
                    day_data['input_tokens'],
                    day_data['output_tokens'],
                    f"{day_data['estimated_cost']:.6f}",
                    day_data['requests_count'],
                ])
            
            # Write summary row
            writer.writerow([])
            writer.writerow(['Summary', '', '', '', '', ''])
            writer.writerow([
                f"Period: {start_dt.date()} to {end_dt.date()}",
                usage_data['total_tokens'],
                usage_data['input_tokens'],
                usage_data['output_tokens'],
                f"{usage_data['estimated_cost']:.6f}",
                usage_data['requests_count'],
            ])
            
            # Write model breakdown
            if usage_data['by_model']:
                writer.writerow([])
                writer.writerow(['By Model', '', '', '', '', ''])
                writer.writerow([
                    'Model',
                    'Total Tokens',
                    'Input Tokens',
                    'Output Tokens',
                    'Estimated Cost (USD)',
                    'Requests Count',
                ])
                
                for model, model_data in sorted(usage_data['by_model'].items()):
                    writer.writerow([
                        model,
                        model_data['total_tokens'],
                        model_data['input_tokens'],
                        model_data['output_tokens'],
                        f"{model_data['estimated_cost']:.6f}",
                        model_data['requests_count'],
                    ])
            
            # Return CSV response
            csv_content = output.getvalue()
            output.close()
            
            filename = f"token_usage_{current_user.id}_{start_dt.date()}_{end_dt.date()}.csv"
            
            return Response(
                content=csv_content,
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}",
                },
            )
        
        else:
            # Return JSON response
            from app.schemas.chat import TokenUsageResponse
            
            return TokenUsageResponse(
                user_id=usage_data['user_id'],
                period_start=usage_data['period_start'],
                period_end=usage_data['period_end'],
                total_tokens=usage_data['total_tokens'],
                input_tokens=usage_data['input_tokens'],
                output_tokens=usage_data['output_tokens'],
                estimated_cost=usage_data['estimated_cost'],
                requests_count=usage_data['requests_count'],
            )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to get token usage for user {current_user.id}: {e}", exc_info=True)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve token usage report. Please try again.",
        )
