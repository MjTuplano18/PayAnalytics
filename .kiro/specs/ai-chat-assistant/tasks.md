# Implementation Plan: AI Chat Assistant

## Overview

This implementation plan breaks down the AI Chat Assistant feature into discrete, manageable tasks. The feature enables users to query payment analytics data using natural language through a conversational interface. The implementation follows a layered architecture with Python/FastAPI backend services, TypeScript/Next.js frontend components, and integration with OpenAI/Anthropic AI services.

The plan progresses from foundational infrastructure (database models, core services) through security components, AI integration, and finally frontend implementation. Each task builds incrementally on previous work, with checkpoints to ensure stability before proceeding.

## Tasks

- [x] 1. Set up database schema and models for AI chat feature
  - [x] 1.1 Create Alembic migration for chat-related tables
    - Create migration file for `conversations`, `chat_messages`, `ai_audit_logs`, and `token_usage` tables
    - Include all indexes, foreign keys, and constraints as specified in design
    - Add check constraint for `chat_messages.role` to enforce 'user' or 'assistant' values
    - _Requirements: 7.1, 7.2, 7.4, 9.1, 9.2, 9.6, 15.6_
  
  - [x] 1.2 Create SQLAlchemy models for chat entities
    - Implement `Conversation` model in `backend/app/models/conversation.py`
    - Implement `ChatMessage` model in `backend/app/models/chat_message.py`
    - Implement `AIAuditLog` model in `backend/app/models/ai_audit_log.py`
    - Implement `TokenUsage` model in `backend/app/models/token_usage.py`
    - Add relationships between models (conversation -> messages, user -> conversations)
    - _Requirements: 7.1, 7.2, 7.4, 9.6, 15.6_
  
  - [x] 1.3 Create Pydantic schemas for API requests and responses
    - Create `backend/app/schemas/chat.py` with all request/response schemas
    - Implement `ChatQueryRequest`, `ChatQueryResponse`, `Message`, `Conversation`, `ChartMetadata`
    - Implement `ConversationListResponse`, `ConversationHistoryResponse`, `TokenUsageResponse`, `ErrorResponse`
    - Add field validation (query length 1-1000 chars, role enum validation)
    - _Requirements: 1.1, 10.1, 11.1, 15.4_

- [x] 2. Implement core AI integration services
  - [x] 2.1 Create abstract AI API client interface
    - Create `backend/app/services/ai/base_client.py` with `AIAPIClient` abstract base class
    - Define abstract methods: `generate_response()` and `generate_streaming_response()`
    - Define `AIResponse` dataclass for structured responses
    - _Requirements: 2.1, 2.4, 2.7_
  
  - [x] 2.2 Implement OpenAI client
    - Create `backend/app/services/ai/openai_client.py` implementing `AIAPIClient`
    - Load API key from environment variable `OPENAI_API_KEY`
    - Implement retry logic with exponential backoff (1s, 2s)
    - Set timeout to 30 seconds, max_tokens to 2000
    - Implement both standard and streaming response methods
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.7_
  
  - [x] 2.3 Implement Anthropic client
    - Create `backend/app/services/ai/anthropic_client.py` implementing `AIAPIClient`
    - Load API key from environment variable `ANTHROPIC_API_KEY`
    - Implement retry logic with exponential backoff (1s, 2s)
    - Set timeout to 30 seconds, max_tokens to 2000
    - Implement both standard and streaming response methods
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.7_
  
  - [x] 2.4 Create AI client factory and configuration
    - Create `backend/app/services/ai/factory.py` to instantiate correct client based on config
    - Add configuration in `backend/app/core/config.py` for AI provider selection
    - Add environment variables: `AI_PROVIDER` (openai/anthropic), `AI_MAX_TOKENS`, `AI_TEMPERATURE`
    - _Requirements: 2.1, 2.2_

