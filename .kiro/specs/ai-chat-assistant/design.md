# Design Document: AI Chat Assistant

## Overview

The AI Chat Assistant is a natural language interface that enables users to query payment analytics data through conversational interactions. The system integrates with the existing PayAnalytics dashboard, leveraging large language models (OpenAI GPT-4 or Anthropic Claude) to translate natural language queries into SQL operations, execute them against the PostgreSQL database, and present results in user-friendly formats including text summaries and visualizations.

### Design Goals

1. **User Accessibility**: Enable non-technical users to explore payment data without SQL knowledge
2. **Security First**: Prevent prompt injection, SQL injection, and unauthorized data access
3. **Privacy Compliance**: Ensure no PII is sent to external AI services
4. **Cost Efficiency**: Implement caching and rate limiting to control AI API costs
5. **Seamless Integration**: Integrate with existing authentication, database, and frontend architecture
6. **Real-Time Experience**: Provide streaming responses for immediate user feedback
7. **Auditability**: Maintain comprehensive logs of all AI interactions

### Key Architectural Decisions

1. **Layered Architecture**: Clear separation between presentation (Next.js), API (FastAPI), and AI integration layers
2. **Security-in-Depth**: Multiple validation layers (input validation, SQL validation, output sanitization)
3. **Stateful Conversations**: Maintain conversation history in database for context-aware responses
4. **Dual AI Provider Support**: Abstract AI client to support both OpenAI and Anthropic
5. **Server-Sent Events**: Use SSE for streaming responses instead of WebSockets for simplicity
6. **Redis for Performance**: Leverage Redis for caching and rate limiting
7. **Aggregation-Only AI Context**: Send only aggregated data summaries to AI, never raw PII

## Architecture

### System Architecture

The AI Chat Assistant follows a layered architecture pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ChatInterface│  │ MessageList  │  │ ChartRenderer│          │
│  │  Component   │  │  Component   │  │  Component   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
│                    Next.js API Routes                            │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │ HTTPS/JWT
┌────────────────────────────┼─────────────────────────────────────┐
│                    Backend API Layer                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           FastAPI Chat Endpoints                         │   │
│  │  /api/v1/chat/query  │  /api/v1/chat/stream             │   │
│  │  /api/v1/chat/conversations  │  /api/v1/chat/history    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │         Authentication Middleware (JWT)                   │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                     │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │              Security Guard Layer                         │  │
│  │  • Input Validation  • Prompt Injection Detection        │  │
│  │  • Topic Filtering   • Output Sanitization               │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                   Service Layer                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Query     │  │ Conversation │  │   Response   │          │
│  │  Processor   │  │   Manager    │  │  Formatter   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐          │
│  │     SQL      │  │     Rate     │  │    Token     │          │
│  │  Generator   │  │   Limiter    │  │   Manager    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐          │
│  │    Cache     │  │    Audit     │  │  AI API      │          │
│  │   Manager    │  │   Logger     │  │   Client     │          │
│  └──────────────┘  └──────────────┘  └──────┬───────┘          │
│                                              │                  │
└──────────────────────────────────────────────┼──────────────────┘
                                               │
┌──────────────────────────────────────────────┼──────────────────┐
│                   Data Layer                 │                  │
│  ┌──────────────┐  ┌──────────────┐         │                  │
│  │  PostgreSQL  │  │    Redis     │         │                  │
│  │   Database   │  │    Cache     │         │                  │
│  └──────────────┘  └──────────────┘         │                  │
└─────────────────────────────────────────────┼──────────────────┘
                                              │
┌─────────────────────────────────────────────┼──────────────────┐
│                External Services             │                  │
│  ┌──────────────┐  ┌──────────────┐         │                  │
│  │   OpenAI     │  │  Anthropic   │         │                  │
│  │   GPT-4 API  │  │  Claude API  │◄────────┘                  │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

**Standard Query Flow:**

1. User submits query via ChatInterface
2. Frontend sends POST to `/api/v1/chat/query` with JWT token
3. Authentication Middleware validates JWT and extracts user_id
4. Rate Limiter checks user request quota (20/minute, 50k tokens/day)
5. Security Guard validates input (prompt injection, topic filtering)
6. Cache Manager checks for cached response (24-hour TTL)
7. If cache miss:
   - Conversation Manager retrieves last 10 messages for context
   - Query Processor coordinates the AI request
   - SQL Generator uses AI to convert NL to SQL
   - Security Guard validates generated SQL (SELECT only, authorized tables)
   - Query Processor executes SQL against Payment Database
   - Response Formatter structures results (text + optional chart metadata)
   - Security Guard sanitizes output (remove scripts, validate URLs)
