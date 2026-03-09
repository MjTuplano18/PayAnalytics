"""
Create an admin user for PayAnalytics.

Usage:
    python create_admin.py

You will be prompted for email, name, and password.
"""

import asyncio
import getpass
import sys

from app.core.security import hash_password
from app.db.session import AsyncSessionFactory
from app.models.user import User

from sqlalchemy import select


async def main() -> None:
    email = input("Admin email: ").strip().lower()
    if not email:
        print("Email is required.")
        sys.exit(1)

    full_name = input("Full name: ").strip()
    if not full_name:
        print("Full name is required.")
        sys.exit(1)

    password = getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    async with AsyncSessionFactory() as session:
        # Check if user already exists
        result = await session.execute(select(User).where(User.email == email))
        existing = result.scalar_one_or_none()
        if existing:
            print(f"User with email '{email}' already exists.")
            sys.exit(1)

        user = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            is_active=True,
            is_superuser=True,
        )
        session.add(user)
        await session.commit()
        print(f"Admin user created: {email}")


if __name__ == "__main__":
    asyncio.run(main())
