-- Taxor PostgreSQL Staging Database Schema
-- Focuses on Database Normalization (3NF) and Idempotency

-- -----------------------------------------------------------------------------
-- Table 1: vendors (3NF: Eliminates transitive dependencies on vendor details)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id SERIAL PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    UNIQUE (vendor_name)
);

-- -----------------------------------------------------------------------------
-- Table 2: invoices (2NF/3NF: Depends entirely on invoice_id, relates to vendors)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    invoice_id SERIAL PRIMARY KEY,
    vendor_id INT NOT NULL,
    invoice_hash VARCHAR(64) NOT NULL UNIQUE, -- Idempotency fingerprint (MD5)
    invoice_date DATE,
    invoice_number VARCHAR(100),
    total_amount NUMERIC(15, 2),
    tax_amount NUMERIC(15, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE
);

-- Composite Index to optimize analytical queries (e.g., aggregation by vendor and date)
CREATE INDEX IF NOT EXISTS idx_vendor_date ON invoices(vendor_id, invoice_date);

-- -----------------------------------------------------------------------------
-- Table 3: line_items (1NF: Atomic values, no nested JSON arrays for line items)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS line_items (
    line_item_id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL,
    product_desc TEXT NOT NULL,
    quantity NUMERIC(10, 2) DEFAULT 1.0,
    unit_price NUMERIC(15, 2),
    total_price NUMERIC(15, 2),
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- Dead Letter Queue (DLQ): Fault tolerance for malformed or failed processing
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS failed_invoices_dlq (
    dlq_id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    raw_payload JSONB, -- Store raw text or failed JSON response from LLM
    failed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
