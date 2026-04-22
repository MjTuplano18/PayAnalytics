"""Tests for ConversationManager service."""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.chat_message import ChatMessage
from app.models.conversation import Conversation
from app.models.user import User
from app.services.conversation_manager import ConversationManager


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user."""
    import uuid
    # Use unique email for each test to avoid conflicts
    unique_email = f"test-{uuid.uuid4()}@example.com"
    user = User(
        email=unique_email,
        full_name="Test User",
        hashed_password="hashed_password",
        is_active=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()  # Use flush instead of commit
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def conversation_manager(db_session):
    """Create a ConversationManager instance."""
    return ConversationManager(db_session)


@pytest.mark.asyncio
class TestCreateConversation:
    """Tests for create_conversation method."""

    async def test_create_conversation_without_title(
        self, conversation_manager, test_user, db_session
    ):
        """Test creating a conversation without a title."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )

        assert conversation.id is not None
        assert conversation.user_id == test_user.id
        assert conversation.title is None
        assert conversation.message_count == 0
        assert conversation.is_deleted is False
        assert conversation.created_at is not None
        assert conversation.updated_at is not None

    async def test_create_conversation_with_title(
        self, conversation_manager, test_user, db_session
    ):
        """Test creating a conversation with a custom title."""
        title = "My Custom Conversation"
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id, title=title
        )

        assert conversation.title == title
        assert conversation.user_id == test_user.id

    async def test_create_multiple_conversations(
        self, conversation_manager, test_user, db_session
    ):
        """Test creating multiple conversations for the same user."""
        conv1 = await conversation_manager.create_conversation(user_id=test_user.id)
        conv2 = await conversation_manager.create_conversation(user_id=test_user.id)

        assert conv1.id != conv2.id
        assert conv1.user_id == conv2.user_id == test_user.id


@pytest.mark.asyncio
class TestAddMessage:
    """Tests for add_message method."""

    async def test_add_user_message(
        self, conversation_manager, test_user, db_session
    ):
        """Test adding a user message to a conversation."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        message = await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="user",
            content="What are the top banks?",
        )

        assert message.id is not None
        assert message.conversation_id == conversation.id
        assert message.role == "user"
        assert message.content == "What are the top banks?"
        assert message.created_at is not None

    async def test_add_assistant_message(
        self, conversation_manager, test_user, db_session
    ):
        """Test adding an assistant message to a conversation."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        message = await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content="Here are the top banks...",
        )

        assert message.role == "assistant"
        assert message.content == "Here are the top banks..."

    async def test_add_message_with_metadata(
        self, conversation_manager, test_user, db_session
    ):
        """Test adding a message with metadata."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        metadata = {"chart_type": "bar", "data": [1, 2, 3]}
        message = await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content="Here's a chart",
            metadata=metadata,
        )

        assert message.metadata_ == metadata

    async def test_add_message_with_tokens(
        self, conversation_manager, test_user, db_session
    ):
        """Test adding a message with token count."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        message = await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content="Response",
            tokens_used=150,
        )

        assert message.tokens_used == 150

    async def test_add_message_invalid_role(
        self, conversation_manager, test_user, db_session
    ):
        """Test that adding a message with invalid role raises ValueError."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        with pytest.raises(ValueError, match="Invalid role"):
            await conversation_manager.add_message(
                conversation_id=conversation.id,
                role="invalid",
                content="Test",
            )

    async def test_add_message_updates_conversation_count(
        self, conversation_manager, test_user, db_session
    ):
        """Test that adding messages updates the conversation message count."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="user",
            content="Message 1",
        )
        await db_session.commit()

        # Refresh conversation to get updated count
        await db_session.refresh(conversation)
        assert conversation.message_count == 1

        await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content="Message 2",
        )
        await db_session.commit()

        await db_session.refresh(conversation)
        assert conversation.message_count == 2

    async def test_add_message_auto_generates_title(
        self, conversation_manager, test_user, db_session
    ):
        """Test that first user message auto-generates conversation title."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="user",
            content="What are the payment trends for last month?",
        )
        await db_session.commit()

        await db_session.refresh(conversation)
        assert conversation.title is not None
        assert len(conversation.title) > 0

    async def test_add_message_truncates_long_title(
        self, conversation_manager, test_user, db_session
    ):
        """Test that long first messages are truncated for title."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        long_message = "This is a very long message " * 20
        await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="user",
            content=long_message,
        )
        await db_session.commit()

        await db_session.refresh(conversation)
        assert conversation.title is not None
        assert len(conversation.title) <= 53  # 50 + "..."


