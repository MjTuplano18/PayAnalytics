# SQL Generation and Query Processing Services

This document describes the SQL generation and query processing services implemented for the AI Chat Assistant feature.

## Overview

The SQL generation and query processing system converts natural language queries into SQL, executes them against the payment analytics database, and formats responses with optional visualizations. The system is designed with security, privacy, and user experience as top priorities.

## Components

### 1. System Prompt Configuration (`backend/app/config/system_prompt.yaml`)

**Purpose**: Defines the AI's behavior, role, and constraints for payment analytics queries.

**Key Sections**:
- **Role**: Defines the AI as a payment analytics assistant
- **Domain**: Specifies expertise in payment analytics
- **Database Schema**: Complete schema with table and column descriptions
- **Example Queries**: Sample queries with SQL and expected responses
- **Guardrails**: Security constraints and rules
  - Prompt injection protection
  - Topic filtering (payment analytics only)
  - SQL generation rules (SELECT only, LIMIT required)
  - Data privacy rules (no PII to external AI)
  - Response formatting guidelines
  - Error handling instructions
- **Conversation Context**: Rules for maintaining conversation flow
- **Visualization Hints**: Guidelines for chart type selection

**Requirements Satisfied**: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7

### 2. System Prompt Loader (`backend/app/services/system_prompt_loader.py`)

**Purpose**: Loads and manages the AI system prompt configuration with hot-reloading support.

**Key Features**:
- Load system prompt from YAML file on initialization
- Support hot-reloading when file changes (watch file for updates)
- Validate prompt contains required sections (schema, examples, guardrails)
- Provide formatted prompt text for AI API calls
- Singleton pattern for global access

**Key Methods**:
- `load_prompt()`: Load prompt from YAML file
- `reload_if_changed()`: Check for file changes and reload
- `get_prompt()`: Get formatted system prompt text
- `get_database_schema()`: Get database schema section
- `get_example_queries()`: Get example queries
- `get_guardrails()`: Get guardrails section

**Requirements Satisfied**: 14.7, 14.8

### 3. SQL Generator (`backend/app/services/sql_generator.py`)

**Purpose**: Converts natural language queries to SQL using AI with security validation.

**Key Features**:
- Convert natural language to SQL using AI with database schema context
- Support filters: bank, touchpoint, date range, month, environment, payment amount
- Support aggregation functions: SUM, AVG, COUNT, MAX, MIN
- Support GROUP BY and ORDER BY clauses
- Automatically add LIMIT 1000 to all queries
- Validate SQL syntax and security constraints before execution

**Key Methods**:
- `generate_sql(user_query, conversation_context)`: Generate SQL from natural language
- `validate_sql(sql)`: Validate generated SQL meets security constraints

**Security Validations**:
- Only SELECT statements allowed (no INSERT, UPDATE, DELETE, DROP, ALTER)
- LIMIT clause required (maximum 1000 rows)
- No unauthorized table access
- SQL injection pattern detection
- Parameterized queries only

**Requirements Satisfied**: 1.2, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8

### 4. Response Formatter (`backend/app/services/response_formatter.py`)

**Purpose**: Structures AI responses with chart metadata and determines appropriate visualizations.

**Key Features**:
- Structure AI responses with chart metadata
- Determine chart type based on query intent and data structure
- Support bar charts for top-N queries
- Support line charts for time-series data
- Support pie charts for distributions
- Format streaming chunks for real-time responses

**Chart Detection Logic**:
- **Bar Chart**: Top-N queries (e.g., "top 5 banks")
- **Line Chart**: Time-series queries (e.g., "trends over time")
- **Pie Chart**: Distribution queries (e.g., "breakdown by touchpoint")
- **No Chart**: Queries with >10 results or single values

**Key Methods**:
- `format_response(ai_response, query_results, user_query)`: Format response with chart metadata
- `determine_chart_type(query_results, user_query)`: Determine appropriate chart type
- `format_streaming_chunk(chunk)`: Format streaming response chunk

**Requirements Satisfied**: 1.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 2.8

### 5. Query Processor (`backend/app/services/query_processor.py`)

**Purpose**: Orchestrates the complete query processing pipeline.

**Key Features**:
- Coordinate security validation → cache check → conversation context
- Orchestrate AI call → SQL generation → SQL validation → DB execution
- Handle response formatting → output sanitization → caching → audit logging
- Implement error handling with user-friendly messages
- Support streaming responses for SSE
- Handle retry logic for SQL generation failures (1 retry with error feedback)

**Processing Pipeline**:
1. **Security Validation**: Input validation, topic filtering
2. **Cache Check**: Return cached response if available
3. **Conversation Context**: Retrieve last 10 messages
4. **SQL Generation**: Convert natural language to SQL with AI
5. **SQL Validation**: Validate security constraints
6. **Database Execution**: Execute SQL query
7. **Response Formatting**: Format results with chart metadata
8. **Output Sanitization**: Remove malicious content
9. **Cache Storage**: Store response for 24 hours
10. **Audit Logging**: Log interaction for compliance

**Key Methods**:
- `process_query(user_id, query, conversation_id)`: Process natural language query
- `process_streaming_query(user_id, query, conversation_id)`: Process with streaming response

**Error Handling**:
- User-friendly error messages (no technical details exposed)
- Retry logic for SQL generation failures
- Graceful degradation on AI failures
- Comprehensive audit logging

**Requirements Satisfied**: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.6, 12.1

## Integration with Existing Services