- [x] 3. Implement security guard service
  - [x] 3.1 Create input validation and prompt injection detection
    - Create `backend/app/services/security_guard.py` with `SecurityGuard` class
    - Implement `validate_input()` method with prompt injection pattern matching
    - Define list of 50+ prompt injection patterns (e.g., "ignore previous instructions", "you are now", "system:")
    - Validate query length (1-1000 characters)
    - Return `ValidationResult` with pass/fail and error message
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 1.1_
  
  - [x] 3.2 Implement SQL validation
    - Implement `validate_sql()` method in `SecurityGuard`
    - Check SQL only contains SELECT statements (no INSERT, UPDATE, DELETE, DROP, ALTER)
    - Validate LIMIT clause exists and is <= 1000
    - Check for unauthorized table access
    - Detect SQL injection patterns
    - _Requirements: 1.7, 13.2, 13.6, 3.6_
  
  - [x] 3.3 Implement output sanitization
    - Implement `sanitize_output()` method in `SecurityGuard`
    - Remove `<script>` tags and other executable code
    - Escape HTML entities
    - Validate URLs are HTTPS only
    - Remove SQL commands from text
    - Limit response length to 5000 characters
    - Log sanitization events
    - _Requirements: 3.7, 3.8, 20.1, 20.2, 20.4, 20.7_
  
  - [x] 3.4 Implement topic filtering
    - Implement `check_topic()` method in `SecurityGuard`
    - Define allowed topics: payment data, bank performance, collection trends, touchpoint analysis, upload history
    - Define blocked topics: credentials, system config, other users' data, personal advice, general knowledge
    - Use AI to classify query topics when pattern matching is insufficient
    - _Requirements: 3.4, 19.1, 19.2, 19.3, 19.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement rate limiting and caching services
  - [x] 5.1 Set up Redis connection and configuration
    - Add Redis configuration to `backend/app/core/config.py`
    - Add environment variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
    - Create Redis client initialization in `backend/app/core/cache.py` (extend existing)
    - Add Redis dependency injection for services
    - _Requirements: 5.1, 8.1_
  
  - [x] 5.2 Implement rate limiter service
    - Create `backend/app/services/rate_limiter.py` with `RateLimiter` class
    - Implement `check_request_limit()` for 20 requests/minute per user
    - Implement `check_token_limit()` for 50,000 tokens/day per user
    - Use Redis sliding window for request counting
    - Implement `increment_request_count()` and `record_token_usage()`
    - Return 429 status with Retry-After header when limits exceeded
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 5.3 Implement cache manager service
    - Create `backend/app/services/cache_manager.py` with `CacheManager` class
    - Implement `normalize_query()` to lowercase and remove extra whitespace
    - Implement `get_cached_response()` with hash-based cache key
    - Implement `cache_response()` with 24-hour TTL
    - Support up to 1000 cached entries per user with LRU eviction
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 6. Implement conversation and audit services
  - [x] 6.1 Create conversation manager service
    - Create `backend/app/services/conversation_manager.py` with `ConversationManager` class
    - Implement `create_conversation()` to create new conversation with auto-generated title
    - Implement `add_message()` to store user and assistant messages
    - Implement `get_conversation_context()` to retrieve last 10 messages
    - Implement FIFO eviction when conversation exceeds 50 messages
    - Implement `list_user_conversations()` and `delete_conversation()`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 16.1, 16.4_
  
  - [x] 6.2 Create audit logger service
    - Create `backend/app/services/audit_logger.py` with `AuditLogger` class
    - Implement `log_query()` to record successful interactions
    - Implement `log_error()` to record errors with stack traces
    - Implement `log_security_violation()` for prompt injection and topic filtering
    - Store logs in `ai_audit_logs` table with 90-day retention
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  
  - [x] 6.3 Create token manager service
    - Create `backend/app/services/token_manager.py` with `TokenManager` class
    - Implement `record_usage()` to track input/output tokens per request
    - Implement `calculate_cost()` with current pricing for GPT-4 and Claude
    - Implement `get_user_usage()` for usage reports by date range
    - Aggregate token usage by user, day, and month
    - Send alert when user exceeds 80% of daily token budget
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 6.6_

