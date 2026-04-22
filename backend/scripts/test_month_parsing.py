"""
Test script to verify that the month field is being parsed correctly from Excel.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.schemas.upload import PaymentRecordIn

# Simulate parsing a row from Excel
def test_month_parsing():
    # Simulate the column mapping
    headers = ["Bank", "leads_result_amount", "date_created", "debtor_id", "TAGGING", "ENVIRONMENT", "MONTH"]
    row_values = ["MBTC P1", 4000.00, "01/12/2026", "2352168", "GHOST PAYMENT", "ENV1", "JANUARY"]
    
    # This simulates what _resolve_columns and _row_to_record do
    from app.utils.file_parser import _resolve_columns, _row_to_record, _format_date
    
    # Test date parsing
    print("Testing Date Parsing:")
    test_dates = [
        "01/12/2026",  # MM/DD/YYYY
        "1/12/2026",   # M/D/YYYY
        "12/01/2026",  # MM/DD/YYYY
        "02/15/2026",  # MM/DD/YYYY
        "2026-01-12",  # YYYY-MM-DD
        45678,         # Excel serial number
    ]
    
    for test_date in test_dates:
        result = _format_date(test_date)
        print(f"  {str(test_date):20} -> {result}")
    
    print("\n" + "="*60)
    
    col_map = _resolve_columns(headers)
    print("\nColumn Mapping:")
    for field, idx in col_map.items():
        if idx is not None:
            print(f"  {field:20} -> column {idx:2} ({headers[idx]})")
        else:
            print(f"  {field:20} -> NOT FOUND")
    
    record = _row_to_record(row_values, col_map)
    
    print("\nParsed Record:")
    print(f"  bank:           {record.bank}")
    print(f"  account:        {record.account}")
    print(f"  touchpoint:     {record.touchpoint}")
    print(f"  payment_date:   {record.payment_date}")
    print(f"  payment_amount: {record.payment_amount}")
    print(f"  environment:    {record.environment}")
    print(f"  month:          {record.month}")
    
    # Verify
    assert record.bank == "MBTC P1", f"Expected bank='MBTC P1', got '{record.bank}'"
    assert record.account == "2352168", f"Expected account='2352168', got '{record.account}'"
    assert record.touchpoint == "GHOST PAYMENT", f"Expected touchpoint='GHOST PAYMENT', got '{record.touchpoint}'"
    assert record.payment_date == "2026-01-12", f"Expected payment_date='2026-01-12', got '{record.payment_date}'"
    assert record.payment_amount == 4000.00, f"Expected payment_amount=4000.00, got {record.payment_amount}"
    assert record.environment == "ENV1", f"Expected environment='ENV1', got '{record.environment}'"
    assert record.month == "JANUARY", f"Expected month='JANUARY', got '{record.month}'"
    
    print("\n✓ All assertions passed!")
    print("\nConclusion:")
    print("  - date_created '01/12/2026' is correctly parsed to '2026-01-12'")
    print("  - MONTH column is correctly mapped to month field")
    print("  - Date filter will use payment_date (2026-01-12)")
    print("  - Month filter will use month (JANUARY)")
    print("\nIMPORTANT:")
    print("  - You need to RE-UPLOAD your Excel file for the fix to take effect")
    print("  - Existing data in the database still has incorrect dates")

if __name__ == "__main__":
    test_month_parsing()