8. Cache Manager stores response
9. Audit Logger records interaction
10. Response returned to frontend
11. ChatInterface renders message and optional chart

**Streaming Query Flow:**

1. User submits query via ChatInterface
2. Frontend establishes SSE connection to `/api/v1/chat/stream`
3. Steps 3-7 same as standard flow
4. Response Formatter emits chunks as they arrive from AI API
5. Each chunk sent via SSE to frontend
6. ChatInterface appends chunks in real-time
7. On completion, cache and audit as in standard flow

### Data Flow Diagram

```
User Query → Input Validation → Topic Filtering → Cache Check
                                                        │
                                                   Cache Hit?
                                                   │        │
                                                  Yes       No
                                                   │        │
                                                   │   Conversation
                                                   │    Context
                                                   │        │
                                                   │   AI API Call
                                                   │        │
                                                   │   SQL Generation
                                                   │        │
                                                   │   SQL Validation
                                                   │        │
                                                   │   DB Execution
                                                   │        │
                                                   │   Response Format
                                                   │        │
                                                   │   Output Sanitize
                                                   │        │
                                                   └────────┤
                                                            │
                                                       Cache Store
                                                            │
                                                       Audit Log
                                                            │
                                                       Return Response
```

## Components and Interfaces

### Frontend Components

#### ChatInterface Component

**Responsibility**: Main container for chat UI, manages conversation state

**Props:**
```typescript
interface ChatInterfaceProps {
  isOpen: boolean;
  onToggle: () => void;
  userId: string;
  authToken: string;
}
```

**State:**
```typescript
interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  isStreaming: boolean;
}
```

**Key Methods:**
- `sendQuery(query: string): Promise<void>` - Submit user query
- `loadConversations(): Promise<void>` - Fetch conversation list
- `switchConversation(id: string): Promise<void>` - Change active conversation
- `deleteConversation(id: string): Promise<void>` - Remove conversation
- `handleQuickAction(template: string): Promise<void>` - Execute quick action

#### MessageList Component

**Responsibility**: Display conversation messages with proper formatting

**Props:**
```typescript
interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onCopyMessage: (content: string) => void;
}
```

**Features:**
- Auto-scroll to latest message
- Markdown rendering for AI responses
- Code block syntax highlighting
- Timestamp display
- Copy-to-clipboard functionality

#### ChartRenderer Component

**Responsibility**: Render data visualizations from AI responses

**Props:**
```typescript
interface ChartRendererProps {
  chartData: ChartMetadata;
  type: 'bar' | 'line' | 'pie';
}

interface ChartMetadata {
  type: 'bar' | 'line' | 'pie';
  data: number[];
  labels: string[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}
```

**Supported Chart Types:**
- Bar Chart: Top-N queries (e.g., top 5 banks)
- Line Chart: Time-series data (e.g., monthly trends)
- Pie Chart: Distribution data (e.g., payment breakdown)

#### QuickActions Component

**Responsibility**: Display pre-defined query templates

**Props:**
```typescript
interface QuickActionsProps {
  templates: QuickActionTemplate[];
  onSelect: (query: string) => void;
}

interface QuickActionTemplate {
  id: string;
  label: string;
  query: string;
  icon?: string;
}
```

**Default Templates:**
1. "Top 5 banks this month"
2. "Payment trends last 6 months"
3. "Today's collections by touchpoint"
4. "Compare this month vs last month"
5. "Highest single payment"
6. "Average payment by bank"
7. "Upload summary"
8. "Environment breakdown"
9. "Monthly totals"
10. "Bank performance ranking"

### Backend Services

#### QueryProcessor Service

**Responsibility**: Orchestrate query processing pipeline

**Interface:**
```python
class QueryProcessor:
    def __init__(
        self,
        sql_generator: SQLGenerator,
        response_formatter: ResponseFormatter,
        conversation_manager: ConversationManager,
        security_guard: SecurityGuard,
        cache_manager: CacheManager,
        audit_logger: AuditLogger,
        db_session: AsyncSession,
    ):
        ...
    
    async def process_query(
        self,
        user_id: str,
        query: str,
        conversation_id: str | None = None,
    ) -> QueryResponse:
        """Process a natural language query and return formatted response."""
        ...
    
    async def process_streaming_query(
        self,
        user_id: str,
        query: str,
        conversation_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Process query with streaming response."""
        ...
```