- [x] 7. Implement SQL generation and query processing
  - [x] 7.1 Create system prompt configuration
    - Create `backend/app/config/system_prompt.yaml` with AI system prompt
    - Include payment analytics domain definition and role description
    - Include complete database schema with table and column descriptions
    - Include example queries and expected responses
    - Include guardrails against prompt injection
    - Include instructions to refuse non-payment-analytics questions
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  
  - [x] 7.2 Implement system prompt loader
    - Create `backend/app/services/system_prompt_loader.py`
    - Load system prompt from YAML file on service initialization
    - Support hot-reloading when file changes (watch file for updates)
    - Validate prompt contains required sections (schema, examples, guardrails)
    - _Requirements: 14.7, 14.8_
  
  - [x] 7.3 Create SQL generator service
    - Create `backend/app/services/sql_generator.py` with `SQLGenerator` class
    - Implement `generate_sql()` to convert natural language to SQL using AI
    - Include database schema in AI context from system prompt
    - Support filters: bank, touchpoint, date range, month, environment, payment amount
    - Support aggregation functions: SUM, AVG, COUNT, MAX, MIN
    - Support GROUP BY and ORDER BY clauses
    - Automatically add LIMIT 1000 to all queries
    - Implement `validate_sql()` to check syntax before execution
    - _Requirements: 1.2, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
  
  - [x] 7.4 Create response formatter service
    - Create `backend/app/services/response_formatter.py` with `ResponseFormatter` class
    - Implement `format_response()` to structure AI responses with chart metadata
    - Implement `determine_chart_type()` to detect visualization opportunities
    - Support bar charts for top-N queries, line charts for time-series, pie charts for distributions
    - Implement `format_streaming_chunk()` for real-time response formatting
    - _Requirements: 1.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 2.8_
  
  - [x] 7.5 Create query processor service (orchestrator)
    - Create `backend/app/services/query_processor.py` with `QueryProcessor` class
    - Implement `process_query()` to orchestrate the complete query pipeline
    - Coordinate: security validation → cache check → conversation context → AI call → SQL generation → SQL validation → DB execution → response formatting → output sanitization → caching → audit logging
    - Implement error handling with user-friendly messages
    - Implement `process_streaming_query()` for SSE responses
    - Handle retry logic for SQL generation failures (1 retry with error feedback)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.6, 12.1_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement FastAPI endpoints for chat
  - [x] 9.1 Create chat router with authentication
    - Create `backend/app/api/v1/routers/chat.py`
    - Apply JWT authentication middleware to all endpoints
    - Extract user_id from JWT token for authorization
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 9.2 Implement POST /api/v1/chat/query endpoint
    - Accept `ChatQueryRequest` with query text and optional conversation_id
    - Apply rate limiting (check request and token limits)
    - Call `QueryProcessor.process_query()`
    - Return `ChatQueryResponse` with message content, chart metadata, tokens used
    - Handle errors and return appropriate HTTP status codes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2_
  
  - [x] 9.3 Implement GET /api/v1/chat/stream endpoint (SSE)
    - Accept query parameters: query text and optional conversation_id
    - Apply rate limiting
    - Establish Server-Sent Events connection
    - Call `QueryProcessor.process_streaming_query()`
    - Stream response chunks as they arrive from AI
    - Support client-initiated cancellation
    - _Requirements: 2.7, 2.8, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_
  
  - [x] 9.4 Implement conversation management endpoints
    - POST `/api/v1/chat/conversations` - Create new conversation
    - GET `/api/v1/chat/conversations` - List user's conversations (last 10)
    - GET `/api/v1/chat/conversations/{id}/history` - Get conversation messages
    - DELETE `/api/v1/chat/conversations/{id}` - Delete conversation
    - _Requirements: 7.5, 7.6, 7.7_
  
  - [x] 9.5 Implement quick actions endpoint
    - GET `/api/v1/chat/quick-actions` - Return list of quick action templates
    - POST `/api/v1/chat/quick-actions/{id}` - Execute quick action by template ID
    - Define 10 default quick action templates
    - _Requirements: 17.1, 17.2, 17.3_
  
  - [x] 9.6 Implement token usage reporting endpoint
    - GET `/api/v1/chat/token-usage` - Get user's token usage report
    - Accept query parameters: start_date, end_date
    - Return `TokenUsageResponse` with aggregated usage and estimated cost
    - Support CSV export via Accept header
    - _Requirements: 15.4, 15.7_

