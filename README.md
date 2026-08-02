# Taxor Prism — Handwritten Bill Extraction & Model Evaluation Framework

**🚀 Live Interactive Demo:** [https://taxor-prism.vercel.app/](https://taxor-prism.vercel.app/)

Taxor Prism is an enterprise-grade evaluation framework and interactive web application designed to benchmark Vision LLMs on unstructured, handwritten Indian bills and sync validated expense entries directly into **Zoho Books**.

This project was built as a submission for the Taxor Software Engineering Internship screening task.

## 📌 Executive Summary & Architectural Recommendation (Step 6)

### 1. Handwritten Document Pipeline
* **Recommendation:** Deploy **Gemini 3.6 Flash**.
* **Justification:** Handwritten Indian shop bills feature heavy spatial noise, non-standard field alignment, regional language headers (Malayalam, Tamil, Hindi), and thermal paper fading. Gemini 3.6 Flash consistently achieved superior field precision on fuzzy vendor matching and 15-digit GSTIN validation. At **$0.007 per 100 bills**, the 15–20% extraction accuracy advantage over lighter models easily justifies the trivial operational cost compared to manual audit overhead or incorrect tax filings in accounting ledgers.

### 2. Digital vs. Handwritten Strategy
* **Recommendation:** Deploy a **Hybrid Router Pipeline**.
* **Justification:** Do **not** use a single model for both document types. Standard digital invoices (e.g., Swiggy, Uber, Amazon PDFs) exhibit clean layout structures and should be routed to **Gemini Flash-Lite** or **Qwen 3.6** ($0.00 cost under free tiers, high speed). A lightweight classifier should route low-contrast or handwritten physical receipts exclusively to **Gemini 3.6 Flash**.

### 3. Real-world API & Rate Limit Insights
* **Groq Schema Validation Failures:** Qwen 3.6 on Groq (`qwen/qwen3.6-27b`) occasionally failed JSON schema validation (`Status 400: json_validate_failed`) when reading heavily degraded cursive writing, as the model injected conversational preambles despite `response_format: { type: "json_object" }`.
* **Groq TPM Rate Constraints:** Groq enforces a strict limit of **8,000 Tokens Per Minute (TPM)** on its free tier. Because high-resolution vision prompts consume 2,000–3,000 tokens per call, multi-model evaluation required throttled queuing (e.g., 13-second inter-request pauses).

---

## 🎯 Evaluated Models (Step 2)

| Model Name | Host / Provider | Pricing (per 100 bills) | Primary Strengths | Primary Weaknesses |
| :--- | :--- | :--- | :--- | :--- |
| **Gemini 3.6 Flash** | Google AI Studio | **$0.007** (Retail) | Superior handwriting OCR, fuzzy matching, high GSTIN accuracy. | Slightly higher latency than Groq. |
| **Gemini 3.5 Flash-Lite** | Google AI Studio | **$0.000** (Free Tier) | Ultra-fast execution time (~1.2s per request). | Struggles with cursive vendor names. |
| **Qwen 3.6 27B** | Groq Cloud | **$0.000** (Free Tier) | Open-weights model hosted on LPUs. | Frequent 8k TPM rate limits & strict JSON validation failures. |

---

## 📊 Dataset & Evaluation Methodology (Steps 1 & 4)

### The Dataset
The framework evaluates against a local dataset of 15 redacted Indian handwritten bills (`/public/dataset`). These feature varied lighting, thermal paper degradation, and different handwriting styles. A strict `ground_truth.json` file serves as the benchmark baseline.

### The Evaluation Logic
Because LLMs return slightly varying string formats, a binary `===` check is insufficient. Each extracted field is scored using a custom algorithmic baseline:

1. **Vendor Name:** Evaluated using **Jaro-Winkler String Distance** ($\ge 0.85$ match threshold). This accounts for minor spelling variants or translation artifacts in shop names.
2. **Invoice Number:** Exact string matching (ignoring whitespace and casing).
3. **Date:** Standardized into `YYYY-MM-DD` before comparison to account for format variations (e.g., `12/04/26` vs `12 April 2026`).
4. **Total Amount & Tax Amount:** Normalized numeric float comparison. Missing zeros are penalized, but a tolerance threshold of $\pm 0.50$ INR is permitted for rounding artifacts.
5. **GSTIN:** Regex-validated 15-character alphanumeric format matching Indian state codes.

### Known Gaps & Limitations
* **Language Support:** Jaro-Winkler distance struggles if a model translates a vendor name from Malayalam/Hindi to English, whereas a native speaker would recognize them as identical. A future iteration should use cross-lingual embeddings for vendor matching.
* **Line-Item Extraction:** This pipeline currently extracts aggregate totals. Extracting individual handwritten line items (Qty, Rate, Item Name) requires complex bounding-box logic that exceeds this prototype's scope.

---

## 🛠️ Setup & Local Installation

### Prerequisites
* **Node.js**: v18.0 or higher
* **Package Manager**: `npm`

### 1. Clone Repository & Install Dependencies
```bash
git clone <your-repo-link-here>
cd taxor-prism
npm install
2. Configure Environment Variables
Create a .env.local file in the project root based on the provided .env.example:

Code snippet
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
ZOHO_CLIENT_ID=your_zoho_client_id
ZOHO_CLIENT_SECRET=your_zoho_client_secret
ZOHO_REFRESH_TOKEN=your_zoho_refresh_token
ZOHO_ORGANIZATION_ID=your_zoho_org_id
3. Run Development Server
Bash
npm run dev
Navigate to http://localhost:3000 to launch the Taxor Prism UI (Bonus Requirement).

Navigate to http://localhost:3000/benchmark to run the automated 15-bill evaluation suite.