The query processor integrates with:
- **SecurityGuard**: Input validation, SQL validation, output sanitization, topic filtering
- **CacheManager**: Response caching with 24-hour TTL
- **ConversationManager**: Conversation history and context management
- **AuditLogger**: Comprehensive logging of all interactions
- **TokenManager**: Token usage tracking and cost calculation
- **RateLimiter**: Request and token rate limiting
- **AIAPIClient**: AI service provider abstraction (OpenAI, Anthropic)

## Usage Example

```python
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.query_processor import QueryProcessor
from app.services.sql_generator import SQLGenerator
from app.services.response_formatter import ResponseFormatter
from app.services.conversation_manager import ConversationManager
from app.services.security_guard import SecurityGuard
from app.services.cache_manager import get_cache_manager
from app.services.audit_logger import AuditLogger
from app.services.token_manager import TokenManager
from app.services.system_prompt_loader import get_system_prompt_loader
from app.services.ai.factory import create_ai_client

# Initialize services
ai_client = create_ai_client("openai")
system_prompt_loader = get_system_prompt_loader()
security_guard = SecurityGuard()
sql_generator = SQLGenerator(ai_client, system_prompt_loader, security_guard)
response_formatter = ResponseFormatter()
conversation_manager = ConversationManager(db_session)
cache_manager = get_cache_manager()
audit_logger = AuditLogger(db_session)
token_manager = TokenManager(db_session)

# Create query processor
query_processor = QueryProcessor(
    sql_generator=sql_generator,
    response_formatter=response_formatter,
    conversation_manager=conversation_manager,
    security_guard=security_guard,
    cache_manager=cache_manager,
    audit_logger=audit_logger,
    token_manager=token_manager,
    db_session=db_session,
)

# Process a query
response = await query_processor.process_query(
    user_id="user-123",
    query="Show me the top 5 banks by total collections this month",
    conversation_id=None,  # Creates new conversation
)

print(f"Response: {response.content}")
if response.chart_metadata:
    print(f"Chart type: {response.chart_metadata['type']}")
    print(f"Chart data: {response.chart_metadata['data']}")
```

## Testing

Comprehensive tests are provided in:
- `backend/tests/test_sql_generation.py`: Unit tests for all services
- `backend/test_services_standalone.py`: Standalone integration tests

Run tests:
```bash
# Unit tests (requires test environment)
pytest backend/tests/test_sql_generation.py -v

# Standalone tests (no dependencies)
python backend/test_services_standalone.py
```

## Security Considerations

1. **SQL Injection Prevention**:
   - Only SELECT queries allowed
   - Parameterized queries enforced
   - SQL validation before execution
   - Authorized tables only

2. **Prompt Injection Protection**:
   - 50+ known prompt injection patterns detected
   - System prompt includes explicit guardrails
   - Input validation before AI processing

3. **Data Privacy**:
   - No PII sent to external AI services
   - Only aggregated data in AI context
   - Account numbers, emails, names excluded

4. **Output Sanitization**:
   - Script tags removed
   - HTML entities escaped
   - URLs validated (HTTPS only)
   - Response length limited

5. **Topic Filtering**:
   - Payment analytics only
   - Blocked topics: credentials, system config, personal advice
   - Keyword-based and AI-based classification

## Performance Optimizations

1. **Caching**:
   - 24-hour TTL for responses
   - Per-user cache (1000 entries max)
   - LRU eviction policy
   - Query normalization for cache keys

2. **Rate Limiting**:
   - 20 requests per minute per user
   - 50,000 tokens per day per user
   - Sliding window algorithm

3. **Database Optimization**:
   - LIMIT clause enforced (max 1000 rows)
   - Indexed columns for common filters
   - Aggregated results for large datasets

4. **AI Optimization**:
   - Lower temperature (0.3) for SQL generation
   - Max tokens limited (1000 for SQL, 2000 for responses)
   - Retry logic with error feedback

## Future Enhancements

1. **Streaming Support**:
   - Full SSE implementation for real-time responses
   - Streaming SQL execution for large result sets

2. **Advanced Visualizations**:
   - Scatter plots for correlations
   - Heatmaps for multi-dimensional data
   - Interactive charts with drill-down

3. **Query Optimization**:
   - Query plan analysis
   - Automatic index suggestions
   - Query rewriting for performance

4. **Multi-Language Support**:
   - Translate queries to/from multiple languages
   - Localized responses

5. **Advanced Analytics**:
   - Predictive analytics
   - Anomaly detection
   - Trend forecasting

## Troubleshooting

### Common Issues

1. **"System prompt file not found"**:
   - Ensure `backend/app/config/system_prompt.yaml` exists
   - Check file permissions

2. **"SQL validation failed"**:
   - Check if query contains unauthorized operations
   - Verify LIMIT clause is present
   - Check table names are authorized

3. **"Topic validation failed"**:
   - Ensure query is about payment analytics
   - Avoid blocked topics (credentials, system config, etc.)

4. **"AI API call failed"**:
   - Check API keys are set in environment variables
   - Verify network connectivity
   - Check rate limits

### Debug Mode

Enable debug logging:
```python
import logging
logging.getLogger("app.services").setLevel(logging.DEBUG)
```

## References

- Design Document: `.kiro/specs/ai-chat-assistant/design.md`
- Requirements Document: `.kiro/specs/ai-chat-assistant/requirements.md`
- Tasks Document: `.kiro/specs/ai-chat-assistant/tasks.md`