@pytest.mark.asyncio
class TestFIFOEviction:
    """Tests for FIFO message eviction when limit is exceeded."""

    async def test_fifo_eviction_at_limit(
        self, conversation_manager, test_user, db_session
    ):
        """Test that oldest messages are deleted when limit is reached."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Add exactly 50 messages (the limit)
        for i in range(50):
            await conversation_manager.add_message(
                conversation_id=conversation.id,
                role="user" if i % 2 == 0 else "assistant",
                content=f"Message {i}",
            )
        await db_session.commit()

        # Verify we have 50 messages
        stmt = select(ChatMessage).where(
            ChatMessage.conversation_id == conversation.id
        )
        result = await db_session.execute(stmt)
        messages = list(result.scalars().all())
        assert len(messages) == 50

        # Add one more message (should trigger eviction)
        await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="user",
            content="Message 50",
        )
        await db_session.commit()

        # Verify we still have 50 messages (oldest was deleted)
        result = await db_session.execute(stmt)
        messages = list(result.scalars().all())
        assert len(messages) == 50

        # Verify the oldest message (Message 0) is gone
        message_contents = [msg.content for msg in messages]
        assert "Message 0" not in message_contents
        assert "Message 50" in message_contents

    async def test_fifo_eviction_multiple_messages(
        self, conversation_manager, test_user, db_session
    ):
        """Test that multiple oldest messages are deleted if needed."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Add 50 messages
        for i in range(50):
            await conversation_manager.add_message(
                conversation_id=conversation.id,
                role="user" if i % 2 == 0 else "assistant",
                content=f"Message {i}",
            )
        await db_session.commit()

        # Add 5 more messages
        for i in range(50, 55):
            await conversation_manager.add_message(
                conversation_id=conversation.id,
                role="user",
                content=f"Message {i}",
            )
        await db_session.commit()

        # Verify we have exactly 50 messages
        stmt = select(ChatMessage).where(
            ChatMessage.conversation_id == conversation.id
        )
        result = await db_session.execute(stmt)
        messages = list(result.scalars().all())
        assert len(messages) == 50

        # Verify oldest 5 messages are gone
        message_contents = [msg.content for msg in messages]
        for i in range(5):
            assert f"Message {i}" not in message_contents
        for i in range(5, 55):
            assert f"Message {i}" in message_contents


@pytest.mark.asyncio
class TestGetConversationContext:
    """Tests for get_conversation_context method."""

    async def test_get_context_empty_conversation(
        self, conversation_manager, test_user, db_session
    ):
        """Test getting context from an empty conversation."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        context = await conversation_manager.get_conversation_context(
            conversation_id=conversation.id
        )

        assert context == []

    async def test_get_context_with_messages(
        self, conversation_manager, test_user, db_session
    ):
        """Test getting context from a conversation with messages."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Add 5 messages
        for i in range(5):
            await conversation_manager.add_message(
                conversation_id=conversation.id,
                role="user" if i % 2 == 0 else "assistant",
                content=f"Message {i}",
            )
        await db_session.commit()

        context = await conversation_manager.get_conversation_context(
            conversation_id=conversation.id
        )

        assert len(context) == 5
        # Verify chronological order (oldest first)
        assert context[0].content == "Message 0"
        assert context[4].content == "Message 4"

    async def test_get_context_respects_limit(
        self, conversation_manager, test_user, db_session
    ):
        """Test that context retrieval respects the limit parameter."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Add 20 messages
        for i in range(20):
            await conversation_manager.add_message(
                conversation_id=conversation.id,
                role="user" if i % 2 == 0 else "assistant",
                content=f"Message {i}",
            )
        await db_session.commit()

        # Get last 5 messages
        context = await conversation_manager.get_conversation_context(
            conversation_id=conversation.id, limit=5
        )

        assert len(context) == 5
        # Should get messages 15-19 (most recent 5)
        assert context[0].content == "Message 15"
        assert context[4].content == "Message 19"

    async def test_get_context_default_limit(
        self, conversation_manager, test_user, db_session
    ):
        """Test that default limit is 10 messages."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Add 15 messages
        for i in range(15):
            await conversation_manager.add_message(
                conversation_id=conversation.id,
                role="user" if i % 2 == 0 else "assistant",
                content=f"Message {i}",
            )
        await db_session.commit()

        context = await conversation_manager.get_conversation_context(
            conversation_id=conversation.id
        )

        assert len(context) == 10
        # Should get messages 5-14 (most recent 10)
        assert context[0].content == "Message 5"
        assert context[9].content == "Message 14"


