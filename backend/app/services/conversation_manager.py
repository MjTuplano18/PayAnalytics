"""Conversation Manager Service for AI Chat Assistant.

This service manages conversation history and context for the AI chat assistant.
It handles conversation creation, message storage, context retrieval, and FIFO eviction.
"""

import uuid
from datetime import datetime

from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
from app.models.conversation import Conversation


class ConversationManager:
    """Manages conversation history and context for AI chat assistant.
    
    Responsibilities:
    - Create new conversations with auto-generated titles
    - Store user and assistant messages
    - Retrieve conversation context (last N messages)
    - Enforce FIFO eviction when conversation exceeds 50 messages
    - List user's conversations
    - Delete conversations
    """

    MAX_MESSAGES_PER_CONVERSATION = 50
    DEFAULT_CONTEXT_LIMIT = 10

    def __init__(self, db_session: AsyncSession):
        """Initialize the conversation manager.
        
        Args:
            db_session: SQLAlchemy async database session
        """
        self.db = db_session

    async def create_conversation(
        self,
        user_id: str,
        title: str | None = None,
    ) -> Conversation:
        """Create a new conversation for a user.
        
        The title can be provided explicitly or will be auto-generated from the first query.
        
        Args:
            user_id: ID of the user creating the conversation
            title: Optional conversation title (auto-generated if None)
            
        Returns:
            Created Conversation object
            
        Requirements: 7.5, 16.1
        """
        conversation = Conversation(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=title,
            message_count=0,
            is_deleted=False,
        )
        
        self.db.add(conversation)
        await self.db.flush()
        await self.db.refresh(conversation)
        
        return conversation

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: dict | None = None,
        tokens_used: int | None = None,
    ) -> ChatMessage:
        """Add a message to a conversation.
        
        Automatically handles:
        - FIFO eviction if conversation exceeds 50 messages
        - Updating conversation message count
        - Updating conversation updated_at timestamp
        - Auto-generating conversation title from first user message
        
        Args:
            conversation_id: ID of the conversation
            role: Message role ('user' or 'assistant')
            content: Message content
            metadata: Optional metadata (chart data, SQL query, etc.)
            tokens_used: Optional token count for the message
            
        Returns:
            Created ChatMessage object
            
        Raises:
            ValueError: If role is not 'user' or 'assistant'
            
        Requirements: 7.2, 7.3, 7.4, 16.1
        """
        if role not in ('user', 'assistant'):
            raise ValueError(f"Invalid role: {role}. Must be 'user' or 'assistant'")
        
        # Check current message count and enforce FIFO eviction
        await self._enforce_message_limit(conversation_id)
        
        # Create the new message
        message = ChatMessage(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            metadata_=metadata,
            tokens_used=tokens_used,
        )
        
        self.db.add(message)
        await self.db.flush()
        
        # Update conversation metadata
        await self._update_conversation_metadata(conversation_id, content, role)
        
        await self.db.refresh(message)
        return message

    async def get_conversation_context(
        self,
        conversation_id: str,
        limit: int = DEFAULT_CONTEXT_LIMIT,
    ) -> list[ChatMessage]:
        """Retrieve recent messages for AI context.
        
        Returns the most recent N messages in chronological order (oldest first).
        This is used to provide conversation context to the AI API.
        
        Args:
            conversation_id: ID of the conversation
            limit: Maximum number of messages to retrieve (default: 10)
            
        Returns:
            List of ChatMessage objects in chronological order
            
        Requirements: 7.2, 16.1, 16.2
        """
        # Get the most recent N messages, ordered by created_at descending
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(desc(ChatMessage.created_at))
            .limit(limit)
        )
        
        result = await self.db.execute(stmt)
        messages = list(result.scalars().all())
        
        # Reverse to get chronological order (oldest first)
        messages.reverse()
        
        return messages

    async def list_user_conversations(
        self,
        user_id: str,
        limit: int = 10,
        include_deleted: bool = False,
    ) -> list[Conversation]:
        """List user's recent conversations.
        
        Returns conversations ordered by most recently updated first.
        
        Args:
            user_id: ID of the user
            limit: Maximum number of conversations to retrieve (default: 10)
            include_deleted: Whether to include soft-deleted conversations
            
        Returns:
            List of Conversation objects ordered by updated_at descending
            
        Requirements: 7.6, 16.4
        """
        stmt = (
            select(Conversation)
            .where(Conversation.user_id == user_id)
        )
        
        if not include_deleted:
            stmt = stmt.where(Conversation.is_deleted == False)  # noqa: E712
        
        stmt = stmt.order_by(desc(Conversation.updated_at)).limit(limit)
        
        result = await self.db.execute(stmt)
        conversations = list(result.scalars().all())
        
        return conversations

    async def delete_conversation(
        self,
        conversation_id: str,
        user_id: str,
        soft_delete: bool = True,
    ) -> bool:
        """Delete a conversation and optionally its messages.
        
        By default, performs a soft delete (sets is_deleted=True) for audit trail.
        Hard delete will cascade to all messages due to database constraints.
        
        Args:
            conversation_id: ID of the conversation to delete
            user_id: ID of the user (for authorization check)
            soft_delete: If True, soft delete; if False, hard delete
            
        Returns:
            True if conversation was deleted, False if not found or unauthorized
            
        Requirements: 7.7, 16.4
        """
        # Verify the conversation belongs to the user
        stmt = select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return False
        
        if soft_delete:
            # Soft delete: mark as deleted
            conversation.is_deleted = True
            await self.db.flush()
        else:
            # Hard delete: remove from database (cascades to messages)
            await self.db.delete(conversation)
            await self.db.flush()
        
        return True

    async def get_conversation(
        self,
        conversation_id: str,
        user_id: str | None = None,
    ) -> Conversation | None:
        """Get a conversation by ID.
        
        Args:
            conversation_id: ID of the conversation
            user_id: Optional user ID for authorization check
            
        Returns:
            Conversation object or None if not found
        """
        stmt = select(Conversation).where(Conversation.id == conversation_id)
        
        if user_id:
            stmt = stmt.where(Conversation.user_id == user_id)
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _enforce_message_limit(self, conversation_id: str) -> None:
        """Enforce FIFO eviction when conversation exceeds message limit.
        
        Removes oldest messages when count reaches MAX_MESSAGES_PER_CONVERSATION.
        
        Args:
            conversation_id: ID of the conversation
            
        Requirements: 7.3
        """
        # Count current messages
        count_stmt = (
            select(func.count())
            .select_from(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
        )
        result = await self.db.execute(count_stmt)
        current_count = result.scalar() or 0
        
        # If at or above limit, delete oldest messages
        if current_count >= self.MAX_MESSAGES_PER_CONVERSATION:
            messages_to_delete = current_count - self.MAX_MESSAGES_PER_CONVERSATION + 1
            
            # Get IDs of oldest messages
            oldest_stmt = (
                select(ChatMessage.id)
                .where(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.created_at)
                .limit(messages_to_delete)
            )
            result = await self.db.execute(oldest_stmt)
            oldest_ids = [row[0] for row in result.all()]
            
            # Delete oldest messages
            if oldest_ids:
                delete_stmt = delete(ChatMessage).where(ChatMessage.id.in_(oldest_ids))
                await self.db.execute(delete_stmt)
                await self.db.flush()

    async def _update_conversation_metadata(
        self,
        conversation_id: str,
        message_content: str,
        role: str,
    ) -> None:
        """Update conversation metadata after adding a message.
        
        Updates:
        - message_count (increment)
        - updated_at (current timestamp)
        - title (auto-generate from first user message if not set)
        
        Args:
            conversation_id: ID of the conversation
            message_content: Content of the message being added
            role: Role of the message ('user' or 'assistant')
        """
        # Get current conversation
        stmt = select(Conversation).where(Conversation.id == conversation_id)
        result = await self.db.execute(stmt)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return
        
        # Increment message count
        conversation.message_count += 1
        
        # Update timestamp
        conversation.updated_at = datetime.utcnow()
        
        # Auto-generate title from first user message if not set
        if not conversation.title and role == 'user':
            conversation.title = self._generate_title(message_content)
        
        await self.db.flush()

    def _generate_title(self, first_message: str, max_length: int = 50) -> str:
        """Generate a conversation title from the first user message.
        
        Args:
            first_message: The first user message content
            max_length: Maximum length of the title
            
        Returns:
            Generated title string
        """
        # Truncate and clean the message
        title = first_message.strip()
        
        if len(title) > max_length:
            title = title[:max_length].rsplit(' ', 1)[0] + '...'
        
        return title
