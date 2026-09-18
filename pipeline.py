import os
import json
import hashlib
from datetime import datetime
from typing import List, Optional
import psycopg2
from psycopg2.extras import Json
from pydantic import BaseModel, Field, ValidationError
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# Load Environment Variables (Assuming python-dotenv is used in a real env)
# from dotenv import load_dotenv
# load_dotenv()

# ==========================================
# 1. SCHEMA VALIDATION (Pydantic)
# ==========================================
class LineItem(BaseModel):
    product_desc: str
    quantity: float = 1.0
    unit_price: Optional[float] = None
    total_price: Optional[float] = None

class InvoiceSchema(BaseModel):
    vendor_name: str
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None # ISO Format YYYY-MM-DD
    total_amount: float
    tax_amount: Optional[float] = None
    line_items: List[LineItem] = Field(default_factory=list)

# ==========================================
# 2. EXTRACT (Ingestion)
# ==========================================
def extract_batch(directory_path: str) -> List[str]:
    """
    Simulates extracting unstructured invoice images/PDFs from an S3 bucket or local directory.
    Returns a list of file paths.
    """
    print(f"[EXTRACT] Reading files from {directory_path}...")
    # Mocking extraction of 3 files
    return ["invoice_001.jpg", "invoice_002.pdf", "invoice_003.jpg"]

# ==========================================
# 3. TRANSFORM (Processing & Validation)
# ==========================================
class AIServiceError(Exception):
    pass

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10),
    retry=retry_if_exception_type(AIServiceError)
)
def call_llm_api(file_path: str) -> dict:
    """
    Simulates calling an LLM (Gemini/Groq) to extract data.
    Throws AIServiceError randomly to demonstrate retry logic.
    """
    # Mock API Call response
    if "003" in file_path:
        # Simulate a bad response that fails Pydantic validation
        return {
            "vendor_name": "Bad Vendor",
            "total_amount": "three hundred dollars" # String instead of float
        }
        
    return {
        "vendor_name": "ABC Corp",
        "invoice_number": "INV-1001",
        "invoice_date": "2023-10-25",
        "total_amount": 1500.50,
        "tax_amount": 150.00,
        "line_items": [
            {"product_desc": "Laptop", "quantity": 1, "unit_price": 1000, "total_price": 1000},
            {"product_desc": "Monitor", "quantity": 2, "unit_price": 250, "total_price": 500}
        ]
    }

def transform_with_llm(file_path: str) -> InvoiceSchema:
    """
    Applies AI-driven transformation and enforces strict schema validation.
    """
    print(f"[TRANSFORM] Processing {file_path} with LLM...")
    try:
        raw_data = call_llm_api(file_path)
        # Validate and parse with Pydantic
        validated_data = InvoiceSchema(**raw_data)
        return validated_data
    except ValidationError as e:
        print(f"[TRANSFORM ERROR] Schema validation failed for {file_path}")
        raise e
    except AIServiceError as e:
        print(f"[TRANSFORM ERROR] AI API failed after retries for {file_path}")
        raise e

# ==========================================
# 4. LOAD (Destination with Idempotency)
# ==========================================
def generate_invoice_hash(file_path: str, data: InvoiceSchema) -> str:
    """
    Generates a unique fingerprint for the invoice to ensure idempotency.
    Using a composite hash of Vendor Name + Date + Total Amount.
    """
    composite_string = f"{data.vendor_name}_{data.invoice_date}_{data.total_amount}"
    return hashlib.md5(composite_string.encode('utf-8')).hexdigest()

def get_db_connection():
    """Mock DB connection - Replace with actual psycopg2.connect()"""
    # return psycopg2.connect(dsn=os.getenv("DATABASE_URL"))
    class MockCursor:
        def execute(self, query, vars=None):
            pass
        def fetchone(self):
            return (1,) # Mock vendor_id or invoice_id
        def close(self):
            pass
            
    class MockConn:
        def cursor(self):
            return MockCursor()
        def commit(self):
            pass
        def rollback(self):
            pass
        def close(self):
            pass
    return MockConn()

def load_to_postgres(file_path: str, data: InvoiceSchema):
    """
    Pushes structured data to PostgreSQL ensuring idempotency via UPSERT.
    """
    invoice_hash = generate_invoice_hash(file_path, data)
    print(f"[LOAD] Pushing {file_path} to staging DB. Hash: {invoice_hash}")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 1. UPSERT Vendor
        cursor.execute("""
            INSERT INTO vendors (vendor_name)
            VALUES (%s)
            ON CONFLICT (vendor_name) DO UPDATE SET vendor_name = EXCLUDED.vendor_name
            RETURNING vendor_id;
        """, (data.vendor_name,))
        vendor_id = cursor.fetchone()[0]
        
        # 2. UPSERT Invoice (Idempotent Operation)
        cursor.execute("""
            INSERT INTO invoices (vendor_id, invoice_hash, invoice_date, invoice_number, total_amount, tax_amount)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (invoice_hash) 
            DO UPDATE SET 
                total_amount = EXCLUDED.total_amount,
                tax_amount = EXCLUDED.tax_amount
            RETURNING invoice_id;
        """, (vendor_id, invoice_hash, data.invoice_date, data.invoice_number, data.total_amount, data.tax_amount))
        
        # If invoice_id is None, it means the record existed and we didn't return it on UPDATE 
        # (needs logic adjustment in real postgres to return always, but conceptually sound)
        invoice_id = cursor.fetchone()
        if invoice_id:
            invoice_id = invoice_id[0]
            # 3. Insert Line Items
            for item in data.line_items:
                cursor.execute("""
                    INSERT INTO line_items (invoice_id, product_desc, quantity, unit_price, total_price)
                    VALUES (%s, %s, %s, %s, %s)
                """, (invoice_id, item.product_desc, item.quantity, item.unit_price, item.total_price))
        
        conn.commit()
        print(f"[LOAD SUCCESS] Successfully loaded {file_path}")
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

def send_to_dlq(file_path: str, error_msg: str, raw_payload: str = None):
    """
    Writes failed processing attempts to the Dead Letter Queue.
    """
    print(f"[DLQ] Sending {file_path} to DLQ. Reason: {error_msg}")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO failed_invoices_dlq (file_name, error_type, error_message, raw_payload)
            VALUES (%s, %s, %s, %s)
        """, (file_path, "ProcessingError", error_msg, Json({"raw": raw_payload}) if raw_payload else None))
        conn.commit()
    except Exception as e:
        print(f"Failed to write to DLQ: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

# ==========================================
# 5. ORCHESTRATION (Main DAG)
# ==========================================
def run_pipeline():
    print("🚀 Starting Taxor ETL Pipeline...")
    files = extract_batch("./data/raw_invoices")
    
    for file in files:
        try:
            validated_data = transform_with_llm(file)
            load_to_postgres(file, validated_data)
        except ValidationError as e:
            # Handle bad AI output gracefully
            send_to_dlq(file, str(e))
        except Exception as e:
            # Handle unexpected errors
            send_to_dlq(file, str(e))
            
    print("✅ Pipeline batch execution completed.")

if __name__ == "__main__":
    run_pipeline()
