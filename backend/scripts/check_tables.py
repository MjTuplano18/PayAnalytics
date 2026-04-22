import asyncio
from app.db.session import AsyncSessionFactory
from sqlalchemy import text

async def check():
    async with AsyncSessionFactory() as session:
        result = await session.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name IN "
            "('conversations', 'chat_messages', 'ai_audit_logs', 'token_usage')"
        ))
        tables = [row[0] for row in result]
        print(f"Chat tables found: {tables}")
        return tables

if __name__ == "__main__":
    tables = asyncio.run(check())
    if len(tables) == 0:
        print("No chat tables found! Need to create them.")
    elif len(tables) < 4:
        print(f"Only {len(tables)} of 4 chat tables found!")
    else:
        print("All chat tables exist!")
