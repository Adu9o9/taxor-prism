# Taxor Bill Eval - Master Specification

## Phase 1: Dataset & Ground Truth
- 10-15 Indian handwritten bills.
- Ground Truth (GT) JSON schema with normalized ISO 8601 dates.

## Phase 2: Hybrid Evaluator Strategy
- Numerical Fields (total_amount, tax_amount): Exact float comparison (0% margin for missing zeros).
- Vendor Names: Hybrid pipeline:
  1. Strip punctuation & business suffixes ("Pvt Ltd", "Store", "Traders").
  2. Jaro-Winkler similarity (threshold >= 0.85).
  3. Double Metaphone phonetic tie-breaker for gray zone (0.75 - 0.85).
- GSTIN: Regex matching `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`.

## Phase 3: Next.js Frontend & API
- App Router (`src/app/api/evaluate/route.ts`).
- Parallelized execution via `Promise.all()` to bypass timeout traps.
- Aceternity UI + Framer Motion loading states and side-by-side model comparison matrix.

## Phase 4: Zoho Books Integration
- OAuth / API mapping to `/expenses`.
- Hardcoded `Miscellaneous / Out of Pocket` `account_id`.
