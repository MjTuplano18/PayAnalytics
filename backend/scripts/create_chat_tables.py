"""
Manually create chat tables from migration SQL.
This script directly executes the SQL from the migration file.
"""
import asyncio
from app.db.session import AsyncSessionFactory
from sqlalchemy import text

async def create_tables():
    async with AsyncSessionFactory() as session:
        try:
            # Create conversations table
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    message_count INTEGER NOT NULL DEFAULT 0,
                    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
                )
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at)
            """))
            
            print("✓ Created conversations table")
            
            # Create chat_messages table
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id VARCHAR(36) PRIMARY KEY,
                    conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL,
                    content TEXT NOT NULL,
                    metadata JSON,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    tokens_used INTEGER,
                    CONSTRAINT chk_chat_messages_role CHECK (role IN ('user', 'assistant'))
                )
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id)
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)
            """))
            
            print("✓ Created chat_messages table")
            
            # Create ai_audit_logs table
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_audit_logs (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    conversation_id VARCHAR(36) REFERENCES conversations(id) ON DELETE SET NULL,
                    event_type VARCHAR(50) NOT NULL,
                    query_text TEXT,
                    response_text TEXT,
                    sql_generated TEXT,
                    tokens_used INTEGER,
                    processing_time_ms INTEGER,
                    error_type VARCHAR(100),
                    error_message TEXT,
                    metadata JSON,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                )
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_user_id ON ai_audit_logs(user_id)
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_event_type ON ai_audit_logs(event_type)
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_created_at ON ai_audit_logs(created_at)
            """))
            
            print("✓ Created ai_audit_logs table")
            
            # Create token_usage table
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS token_usage (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    conversation_id VARCHAR(36) REFERENCES conversations(id) ON DELETE SET NULL,
                    model VARCHAR(50) NOT NULL,
                    input_tokens INTEGER NOT NULL,
                    output_tokens INTEGER NOT NULL,
                    total_tokens INTEGER NOT NULL,
                    estimated_cost NUMERIC(10, 6) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                )
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage(user_id)
            """))
            
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at)
            """))
            
            print("✓ Created token_usage table")
            
            # Commit the transaction
            await session.commit()
            
            print("\n✅ All chat tables created successfully!")
            
        except Exception as e:
            print(f"\n❌ Error creating tables: {e}")
            await session.rollback()
            raise

if __name__ == "__main__":
    asyncio.run(create_tables())
