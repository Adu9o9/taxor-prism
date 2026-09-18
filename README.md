# Taxor — Fault-Tolerant ETL Pipeline

**🚀 Live Interactive Demo:** [https://taxor-prism.vercel.app/](https://taxor-prism.vercel.app/)

Taxor is an enterprise-grade, end-to-end Python ETL pipeline that ingests unstructured image data, applies AI-driven transformation, enforces schema validation via Pydantic, and handles idempotency through MD5 hashing in PostgreSQL.

This project goes beyond simple API wrappers to address real-world data engineering challenges: **fault tolerance, idempotency, database normalization, and failure recovery.**

---

## 🏗️ Architecture: Extract, Transform, Load

### 1. Extract (Ingestion)
The pipeline begins by ingesting batches of unstructured, highly-variable handwritten Indian shop bills (images/PDFs) from local directories (simulating S3 bucket ingestion). 

### 2. Transform (Processing & Validation)
Unstructured data is processed using **Gemini 3.6 Flash** or **Qwen 3.6**. Crucially, the AI's output is never blindly trusted. 
* **Schema Enforcement:** The raw JSON is passed through strict **Pydantic** validation models. If the AI hallucinates string types for numeric fields, the schema validator catches it immediately.
* **Fault Tolerance:** AI calls and API interactions are wrapped using the **Tenacity** library to implement Exponential Backoff retries, ensuring transient network errors do not crash the pipeline.
* **Dead Letter Queue (DLQ):** If an invoice fails Pydantic validation or exceeds retry limits, it is caught as an exception and gracefully routed to a PostgreSQL `failed_invoices_dlq` table for human review, allowing the batch to continue seamlessly.

### 3. Load (Destination & Idempotency)
Clean, structured data is loaded into a **PostgreSQL** staging database.
* **Database Normalization:** The data is stored across 3NF compliant tables (`vendors`, `invoices`, `line_items`), completely avoiding JSON-blob anti-patterns.
* **Idempotency (MD5 Hashing):** An MD5 hash fingerprint is generated for every invoice (`Vendor_Name + Invoice_Date + Total_Amount`). An Upsert (`INSERT ... ON CONFLICT`) strategy is used in PostgreSQL. This guarantees that if the pipeline fails mid-execution and restarts, previously processed invoices are safely updated or ignored, completely eliminating duplicate database entries.

---

## 🗄️ Database Schema & Normalization

Our `schema.sql` enforces data integrity:

* **1NF:** Line items are stored as atomic records, not nested arrays.
* **3NF:** Vendor details are decoupled into a dedicated `vendors` table.
* **Indexing:** Composite indexes on `vendor_id` and `invoice_date` optimize downstream analytical queries.

---

## 🛠️ Setup & Installation

### Prerequisites
* **Python 3.10+**
* **PostgreSQL**
* **Node.js 18+** (For the interactive Next.js Dashboard)

### Python ETL Setup
```bash
git clone <your-repo-link-here>
cd taxor-bill-eval

# Install Data Engineering dependencies
pip install -r requirements.txt

# Run the ETL Pipeline
python pipeline.py
```

### Next.js Dashboard (Optional)
```bash
npm install
npm run dev
```

---

## 🔌 Downstream Sync (Zoho Books API)

Once validated in the PostgreSQL staging layer, clean records can be synced to Zoho Books via OAuth 2.0 to turn extracted receipt data into verified accounting entries.