**Key Responsibilities:**
- Coordinate security validation
- Check cache before AI call
- Manage conversation context
- Execute SQL queries
- Handle errors gracefully
- Trigger audit logging

#### SQLGenerator Service

**Responsibility**: Convert natural language to SQL using AI

**Interface:**
```python
class SQLGenerator:
    def __init__(
        self,
        ai_client: AIAPIClient,
        system_prompt: str,
        schema_info: dict,
    ):
        ...
    
    async def generate_sql(
        self,
        user_query: str,
        conversation_context: list[Message],
    ) -> SQLGenerationResult:
        """Generate SQL query from natural language."""
        ...
    
    def validate_sql(self, sql: str) -> ValidationResult:
        """Validate generated SQL meets security constraints."""
        ...
```

**Validation Rules:**
- Only SELECT statements allowed
- No subqueries to unauthorized tables
- LIMIT clause required (max 1000)
- No UNION, EXCEPT, INTERSECT with unauthorized tables
- Parameterized queries only

#### ResponseFormatter Service

**Responsibility**: Structure AI responses and prepare visualizations

**Interface:**
```python
class ResponseFormatter:
    async def format_response(
        self,
        ai_response: str,
        query_results: list[dict],
        user_query: str,
    ) -> FormattedResponse:
        """Format AI response with optional chart metadata."""
        ...
    
    def determine_chart_type(
        self,
        query_results: list[dict],
        user_query: str,
    ) -> ChartMetadata | None:
        """Determine if results should include visualization."""
        ...
    
    async def format_streaming_chunk(
        self,
        chunk: str,
    ) -> str:
        """Format a streaming response chunk."""
        ...
```

**Chart Detection Logic:**
- Top-N queries → Bar chart
- Time-series queries → Line chart
- Distribution/breakdown queries → Pie chart
- Queries with >10 results → No chart (table only)

#### ConversationManager Service

**Responsibility**: Manage conversation history and context

**Interface:**
```python
class ConversationManager:
    def __init__(self, db_session: AsyncSession):
        ...
    
    async def create_conversation(
        self,
        user_id: str,
    ) -> Conversation:
        """Create a new conversation."""
        ...
    
    async def add_message(
        self,
        conversation_id: str,
        role: str,  # 'user' or 'assistant'
        content: str,
        metadata: dict | None = None,
    ) -> Message:
        """Add a message to conversation."""
        ...
    
    async def get_conversation_context(
        self,
        conversation_id: str,
        limit: int = 10,
    ) -> list[Message]:
        """Retrieve recent messages for AI context."""
        ...
    
    async def list_user_conversations(
        self,
        user_id: str,
        limit: int = 10,
    ) -> list[Conversation]:
        """List user's recent conversations."""
        ...
    
    async def delete_conversation(
        self,
        conversation_id: str,
        user_id: str,
    ) -> bool:
        """Delete a conversation and all its messages."""
        ...
```

**Storage Strategy:**
- Store last 50 messages per conversation
- FIFO eviction when limit exceeded
- Include last 10 messages in AI context
- Soft delete for audit trail

#### SecurityGuard Service

**Responsibility**: Validate inputs and sanitize outputs

**Interface:**
```python
class SecurityGuard:
    def __init__(
        self,
        prompt_injection_patterns: list[str],
        topic_filter: TopicFilter,
    ):
        ...
    
    def validate_input(self, user_query: str) -> ValidationResult:
        """Validate user input for security threats."""
        ...
    
    def validate_sql(self, sql: str) -> ValidationResult:
        """Validate generated SQL meets security constraints."""
        ...
    
    def sanitize_output(self, ai_response: str) -> str:
        """Remove malicious content from AI response."""
        ...
    
    def check_topic(self, user_query: str) -> bool:
        """Verify query is within allowed topics."""
        ...
```

**Input Validation Checks:**
- Prompt injection patterns (50+ known patterns)
- SQL injection attempts
- Script tags and executable code
- Topic filtering (payment analytics only)
- Query length limits (1000 chars)