- [ ] 10. Implement frontend chat interface components
  - [x] 10.1 Create ChatInterface main component
    - Create `frontend/src/components/chat/ChatInterface.tsx`
    - Implement collapsible sidebar with toggle button
    - Manage component state: conversations, messages, loading, error, streaming
    - Implement `sendQuery()` method to POST to `/api/v1/chat/query`
    - Implement `loadConversations()` to fetch conversation list
    - Implement `switchConversation()` and `deleteConversation()`
    - Add JWT token to all API requests from auth context
    - _Requirements: 10.1, 10.2, 7.6_
  
  - [x] 10.2 Create MessageList component
    - Create `frontend/src/components/chat/MessageList.tsx`
    - Display messages with user messages right-aligned, AI messages left-aligned
    - Implement auto-scroll to latest message
    - Render markdown in AI responses using markdown library
    - Add syntax highlighting for code blocks
    - Display timestamps for each message
    - Add copy-to-clipboard button for AI responses
    - _Requirements: 10.3, 10.9, 10.10_
  
  - [x] 10.3 Create ChartRenderer component
    - Create `frontend/src/components/chat/ChartRenderer.tsx`
    - Use Recharts library (already in package.json) for visualizations
    - Implement bar chart rendering for top-N data
    - Implement line chart rendering for time-series data
    - Implement pie chart rendering for distribution data
    - Display chart alongside text response
    - Handle malformed chart metadata gracefully (fallback to text only)
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.7_
  
  - [x] 10.4 Create QuickActions component
    - Create `frontend/src/components/chat/QuickActions.tsx`
    - Display quick action buttons in horizontal scrollable row
    - Fetch templates from `/api/v1/chat/quick-actions`
    - Populate input field when quick action clicked
    - Auto-submit query for quick actions
    - _Requirements: 17.1, 17.2, 17.3, 17.5, 10.6, 10.7_
  
  - [x] 10.5 Implement streaming response handling
    - Add EventSource connection to `/api/v1/chat/stream` in ChatInterface
    - Append chunks to displayed message in real-time
    - Show loading indicator with animated dots during streaming
    - Add "stop generation" button to cancel streaming
    - Handle streaming interruptions gracefully (display partial content)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 10.4, 10.5_
  
  - [x] 10.6 Implement error handling and user feedback
    - Display error messages in red with clear explanations
    - Show retry-after time for rate limit errors (429 status)
    - Redirect to login page on authentication failures (401 status)
    - Show clarifying questions when AI response requests more info
    - Display timeout messages with suggestions to narrow query
    - Never expose internal error details (stack traces, SQL errors)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 10.8_

- [x] 11. Integrate chat interface into dashboard
  - [x] 11.1 Add chat toggle button to dashboard layout
    - Update `frontend/src/app/dashboard/layout.tsx` or main layout
    - Add floating chat icon button (bottom-right corner)
    - Toggle ChatInterface visibility on click
    - Persist chat open/closed state in localStorage
    - _Requirements: 10.1, 10.2_
  
  - [x] 11.2 Add chat route to Next.js app
    - Create API route handlers in `frontend/src/app/api/chat/` for proxying to backend
    - Or configure direct backend API calls with CORS
    - Ensure JWT token is included in all requests
    - _Requirements: 4.1, 4.4_
  
  - [x] 11.3 Style chat interface to match dashboard theme
    - Apply existing Tailwind theme and design system
    - Ensure responsive design for mobile and tablet
    - Match color scheme, typography, and spacing
    - Add smooth animations for expand/collapse
    - _Requirements: 10.1, 10.2_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Add background tasks and maintenance
  - [ ] 13.1 Create audit log cleanup task
    - Create `backend/app/tasks/cleanup_audit_logs.py`
    - Implement scheduled task to delete audit logs older than 90 days
    - Run daily via cron or APScheduler
    - _Requirements: 9.7_
  
  - [ ] 13.2 Create token usage alert task
    - Create `backend/app/tasks/token_usage_alerts.py`
    - Check users approaching 80% of daily token budget
    - Send alert notifications (log or email)
    - Run every hour
    - _Requirements: 15.5_
  
  - [ ] 13.3 Add system prompt hot-reload watcher
    - Implement file watcher for `system_prompt.yaml`
    - Reload prompt in SystemPromptLoader when file changes
    - Log reload events
    - _Requirements: 14.8_