@pytest.mark.asyncio
class TestListUserConversations:
    """Tests for list_user_conversations method."""

    async def test_list_conversations_empty(
        self, conversation_manager, test_user, db_session
    ):
        """Test listing conversations when user has none."""
        conversations = await conversation_manager.list_user_conversations(
            user_id=test_user.id
        )

        assert conversations == []

    async def test_list_conversations_single(
        self, conversation_manager, test_user, db_session
    ):
        """Test listing conversations when user has one."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Test Conversation"
        )
        await db_session.commit()

        conversations = await conversation_manager.list_user_conversations(
            user_id=test_user.id
        )

        assert len(conversations) == 1
        assert conversations[0].id == conversation.id
        assert conversations[0].title == "Test Conversation"

    async def test_list_conversations_multiple(
        self, conversation_manager, test_user, db_session
    ):
        """Test listing multiple conversations."""
        conv1 = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Conversation 1"
        )
        conv2 = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Conversation 2"
        )
        await db_session.commit()

        conversations = await conversation_manager.list_user_conversations(
            user_id=test_user.id
        )

        assert len(conversations) == 2
        conversation_ids = [c.id for c in conversations]
        assert conv1.id in conversation_ids
        assert conv2.id in conversation_ids

    async def test_list_conversations_respects_limit(
        self, conversation_manager, test_user, db_session
    ):
        """Test that listing respects the limit parameter."""
        # Create 15 conversations
        for i in range(15):
            await conversation_manager.create_conversation(
                user_id=test_user.id, title=f"Conversation {i}"
            )
        await db_session.commit()

        conversations = await conversation_manager.list_user_conversations(
            user_id=test_user.id, limit=5
        )

        assert len(conversations) == 5

    async def test_list_conversations_excludes_deleted(
        self, conversation_manager, test_user, db_session
    ):
        """Test that soft-deleted conversations are excluded by default."""
        conv1 = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Active"
        )
        conv2 = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Deleted"
        )
        await db_session.commit()

        # Soft delete conv2
        await conversation_manager.delete_conversation(
            conversation_id=conv2.id, user_id=test_user.id, soft_delete=True
        )
        await db_session.commit()

        conversations = await conversation_manager.list_user_conversations(
            user_id=test_user.id
        )

        assert len(conversations) == 1
        assert conversations[0].id == conv1.id

    async def test_list_conversations_includes_deleted_when_requested(
        self, conversation_manager, test_user, db_session
    ):
        """Test that deleted conversations can be included if requested."""
        conv1 = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Active"
        )
        conv2 = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Deleted"
        )
        await db_session.commit()

        # Soft delete conv2
        await conversation_manager.delete_conversation(
            conversation_id=conv2.id, user_id=test_user.id, soft_delete=True
        )
        await db_session.commit()

        conversations = await conversation_manager.list_user_conversations(
            user_id=test_user.id, include_deleted=True
        )

        assert len(conversations) == 2


@pytest.mark.asyncio
class TestDeleteConversation:
    """Tests for delete_conversation method."""

    async def test_soft_delete_conversation(
        self, conversation_manager, test_user, db_session
    ):
        """Test soft deleting a conversation."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        result = await conversation_manager.delete_conversation(
            conversation_id=conversation.id,
            user_id=test_user.id,
            soft_delete=True,
        )
        await db_session.commit()

        assert result is True

        # Verify conversation is marked as deleted
        await db_session.refresh(conversation)
        assert conversation.is_deleted is True

    async def test_hard_delete_conversation(
        self, conversation_manager, test_user, db_session
    ):
        """Test hard deleting a conversation."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        result = await conversation_manager.delete_conversation(
            conversation_id=conversation.id,
            user_id=test_user.id,
            soft_delete=False,
        )
        await db_session.commit()

        assert result is True

        # Verify conversation is removed from database
        stmt = select(Conversation).where(Conversation.id == conversation.id)
        result = await db_session.execute(stmt)
        deleted_conv = result.scalar_one_or_none()
        assert deleted_conv is None

    async def test_delete_conversation_with_messages(
        self, conversation_manager, test_user, db_session
    ):
        """Test that deleting a conversation cascades to messages."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Add messages
        await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="user",
            content="Message 1",
        )
        await conversation_manager.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content="Message 2",
        )
        await db_session.commit()

        # Hard delete conversation
        await conversation_manager.delete_conversation(
            conversation_id=conversation.id,
            user_id=test_user.id,
            soft_delete=False,
        )
        await db_session.commit()

        # Verify messages are also deleted
        stmt = select(ChatMessage).where(
            ChatMessage.conversation_id == conversation.id
        )
        result = await db_session.execute(stmt)
        messages = list(result.scalars().all())
        assert len(messages) == 0

    async def test_delete_conversation_unauthorized(
        self, conversation_manager, test_user, db_session
    ):
        """Test that deleting another user's conversation fails."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Try to delete with wrong user_id
        result = await conversation_manager.delete_conversation(
            conversation_id=conversation.id,
            user_id="wrong-user-id",
            soft_delete=True,
        )

        assert result is False

        # Verify conversation still exists
        await db_session.refresh(conversation)
        assert conversation.is_deleted is False

    async def test_delete_nonexistent_conversation(
        self, conversation_manager, test_user, db_session
    ):
        """Test deleting a conversation that doesn't exist."""
        result = await conversation_manager.delete_conversation(
            conversation_id="nonexistent-id",
            user_id=test_user.id,
            soft_delete=True,
        )

        assert result is False


