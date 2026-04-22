"""
Quick script to check what payment_date values are currently in the database.
This will show why "Today" filter is showing data.
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv(Path(__file__).parent.parent / ".env")

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, func
from app.db.session import AsyncSessionFactory
from app.models.upload import PaymentRecord


async def check_dates():
    async with AsyncSessionFactory() as session:
        # Get count of all records
        result = await session.execute(
            select(func.count(PaymentRecord.id))
        )
        total_count = result.scalar_one()
        
        print("\n" + "="*80)
        print(f"TOTAL RECORDS IN DATABASE: {total_count}")
        print("="*80)
        
        # Get sample of payment records with their dates
        result = await session.execute(
            select(
                PaymentRecord.payment_date,
                PaymentRecord.month,
                func.count(PaymentRecord.id).label('count')
            )
            .group_by(PaymentRecord.payment_date, PaymentRecord.month)
            .order_by(PaymentRecord.payment_date)
            .limit(50)
        )
        records = result.all()
        
        print("\nSAMPLE OF DATES IN DATABASE:")
        print("-"*80)
        print(f"{'Payment Date':<20} {'Month':<15} {'Count':<10} {'Status'}")
        print("-"*80)
        
        today = datetime.now().date()
        
        for payment_date, month, count in records:
            status = ""
            if payment_date:
                # Try to parse the date
                try:
                    if "/" in payment_date:
                        # MM/DD/YYYY format - NOT PARSED
                        status = "❌ NOT PARSED (still MM/DD/YYYY)"
                    elif "-" in payment_date and len(payment_date) == 10:
                        # YYYY-MM-DD format - CORRECTLY PARSED
                        parts = payment_date.split("-")
                        if len(parts) == 3 and len(parts[0]) == 4:
                            date_obj = datetime.strptime(payment_date, "%Y-%m-%d").date()
                            if date_obj == today:
                                status = "✓ PARSED (TODAY - this is why filter shows data!)"
                            elif date_obj.year == 2026:
                                status = "✓ PARSED (2026 - correct year)"
                            else:
                                status = f"✓ PARSED ({date_obj.year})"
                        else:
                            status = "⚠️  UNKNOWN FORMAT"
                    else:
                        status = "⚠️  UNKNOWN FORMAT"
                except:
                    status = "❌ INVALID DATE"
            else:
                status = "❌ NULL"
            
            print(f"{payment_date or 'NULL':<20} {month or 'NULL':<15} {count:<10} {status}")
        
        print("\n" + "="*80)
        print("DIAGNOSIS:")
        print("="*80)
        
        # Check if any dates are in MM/DD/YYYY format
        result = await session.execute(
            select(func.count(PaymentRecord.id))
            .where(PaymentRecord.payment_date.like("%/%"))
        )
        unparsed_count = result.scalar_one()
        
        # Check if any dates are NULL
        result = await session.execute(
            select(func.count(PaymentRecord.id))
            .where(PaymentRecord.payment_date.is_(None))
        )
        null_count = result.scalar_one()
        
        # Check if any months are NULL
        result = await session.execute(
            select(func.count(PaymentRecord.id))
            .where(PaymentRecord.month.is_(None))
        )
        null_month_count = result.scalar_one()
        
        if unparsed_count > 0:
            print(f"\n❌ PROBLEM: {unparsed_count} records have dates in MM/DD/YYYY format (not parsed)")
            print("   These dates are being treated as strings, not actual dates")
            print("   This causes the date filter to malfunction")
        
        if null_count > 0:
            print(f"\n❌ PROBLEM: {null_count} records have NULL payment_date")
        
        if null_month_count > 0:
            print(f"\n❌ PROBLEM: {null_month_count} records have NULL month field")
        
        print("\n" + "="*80)
        print("SOLUTION:")
        print("="*80)
        print("1. Go to the Uploads page in the app")
        print("2. Delete your current upload session (trash icon)")
        print("3. Re-upload your Excel file")
        print("4. The new upload will have:")
        print("   - Dates in YYYY-MM-DD format (e.g., 2026-01-12)")
        print("   - Populated month field (e.g., JANUARY)")
        print("5. Then 'Today' filter will show NO data (correct!)")
        print("="*80)


if __name__ == "__main__":
    asyncio.run(check_dates())