- [ ] 14. Add dependencies and environment configuration
  - [ ] 14.1 Update backend requirements.txt
    - Add `openai` for OpenAI API client
    - Add `anthropic` for Anthropic API client
    - Add `redis` for Redis client
    - Add `pyyaml` for system prompt configuration
    - Add `sqlparse` for SQL validation
    - Add `hypothesis` for property-based testing (if needed later)
    - _Requirements: 2.1, 5.1, 14.7_
  
  - [ ] 14.2 Update frontend package.json
    - Add `eventsource` or use native EventSource for SSE
    - Add `react-markdown` for markdown rendering
    - Add `react-syntax-highlighter` for code block highlighting
    - Recharts already installed for charts
    - _Requirements: 18.1, 10.3_
  
  - [ ] 14.3 Update environment variables documentation
    - Document all new environment variables in README or .env.example
    - Backend: `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_MAX_TOKENS`, `AI_TEMPERATURE`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
    - Document rate limits and token limits as configurable
    - _Requirements: 2.2, 5.1_

- [ ] 15. Final integration and testing
  - [ ] 15.1 Test complete query flow end-to-end
    - Submit test queries through frontend
    - Verify SQL generation, execution, and response formatting
    - Test with various query types (aggregations, filters, time-series)
    - Verify chart rendering for appropriate queries
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 11.1, 11.2, 11.3, 11.4_
  
  - [ ] 15.2 Test security features
    - Attempt prompt injection attacks and verify rejection
    - Attempt SQL injection and verify prevention
    - Test topic filtering with off-topic queries
    - Verify output sanitization removes malicious content
    - Test authentication and authorization
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 19.1, 19.2, 19.3, 20.1, 20.2_
  
  - [ ] 15.3 Test rate limiting and caching
    - Exceed request rate limit and verify 429 response
    - Exceed token limit and verify blocking
    - Submit identical queries and verify cache hits
    - Verify cache expiration after 24 hours
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3_
  
  - [ ] 15.4 Test conversation management
    - Create multiple conversations and switch between them
    - Verify conversation context is maintained (follow-up questions work)
    - Test conversation deletion
    - Verify FIFO eviction when conversation exceeds 50 messages
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 16.1, 16.2, 16.3, 16.4, 16.5_
  
  - [ ] 15.5 Test streaming responses
    - Enable streaming and verify real-time chunk display
    - Test "stop generation" button
    - Verify streaming works with both OpenAI and Anthropic
    - Test streaming interruption handling
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_
  
  - [ ] 15.6 Test error handling and edge cases
    - Test with invalid JWT tokens
    - Test with malformed queries
    - Test with database connection failures
    - Test with AI API failures and timeouts
    - Verify user-friendly error messages
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  
  - [ ] 15.7 Verify audit logging and token tracking
    - Check audit logs contain all required fields
    - Verify token usage is accurately tracked
    - Test token usage report endpoint
    - Verify audit log cleanup task works
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 15.1, 15.2, 15.3, 15.4, 15.6_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- This implementation plan focuses exclusively on coding tasks that can be performed by a development agent
- Each task references specific requirements from the requirements document for traceability
- The plan follows a bottom-up approach: infrastructure → services → API → frontend → integration
- Checkpoints are placed at logical breaks to ensure stability before proceeding
- The design document specifies Python for backend and TypeScript for frontend, so all code examples and implementations should use these languages
- Property-based testing tasks are not included as the design document's Correctness Properties section is incomplete
- Testing tasks (15.1-15.7) focus on integration testing and manual verification rather than automated unit tests
- The existing project already has FastAPI, Next.js, PostgreSQL, and authentication infrastructure in place
- Redis needs to be added for caching and rate limiting
- OpenAI and Anthropic client libraries need to be added as dependencies