@pytest.mark.asyncio
class TestGetConversation:
    """Tests for get_conversation method."""

    async def test_get_conversation_by_id(
        self, conversation_manager, test_user, db_session
    ):
        """Test getting a conversation by ID."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id, title="Test"
        )
        await db_session.commit()

        retrieved = await conversation_manager.get_conversation(
            conversation_id=conversation.id
        )

        assert retrieved is not None
        assert retrieved.id == conversation.id
        assert retrieved.title == "Test"

    async def test_get_conversation_with_user_check(
        self, conversation_manager, test_user, db_session
    ):
        """Test getting a conversation with user authorization check."""
        conversation = await conversation_manager.create_conversation(
            user_id=test_user.id
        )
        await db_session.commit()

        # Should succeed with correct user_id
        retrieved = await conversation_manager.get_conversation(
            conversation_id=conversation.id, user_id=test_user.id
        )
        assert retrieved is not None

        # Should fail with wrong user_id
        retrieved = await conversation_manager.get_conversation(
            conversation_id=conversation.id, user_id="wrong-user-id"
        )
        assert retrieved is None

    async def test_get_nonexistent_conversation(
        self, conversation_manager, test_user, db_session
    ):
        """Test getting a conversation that doesn't exist."""
        retrieved = await conversation_manager.get_conversation(
            conversation_id="nonexistent-id"
        )

        assert retrieved is None
