"""
Generate a test JWT token for API testing.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.db.session import AsyncSessionFactory
from sqlalchemy import text

SECRET_KEY = "e06ab169eeae5b0a0da30449e180e2f8a78a94545f8c004e73cab68c76998590"
ALGORITHM = "HS256"

async def get_first_user():
    """Get the first user from the database."""
    async with AsyncSessionFactory() as session:
        result = await session.execute(text("SELECT id, email FROM users LIMIT 1"))
        row = result.fetchone()
        if row:
            return {"id": row[0], "email": row[1]}
        return None

async def generate_token():
    user = await get_first_user()
    
    if not user:
        print("❌ No users found in database. Please create a user first.")
        return
    
    # Create JWT token
    expire = datetime.now(timezone.utc) + timedelta(minutes=60)
    to_encode = {
        "sub": user["id"],
        "email": user["email"],
        "exp": expire
    }
    
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    print(f"\n✅ Generated JWT token for user: {user['email']}")
    print(f"User ID: {user['id']}")
    print(f"\nToken (valid for 60 minutes):")
    print(f"{token}")
    print(f"\nUse in Authorization header:")
    print(f"Authorization: Bearer {token}")
    
    return token

if __name__ == "__main__":
    asyncio.run(generate_token())
