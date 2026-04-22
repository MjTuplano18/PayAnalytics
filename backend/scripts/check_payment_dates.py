"""
Script to check payment_date and month values in the database.
This will help diagnose why date filtering is showing incorrect data.
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent.parent / ".env")

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, func
from app.db.session import AsyncSessionFactory
from app.models.upload import PaymentRecord


async def check_dates():
    async with AsyncSessionFactory() as session:
        # Get sample of payment records
        result = await session.execute(
            select(
                PaymentRecord.id,
                PaymentRecord.payment_date,
                PaymentRecord.month,
                PaymentRecord.bank,
                PaymentRecord.payment_amount
            )
            .limit(20)
        )
        records = result.all()
        
        print("\n" + "="*80)
        print("SAMPLE PAYMENT RECORDS (first 20)")
        print("="*80)
        print(f"{'ID':<38} {'Payment Date':<15} {'Month':<10} {'Bank':<20} {'Amount':<10}")
        print("-"*80)
        
        for rec in records:
            print(f"{rec.id:<38} {rec.payment_date or 'NULL':<15} {rec.month or 'NULL':<10} {rec.bank:<20} {rec.payment_amount:<10.2f}")
        
        # Count records by month field
        print("\n" + "="*80)
        print("RECORDS BY MONTH FIELD")
        print("="*80)
        result = await session.execute(
            select(
                PaymentRecord.month,
                func.count(PaymentRecord.id).label('count')
            )
            .group_by(PaymentRecord.month)
            .order_by(PaymentRecord.month)
        )
        month_counts = result.all()
        
        for month, count in month_counts:
            print(f"{month or 'NULL':<15} {count:>10} records")
        
        # Count records by payment_date prefix (YYYY-MM)
        print("\n" + "="*80)
        print("RECORDS BY PAYMENT_DATE (YYYY-MM)")
        print("="*80)
        result = await session.execute(
            select(PaymentRecord.payment_date)
        )
        all_dates = [r[0] for r in result.all() if r[0]]
        
        from collections import Counter
        month_prefixes = Counter()
        for date_str in all_dates:
            if date_str and len(date_str) >= 7:
                month_prefix = date_str[:7]  # YYYY-MM
                month_prefixes[month_prefix] += 1
        
        for month_prefix in sorted(month_prefixes.keys()):
            print(f"{month_prefix:<15} {month_prefixes[month_prefix]:>10} records")
        
        print("\n" + "="*80)
        print("DIAGNOSIS")
        print("="*80)
        
        null_months = sum(1 for m, _ in month_counts if m is None)
        total_records = sum(count for _, count in month_counts)
        
        if null_months > 0:
            print(f"⚠️  WARNING: {null_months} records have NULL month field!")
            print(f"   This means the month field is not being populated during upload.")
            print(f"   The date filter is using payment_date, but month filter expects the month field.")
        
        if len(month_prefixes) > 0:
            print(f"\n✓  Found {len(month_prefixes)} distinct months in payment_date field")
            print(f"   Date range: {min(month_prefixes.keys())} to {max(month_prefixes.keys())}")


if __name__ == "__main__":
    asyncio.run(check_dates())