**Output Sanitization:**
- Remove `<script>` tags
- Escape HTML entities
- Validate URLs (HTTPS only)
- Remove SQL commands in text
- Limit response length (5000 chars)

#### RateLimiter Service

**Responsibility**: Enforce request and token limits

**Interface:**
```python
class RateLimiter:
    def __init__(self, redis_client: Redis):
        ...
    
    async def check_request_limit(
        self,
        user_id: str,
    ) -> RateLimitResult:
        """Check if user is within request limits (20/minute)."""
        ...
    
    async def check_token_limit(
        self,
        user_id: str,
        estimated_tokens: int,
    ) -> RateLimitResult:
        """Check if user is within daily token limit (50k/day)."""
        ...
    
    async def increment_request_count(
        self,
        user_id: str,
    ) -> None:
        """Increment user's request counter."""
        ...
    
    async def record_token_usage(
        self,
        user_id: str,
        tokens_used: int,
    ) -> None:
        """Record token usage for user."""
        ...
```

**Rate Limit Strategy:**
- Redis sliding window for request counting
- Per-user request limit: 20/minute
- Per-user token limit: 50,000/day
- Return 429 with Retry-After header
- Alert at 80% of daily token budget

#### TokenManager Service

**Responsibility**: Track and report AI token usage

**Interface:**
```python
class TokenManager:
    def __init__(self, db_session: AsyncSession):
        ...
    
    async def record_usage(
        self,
        user_id: str,
        conversation_id: str,
        input_tokens: int,
        output_tokens: int,
        model: str,
    ) -> TokenUsage:
        """Record token usage for a request."""
        ...
    
    async def get_user_usage(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> UsageReport:
        """Get token usage report for user."""
        ...
    
    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str,
    ) -> float:
        """Calculate estimated cost based on current pricing."""
        ...
```

**Pricing (as of design):**
- GPT-4: $0.03/1K input tokens, $0.06/1K output tokens
- Claude 3 Opus: $0.015/1K input tokens, $0.075/1K output tokens

#### CacheManager Service

**Responsibility**: Cache responses for common queries

**Interface:**
```python
class CacheManager:
    def __init__(self, redis_client: Redis):
        ...
    
    async def get_cached_response(
        self,
        query: str,
        user_id: str,
    ) -> CachedResponse | None:
        """Retrieve cached response if available."""
        ...
    
    async def cache_response(
        self,
        query: str,
        user_id: str,
        response: str,
        ttl: int = 86400,  # 24 hours
    ) -> None:
        """Cache a response."""
        ...
    
    def normalize_query(self, query: str) -> str:
        """Normalize query for cache key generation."""
        ...
```

**Caching Strategy:**
- Redis for cache storage
- 24-hour TTL
- Per-user cache (1000 entries max)
- LRU eviction policy
- Cache key: hash of normalized query + user_id

#### AuditLogger Service

**Responsibility**: Log all AI interactions for compliance

**Interface:**
```python
class AuditLogger:
    def __init__(self, db_session: AsyncSession):
        ...
    
    async def log_query(
        self,
        user_id: str,
        conversation_id: str,
        query: str,
        response: str,
        tokens_used: int,
        processing_time_ms: int,
        metadata: dict | None = None,
    ) -> None:
        """Log a successful query interaction."""
        ...
    
    async def log_error(
        self,
        user_id: str,
        query: str,
        error_type: str,
        error_message: str,
        stack_trace: str | None = None,
    ) -> None:
        """Log an error during query processing."""
        ...
    
    async def log_security_violation(
        self,
        user_id: str,
        query: str,
        violation_type: str,
        details: dict,
    ) -> None:
        """Log security violations (prompt injection, topic filtering)."""
        ...
```

**Retention Policy:**
- 90-day retention for audit logs
- Automatic cleanup via background task
- Separate table from main application data

#### AIAPIClient Service

**Responsibility**: Abstract interface to AI providers

**Interface:**
```python
class AIAPIClient(ABC):
    @abstractmethod
    async def generate_response(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AIResponse:
        """Generate a response from the AI model."""
        ...
    
    @abstractmethod
    async def generate_streaming_response(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response."""
        ...

class OpenAIClient(AIAPIClient):
    """OpenAI GPT-4 implementation."""
    ...

class AnthropicClient(AIAPIClient):
    """Anthropic Claude implementation."""
    ...
```

