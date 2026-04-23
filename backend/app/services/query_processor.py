"""Query Processor Service for AI Chat Assistant.

This service orchestrates the complete query processing pipeline,
coordinating security validation, caching, AI calls, SQL generation,
database execution, response formatting, and audit logging.
"""

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.services.ai.base_client import AIAPIClient
from app.services.audit_logger import AuditLogger
from app.services.cache_manager import CacheManager
from app.services.conversation_manager import ConversationManager
from app.services.response_formatter import FormattedResponse, ResponseFormatter
from app.services.security_guard import SecurityGuard
from app.services.sql_generator import SQLGenerator
from app.services.token_manager import TokenManager

logger = get_logger(__name__)


@dataclass
class QueryResponse:
    """Response from query processing."""
    
    message_id: str
    conversation_id: str
    role: str = "assistant"
    content: str = ""
    chart_metadata: dict | None = None
    tokens_used: int = 0
    processing_time_ms: int = 0
    cached: bool = False
    sql_query: str | None = None


class QueryProcessor:
    """Orchestrates the complete query processing pipeline.
    
    Responsibilities:
    - Coordinate security validation → cache check → conversation context
    - Orchestrate AI call → SQL generation → SQL validation → DB execution
    - Handle response formatting → output sanitization → caching → audit logging
    - Implement error handling with user-friendly messages
    - Support streaming responses for SSE
    - Handle retry logic for SQL generation failures (1 retry with error feedback)
    """

    MAX_SQL_RETRIES = 1

    def __init__(
        self,
        sql_generator: SQLGenerator,
        response_formatter: ResponseFormatter,
        conversation_manager: ConversationManager,
        security_guard: SecurityGuard,
        cache_manager: CacheManager,
        audit_logger: AuditLogger,
        token_manager: TokenManager,
        db_session: AsyncSession,
    ):
        """Initialize the query processor.
        
        Args:
            sql_generator: SQL generator service
            response_formatter: Response formatter service
            conversation_manager: Conversation manager service
            security_guard: Security guard service
            cache_manager: Cache manager service
            audit_logger: Audit logger service
            token_manager: Token manager service
            db_session: Database session for query execution
        """
        self.sql_generator = sql_generator
        self.response_formatter = response_formatter
        self.conversation_manager = conversation_manager
        self.security_guard = security_guard
        self.cache_manager = cache_manager
        self.audit_logger = audit_logger
        self.token_manager = token_manager
        self.db = db_session
        
        logger.info("QueryProcessor initialized")

    async def process_query(
        self,
        user_id: str,
        query: str,
        conversation_id: str | None = None,
    ) -> QueryResponse:
        """Process a natural language query and return formatted response.
        
        Pipeline:
        1. Security validation (input validation, topic filtering)
        2. Cache check (return cached response if available)
        3. Conversation context retrieval
        4. AI call for SQL generation
        5. SQL validation
        6. Database execution
        7. Response formatting (with chart metadata)
        8. Output sanitization
        9. Cache storage
        10. Audit logging
        
        Args:
            user_id: ID of the user submitting the query
            query: Natural language query
            conversation_id: Optional conversation ID (creates new if None)
            
        Returns:
            QueryResponse with formatted response and metadata
            
        Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.6, 12.1
        """
        start_time = time.time()
        
        try:
            # Step 1: Security validation
            logger.info(f"Processing query for user {user_id}: {query[:100]}...")
            
            # Validate input
            input_validation = self.security_guard.validate_input(query)
            if not input_validation.is_valid:
                logger.warning(f"Input validation failed: {input_validation.error_message}")
                await self.audit_logger.log_security_violation(
                    user_id=user_id,
                    query=query,
                    violation_type="input_validation",
                    details=input_validation.details or {},
                )
                
                return QueryResponse(
                    message_id=str(uuid.uuid4()),
                    conversation_id=conversation_id or "",
                    content=input_validation.error_message or "Invalid input",
                    processing_time_ms=int((time.time() - start_time) * 1000),
                )
            
            # Check topic filtering — pass whether we already have conversation context
            # so that short follow-up queries ("How about January?") are allowed through.
            topic_validation = await self.security_guard.check_topic_async(
                query,
                has_conversation_context=bool(conversation_id),
            )
            if not topic_validation.is_valid:
                logger.warning(f"Topic validation failed: {topic_validation.error_message}")
                await self.audit_logger.log_security_violation(
                    user_id=user_id,
                    query=query,
                    violation_type="topic_filter",
                    details=topic_validation.details or {},
                )
                
                return QueryResponse(
                    message_id=str(uuid.uuid4()),
                    conversation_id=conversation_id or "",
                    content=topic_validation.error_message or "Topic not allowed",
                    processing_time_ms=int((time.time() - start_time) * 1000),
                )
            
            # Step 2: Cache check
            cached_response = self.cache_manager.get_cached_response(query, user_id)
            if cached_response:
                logger.info("Cache hit - returning cached response")
                
                # Create or get conversation
                if not conversation_id:
                    conversation = await self.conversation_manager.create_conversation(user_id)
                    conversation_id = conversation.id
                
                # Store user message
                await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="user",
                    content=query,
                )
                
                # Store assistant message
                message = await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=cached_response.response,
                    metadata={"chart_metadata": cached_response.chart_metadata} if cached_response.chart_metadata else None,
                )
                
                return QueryResponse(
                    message_id=message.id,
                    conversation_id=conversation_id,
                    content=cached_response.response,
                    chart_metadata=cached_response.chart_metadata,
                    processing_time_ms=int((time.time() - start_time) * 1000),
                    cached=True,
                )
            
            # Step 3: Create or get conversation
            if not conversation_id:
                conversation = await self.conversation_manager.create_conversation(user_id)
                conversation_id = conversation.id
            
            # Store user message
            await self.conversation_manager.add_message(
                conversation_id=conversation_id,
                role="user",
                content=query,
            )
            
            # Get conversation context
            context_messages = await self.conversation_manager.get_conversation_context(
                conversation_id=conversation_id,
                limit=10,
            )
            
            # Convert to AI message format
            conversation_context = [
                {"role": msg.role, "content": msg.content}
                for msg in context_messages
            ]
            
            # Fetch actual data availability context so the AI knows what months exist
            data_context = await self._get_data_context()
            
            # Step 4: Generate SQL with retry logic
            sql_result = await self._generate_sql_with_retry(query, conversation_context, data_context)
            
            if not sql_result.success:
                error_message = sql_result.error_message or "Failed to generate SQL query"
                
                await self.audit_logger.log_error(
                    user_id=user_id,
                    query=query,
                    error_type="sql_generation_failed",
                    error_message=error_message,
                    conversation_id=conversation_id,
                )
                
                # Store error message
                message = await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=error_message,
                )
                
                return QueryResponse(
                    message_id=message.id,
                    conversation_id=conversation_id,
                    content=error_message,
                    processing_time_ms=int((time.time() - start_time) * 1000),
                )
            
            sql_query = sql_result.sql_query
            
            # Step 5: Execute SQL query
            try:
                query_results = await self._execute_sql(sql_query)
            except Exception as e:
                logger.error(f"SQL execution failed: {e}", exc_info=True)
                
                error_message = "I encountered an error while querying the database. Please try rephrasing your question."
                
                await self.audit_logger.log_error(
                    user_id=user_id,
                    query=query,
                    error_type="sql_execution_failed",
                    error_message=str(e),
                    conversation_id=conversation_id,
                    metadata={"sql_query": sql_query},
                )
                
                message = await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=error_message,
                )
                
                return QueryResponse(
                    message_id=message.id,
                    conversation_id=conversation_id,
                    content=error_message,
                    processing_time_ms=int((time.time() - start_time) * 1000),
                )
            
            # Step 6: Format response with AI
            ai_response_text = await self._generate_ai_response(
                query=query,
                sql_query=sql_query,
                query_results=query_results,
                conversation_context=conversation_context,
            )
            
            # Step 7: Format response with chart metadata
            formatted_response = await self.response_formatter.format_response(
                ai_response=ai_response_text,
                query_results=query_results,
                user_query=query,
            )
            
            # Step 8: Sanitize output
            sanitized_content = self.security_guard.sanitize_output(formatted_response.content)
            
            # Step 9: Cache response
            chart_metadata_dict = None
            if formatted_response.chart_metadata:
                chart_metadata_dict = {
                    "type": formatted_response.chart_metadata.type,
                    "data": formatted_response.chart_metadata.data,
                    "labels": formatted_response.chart_metadata.labels,
                    "title": formatted_response.chart_metadata.title,
                    "x_axis_label": formatted_response.chart_metadata.x_axis_label,
                    "y_axis_label": formatted_response.chart_metadata.y_axis_label,
                }
            
            self.cache_manager.cache_response(
                query=query,
                user_id=user_id,
                response=sanitized_content,
                chart_metadata=chart_metadata_dict,
            )
            
            # Step 10: Store assistant message
            message = await self.conversation_manager.add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=sanitized_content,
                metadata={
                    "sql_query": sql_query,
                    "chart_metadata": chart_metadata_dict,
                },
                tokens_used=0,  # Will be updated by token manager
            )
            
            # Step 11: Audit logging
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            await self.audit_logger.log_query(
                user_id=user_id,
                conversation_id=conversation_id,
                query=query,
                response=sanitized_content,
                tokens_used=0,  # Will be tracked separately by token manager
                processing_time_ms=processing_time_ms,
                metadata={
                    "sql_query": sql_query,
                    "result_count": len(query_results),
                },
            )
            
            return QueryResponse(
                message_id=message.id,
                conversation_id=conversation_id,
                content=sanitized_content,
                chart_metadata=chart_metadata_dict,
                processing_time_ms=processing_time_ms,
                sql_query=sql_query,
            )
            
        except Exception as e:
            logger.error(f"Query processing failed: {e}", exc_info=True)
            
            error_message = "I encountered an unexpected error while processing your request. Please try rephrasing your question or try again in a moment."
            
            try:
                await self.audit_logger.log_error(
                    user_id=user_id,
                    query=query,
                    error_type="query_processing_failed",
                    error_message=str(e),
                    stack_trace=self.audit_logger.capture_exception(),
                    conversation_id=conversation_id,
                )
            except Exception as audit_error:
                logger.error(f"Failed to log error: {audit_error}")
            
            return QueryResponse(
                message_id=str(uuid.uuid4()),
                conversation_id=conversation_id or "",
                content=error_message,
                processing_time_ms=int((time.time() - start_time) * 1000),
            )

    async def process_streaming_query(
        self,
        user_id: str,
        query: str,
        conversation_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Process query with streaming response.
        
        Similar to process_query but yields response chunks as they arrive from AI.
        
        Pipeline:
        1. Security validation (input validation, topic filtering)
        2. Cache check (return cached response if available)
        3. Conversation context retrieval
        4. SQL generation (non-streaming)
        5. SQL validation and execution
        6. Stream AI response formatting
        7. Output sanitization per chunk
        8. Cache storage (after complete)
        9. Audit logging (after complete)
        
        Args:
            user_id: ID of the user submitting the query
            query: Natural language query
            conversation_id: Optional conversation ID
            
        Yields:
            Response chunks as they arrive from AI
            
        Requirements: 1.8, 2.8, 18.1, 18.2, 18.3, 18.4
        """
        start_time = time.time()
        accumulated_response = ""
        
        try:
            # Step 1: Security validation
            logger.info(f"Processing streaming query for user {user_id}: {query[:100]}...")
            
            # Validate input
            input_validation = self.security_guard.validate_input(query)
            if not input_validation.is_valid:
                logger.warning(f"Input validation failed: {input_validation.error_message}")
                await self.audit_logger.log_security_violation(
                    user_id=user_id,
                    query=query,
                    violation_type="input_validation",
                    details=input_validation.details or {},
                )
                
                error_msg = input_validation.error_message or "Invalid input"
                yield error_msg
                return
            
            # Check topic filtering — pass whether we already have conversation context
            # so that short follow-up queries ("How about January?") are allowed through.
            topic_validation = await self.security_guard.check_topic_async(
                query,
                has_conversation_context=bool(conversation_id),
            )
            if not topic_validation.is_valid:
                logger.warning(f"Topic validation failed: {topic_validation.error_message}")
                await self.audit_logger.log_security_violation(
                    user_id=user_id,
                    query=query,
                    violation_type="topic_filter",
                    details=topic_validation.details or {},
                )
                
                error_msg = topic_validation.error_message or "Topic not allowed"
                yield error_msg
                return
            
            # Step 2: Cache check
            cached_response = self.cache_manager.get_cached_response(query, user_id)
            if cached_response:
                logger.info("Cache hit - returning cached response via streaming")
                
                # Create or get conversation
                if not conversation_id:
                    conversation = await self.conversation_manager.create_conversation(user_id)
                    conversation_id = conversation.id
                
                # Yield conversation_id so frontend can persist it
                yield f"__CONV_ID__:{conversation_id}"
                
                # Store user message
                await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="user",
                    content=query,
                )
                
                # Store assistant message
                await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=cached_response.response,
                    metadata={"chart_metadata": cached_response.chart_metadata} if cached_response.chart_metadata else None,
                )
                
                # Stream the cached response in chunks
                chunk_size = 50  # Characters per chunk
                for i in range(0, len(cached_response.response), chunk_size):
                    yield cached_response.response[i:i + chunk_size]
                
                return
            
            # Step 3: Create or get conversation
            if not conversation_id:
                conversation = await self.conversation_manager.create_conversation(user_id)
                conversation_id = conversation.id
            
            # Yield conversation_id immediately so the frontend can persist it
            # before any content chunks arrive. The SSE router intercepts this.
            yield f"__CONV_ID__:{conversation_id}"
            
            # Store user message
            await self.conversation_manager.add_message(
                conversation_id=conversation_id,
                role="user",
                content=query,
            )
            
            # Get conversation context
            context_messages = await self.conversation_manager.get_conversation_context(
                conversation_id=conversation_id,
                limit=10,
            )
            
            # Convert to AI message format
            conversation_context = [
                {"role": msg.role, "content": msg.content}
                for msg in context_messages
            ]
            
            # Fetch actual data availability context so the AI knows what months exist
            data_context = await self._get_data_context()
            
            # Step 4: Generate SQL (non-streaming)
            sql_result = await self._generate_sql_with_retry(query, conversation_context, data_context)
            
            if not sql_result.success:
                error_message = sql_result.error_message or "Failed to generate SQL query"
                
                await self.audit_logger.log_error(
                    user_id=user_id,
                    query=query,
                    error_type="sql_generation_failed",
                    error_message=error_message,
                    conversation_id=conversation_id,
                )
                
                # Store error message
                await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=error_message,
                )
                
                yield error_message
                return
            
            sql_query = sql_result.sql_query
            
            # Step 5: Execute SQL query
            try:
                query_results = await self._execute_sql(sql_query)
            except Exception as e:
                logger.error(f"SQL execution failed: {e}", exc_info=True)
                
                error_message = "I encountered an error while querying the database. Please try rephrasing your question."
                
                await self.audit_logger.log_error(
                    user_id=user_id,
                    query=query,
                    error_type="sql_execution_failed",
                    error_message=str(e),
                    conversation_id=conversation_id,
                    metadata={"sql_query": sql_query},
                )
                
                await self.conversation_manager.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=error_message,
                )
                
                yield error_message
                return
            
            # Step 6: Stream AI response
            results_summary = self._summarize_results(query_results)
            
            prompt = f"""Q: {query}
Results ({len(query_results)} rows):
{results_summary}

Summarize these results. Use ₱ for currency. Numbered list for rankings. Bold key figures."""
            
            # Add to conversation context
            messages = conversation_context + [
                {"role": "user", "content": prompt}
            ]
            
            # Stream AI response
            try:
                async for chunk in self.sql_generator.ai_client.generate_streaming_response(
                    messages=messages,
                    max_tokens=1000,
                    temperature=0.7,
                ):
                    # Sanitize each chunk
                    sanitized_chunk = self.security_guard.sanitize_output(chunk)
                    accumulated_response += sanitized_chunk
                    
                    # Format and yield chunk
                    formatted_chunk = await self.response_formatter.format_streaming_chunk(sanitized_chunk)
                    yield formatted_chunk
                
            except Exception as e:
                logger.error(f"Streaming AI response failed: {e}", exc_info=True)
                
                error_message = "\n\n[Error: Failed to complete response generation]"
                yield error_message
                accumulated_response += error_message
            
            # Step 7: Store complete response
            # Determine chart metadata from complete response
            formatted_response = await self.response_formatter.format_response(
                ai_response=accumulated_response,
                query_results=query_results,
                user_query=query,
            )
            
            chart_metadata_dict = None
            if formatted_response.chart_metadata:
                chart_metadata_dict = {
                    "type": formatted_response.chart_metadata.type,
                    "data": formatted_response.chart_metadata.data,
                    "labels": formatted_response.chart_metadata.labels,
                    "title": formatted_response.chart_metadata.title,
                    "x_axis_label": formatted_response.chart_metadata.x_axis_label,
                    "y_axis_label": formatted_response.chart_metadata.y_axis_label,
                }
            
            # Store assistant message
            await self.conversation_manager.add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=accumulated_response,
                metadata={
                    "sql_query": sql_query,
                    "chart_metadata": chart_metadata_dict,
                },
                tokens_used=0,
            )
            
            # Step 8: Cache response
            self.cache_manager.cache_response(
                query=query,
                user_id=user_id,
                response=accumulated_response,
                chart_metadata=chart_metadata_dict,
            )
            
            # Step 9: Audit logging
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            await self.audit_logger.log_query(
                user_id=user_id,
                conversation_id=conversation_id,
                query=query,
                response=accumulated_response,
                tokens_used=0,
                processing_time_ms=processing_time_ms,
                metadata={
                    "sql_query": sql_query,
                    "result_count": len(query_results),
                    "streaming": True,
                },
            )
            
        except Exception as e:
            logger.error(f"Streaming query processing failed: {e}", exc_info=True)
            
            error_message = "\n\nI encountered an unexpected error while processing your request. Please try rephrasing your question or try again in a moment."
            
            try:
                await self.audit_logger.log_error(
                    user_id=user_id,
                    query=query,
                    error_type="streaming_query_processing_failed",
                    error_message=str(e),
                    stack_trace=self.audit_logger.capture_exception(),
                    conversation_id=conversation_id,
                )
            except Exception as audit_error:
                logger.error(f"Failed to log error: {audit_error}")
            
            yield error_message

    async def _get_data_context(self) -> dict:
        """Discover the actual date range and available data in the database.
        
        This is injected into the AI prompt so it knows what data actually exists,
        preventing it from querying months/years that have no records.
        
        Returns:
            Dict with keys: min_month, max_month, available_months, total_records,
                            min_payment_date, max_payment_date
        """
        try:
            result = await self.db.execute(text(
                "SELECT COUNT(DISTINCT month) as month_count, COUNT(*) as total_records "
                "FROM payment_records WHERE month IS NOT NULL"
            ))
            row = result.fetchone()
            total_records = row[1] if row else 0

            if total_records == 0:
                return {}

            # Get distinct month values (actual format in DB)
            months_result = await self.db.execute(text(
                "SELECT DISTINCT month FROM payment_records "
                "WHERE month IS NOT NULL ORDER BY month"
            ))
            available_months = [r[0] for r in months_result.fetchall()]

            # Get payment_date range for year context
            dates_result = await self.db.execute(text(
                "SELECT MIN(payment_date), MAX(payment_date) "
                "FROM payment_records WHERE payment_date IS NOT NULL"
            ))
            dates_row = dates_result.fetchone()

            return {
                "available_months": available_months,
                "total_records": total_records,
                "min_payment_date": dates_row[0] if dates_row else None,
                "max_payment_date": dates_row[1] if dates_row else None,
            }
        except Exception as e:
            logger.warning(f"Could not fetch data context: {e}")

        return {}

    async def _generate_sql_with_retry(
        self,
        query: str,
        conversation_context: list[dict],
        data_context: dict | None = None,
    ) -> Any:
        """Generate SQL with retry logic.
        
        Retries once with error feedback if initial generation fails.
        Injects data_context (actual available date range) into the conversation
        so the AI doesn't query months/years that have no data.
        
        Args:
            query: User query
            conversation_context: Conversation context
            data_context: Optional dict with min_month, max_month, total_records
            
        Returns:
            SQLGenerationResult
        """
        # Build enriched context with data availability info
        enriched_context = list(conversation_context)
        if data_context and data_context.get("available_months"):
            months = data_context["available_months"]
            total = data_context.get("total_records", 0)
            min_date = data_context.get("min_payment_date", "unknown")
            max_date = data_context.get("max_payment_date", "unknown")
            months_list = ", ".join(months)
            # Extract year from payment_date for "this year" queries
            year_str = str(min_date)[:4] if min_date and min_date != "unknown" else "unknown"
            enriched_context = [
                {
                    "role": "system",
                    "content": (
                        f"CRITICAL DATA CONTEXT — READ CAREFULLY BEFORE GENERATING SQL:\n"
                        f"The payment_records table has {total:,} records.\n"
                        f"Available month values (month column): {months_list}\n"
                        f"payment_date range: {min_date} to {max_date}\n"
                        f"Data year: {year_str}\n\n"
                        f"MONTH COLUMN RULES:\n"
                        f"- month column = uppercase English names: 'JANUARY', 'FEBRUARY' — NEVER '2026-01'\n"
                        f"- Filter by month: WHERE month = 'JANUARY'\n"
                        f"- Filter multiple: WHERE month IN ('JANUARY', 'FEBRUARY')\n\n"
                        f"YEAR/DATE QUERIES:\n"
                        f"- 'this year' or 'for the year' = all available months: WHERE month IN ({', '.join(repr(m) for m in months)})\n"
                        f"- OR use payment_date: WHERE payment_date >= '{year_str}-01-01' AND payment_date <= '{year_str}-12-31'\n"
                        f"- NEVER use YEAR() function — it does NOT exist in PostgreSQL, will cause an error\n"
                        f"- NEVER use month LIKE '2026%' — month column has names like JANUARY, not dates\n"
                        f"- 'total amount for this year' = SUM(payment_amount) with no WHERE filter (all data IS from {year_str})\n\n"
                        f"AGGREGATION:\n"
                        f"- totals/rankings: SUM(payment_amount), not MAX\n"
                        f"- single largest transaction: ORDER BY payment_amount DESC LIMIT 1"
                    )
                }
            ] + enriched_context

        # First attempt
        sql_result = await self.sql_generator.generate_sql(
            user_query=query,
            conversation_context=enriched_context,
        )
        
        if sql_result.success:
            return sql_result
        
        # Retry with error feedback
        logger.info("SQL generation failed, retrying with error feedback...")
        
        # Add error feedback to context
        error_context = enriched_context + [
            {
                "role": "assistant",
                "content": f"I generated this SQL but it failed validation: {sql_result.sql_query}\nError: {sql_result.error_message}"
            },
            {
                "role": "user",
                "content": "Please generate a corrected SQL query that addresses the validation error."
            }
        ]
        
        sql_result = await self.sql_generator.generate_sql(
            user_query=query,
            conversation_context=error_context,
        )
        
        return sql_result

    async def _execute_sql(self, sql_query: str) -> list[dict]:
        """Execute SQL query against the database.
        
        Args:
            sql_query: SQL query to execute
            
        Returns:
            List of result rows as dictionaries
            
        Raises:
            Exception: If query execution fails
        """
        logger.info(f"Executing SQL: {sql_query[:200]}...")
        
        try:
            result = await self.db.execute(text(sql_query))
            rows = result.fetchall()
            
            # Convert rows to dictionaries
            if rows:
                columns = result.keys()
                results = [dict(zip(columns, row)) for row in rows]
            else:
                results = []
            
            logger.info(f"SQL execution successful, returned {len(results)} rows")
            
            return results
            
        except Exception as e:
            # Rollback so the transaction doesn't stay aborted for subsequent queries
            try:
                await self.db.rollback()
            except Exception:
                pass
            logger.error(f"SQL execution failed: {e}", exc_info=True)
            raise

    async def _generate_ai_response(
        self,
        query: str,
        sql_query: str,
        query_results: list[dict],
        conversation_context: list[dict],
    ) -> str:
        """Generate AI response based on query results.
        
        Args:
            query: Original user query
            sql_query: Executed SQL query
            query_results: Query results
            conversation_context: Conversation context
            
        Returns:
            AI-generated response text
        """
        # Build prompt for AI to format results
        results_summary = self._summarize_results(query_results)
        
        prompt = f"""Q: {query}
Results ({len(query_results)} rows):
{results_summary}

Summarize these results. Use ₱ for currency. Numbered list for rankings. Bold key figures."""
        
        # Add to conversation context
        messages = conversation_context + [
            {"role": "user", "content": prompt}
        ]
        
        # Call AI (using the SQL generator's AI client)
        try:
            ai_response = await self.sql_generator.ai_client.generate_response(
                messages=messages,
                max_tokens=1000,
                temperature=0.7,
            )
            
            return ai_response.content
            
        except Exception as e:
            logger.error(f"AI response generation failed: {e}", exc_info=True)
            
            # Fallback: return simple summary
            return self._generate_fallback_response(query_results)

    def _summarize_results(self, results: list[dict], max_rows: int = 50) -> str:
        """Summarize query results for AI context.
        
        For small result sets, sends all rows.
        For large result sets, sends the first max_rows rows plus aggregate stats
        so the AI has accurate totals rather than summing a partial list.
        """
        if not results:
            return "No results found."

        headers = list(results[0].keys())
        total_rows = len(results)

        # Identify numeric columns for aggregate stats
        numeric_cols = [
            col for col in headers
            if isinstance(results[0].get(col), (int, float)) and results[0].get(col) is not None
        ]

        # Build aggregate summary for numeric columns across ALL rows (not just the sample)
        agg_lines = []
        if numeric_cols and total_rows > max_rows:
            agg_lines.append(f"[Aggregate stats across ALL {total_rows:,} rows:]")
            for col in numeric_cols:
                values = [float(r[col]) for r in results if r.get(col) is not None]
                if values:
                    agg_lines.append(
                        f"  {col}: total={sum(values):,.2f}, avg={sum(values)/len(values):,.2f}, "
                        f"min={min(values):,.2f}, max={max(values):,.2f}, count={len(values):,}"
                    )

        # Format sample rows as table
        sample = results[:max_rows]
        lines = []
        lines.append(" | ".join(headers))
        lines.append("-" * 60)
        for row in sample:
            values = [str(v) if v is not None else "NULL" for v in row.values()]
            lines.append(" | ".join(values))

        if total_rows > max_rows:
            lines.append(f"[Showing {max_rows} of {total_rows:,} total rows]")

        if agg_lines:
            lines.extend(agg_lines)

        return "\n".join(lines)

    def _generate_fallback_response(self, results: list[dict]) -> str:
        """Generate a simple fallback response when AI fails.
        
        Args:
            results: Query results
            
        Returns:
            Simple formatted response
        """
        if not results:
            return "No results found for your query."
        
        count = len(results)
        
        if count == 1:
            return f"I found 1 result for your query."
        else:
            return f"I found {count} results for your query."