**Configuration:**
- API keys from environment variables
- Retry logic: 2 retries with exponential backoff (1s, 2s)
- Timeout: 30 seconds
- Max tokens: 2000 (configurable)
- Temperature: 0.7 for balanced creativity/accuracy

## Data Models

### Database Schema

#### conversations Table

```sql
CREATE TABLE conversations (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),  -- Auto-generated from first query
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    message_count INTEGER NOT NULL DEFAULT 0,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    
    INDEX idx_conversations_user_id (user_id),
    INDEX idx_conversations_created_at (created_at)
);
```

#### chat_messages Table

```sql
CREATE TABLE chat_messages (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- 'user' or 'assistant'
    content TEXT NOT NULL,
    metadata JSONB,  -- Chart data, SQL query, etc.
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    tokens_used INTEGER,
    
    INDEX idx_chat_messages_conversation_id (conversation_id),
    INDEX idx_chat_messages_created_at (created_at),
    
    CONSTRAINT chk_role CHECK (role IN ('user', 'assistant'))
);
```

#### ai_audit_logs Table

```sql
CREATE TABLE ai_audit_logs (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id VARCHAR(36) REFERENCES conversations(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,  -- 'query', 'error', 'security_violation', 'rate_limit'
    query_text TEXT,
    response_text TEXT,
    sql_generated TEXT,
    tokens_used INTEGER,
    processing_time_ms INTEGER,
    error_type VARCHAR(100),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    INDEX idx_ai_audit_logs_user_id (user_id),
    INDEX idx_ai_audit_logs_event_type (event_type),
    INDEX idx_ai_audit_logs_created_at (created_at)
);
```

#### token_usage Table

```sql
CREATE TABLE token_usage (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id VARCHAR(36) REFERENCES conversations(id) ON DELETE SET NULL,
    model VARCHAR(50) NOT NULL,  -- 'gpt-4', 'claude-3-opus'
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    estimated_cost NUMERIC(10, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    INDEX idx_token_usage_user_id (user_id),
    INDEX idx_token_usage_created_at (created_at)
);
```

#### response_cache Table (Redis)

```
Key: chat:cache:{user_id}:{query_hash}
Value: {
    "response": "...",
    "chart_metadata": {...},
    "cached_at": "2024-01-15T10:30:00Z"
}
TTL: 86400 seconds (24 hours)
```

#### rate_limit_requests Table (Redis)

```
Key: chat:ratelimit:requests:{user_id}
Value: Request count
TTL: 60 seconds (sliding window)
```

#### rate_limit_tokens Table (Redis)

```
Key: chat:ratelimit:tokens:{user_id}:{date}
Value: Token count
TTL: 86400 seconds (24 hours)
```

### Pydantic Schemas

#### Request Schemas

```python
class ChatQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    conversation_id: str | None = None
    stream: bool = False

class ConversationCreateRequest(BaseModel):
    title: str | None = None

class QuickActionRequest(BaseModel):
    template_id: str
```

#### Response Schemas

```python
class ChartMetadata(BaseModel):
    type: Literal['bar', 'line', 'pie']
    data: list[float]
    labels: list[str]
    title: str | None = None
    x_axis_label: str | None = None
    y_axis_label: str | None = None

class ChatQueryResponse(BaseModel):
    message_id: str
    conversation_id: str
    role: Literal['assistant']
    content: str
    chart_metadata: ChartMetadata | None = None
    tokens_used: int
    processing_time_ms: int
    cached: bool = False

class Message(BaseModel):
    id: str
    role: Literal['user', 'assistant']
    content: str
    created_at: datetime
    metadata: dict | None = None

class Conversation(BaseModel):
    id: str
    title: str | None
    message_count: int
    created_at: datetime
    updated_at: datetime

class ConversationListResponse(BaseModel):
    conversations: list[Conversation]
    total: int

class ConversationHistoryResponse(BaseModel):
    conversation_id: str
    messages: list[Message]
    total: int

class TokenUsageResponse(BaseModel):
    user_id: str
    period_start: datetime
    period_end: datetime
    total_tokens: int
    input_tokens: int
    output_tokens: int
    estimated_cost: float
    requests_count: int

class ErrorResponse(BaseModel):
    error: str
    message: str
    details: dict | None = None
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before writing correctness properties, I need to analyze the acceptance criteria to determine which are suitable for property-based testing.

