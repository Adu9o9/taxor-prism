import jaroWinkler from 'jaro-winkler';
import { doubleMetaphone } from 'double-metaphone';

// 1. Define the Ground Truth Schema
export interface InvoiceData {
  vendor_name: string;
  invoice_number: string;
  date: string; // ISO 8601 YYYY-MM-DD
  total_amount: number;
  tax_amount: number;
  gstin: string;
}

export interface EvaluationResult {
  score: number;
  isMatch: boolean;
  details: string;
}

// 2. Vendor Name Hybrid Matcher
const normalizeVendorName = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Strip punctuation
    .replace(/\b(pvt|ltd|private|limited|inc|corp|co|llc)\b/g, '') // Strip legal suffixes
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
};

export const evaluateVendorName = (extracted: string, truth: string): EvaluationResult => {
  const normExtracted = normalizeVendorName(extracted);
  const normTruth = normalizeVendorName(truth);

  // Check 1: Exact string match after normalization
  if (normExtracted === normTruth) {
    return { score: 1, isMatch: true, details: "Exact match (Normalized)" };
  }

  // Check 2: Phonetic Match via Double Metaphone (handles "Sri" vs "Sree")
  const [exMeta1, exMeta2] = doubleMetaphone(normExtracted);
  const [trMeta1, trMeta2] = doubleMetaphone(normTruth);
  
  const metaphoneMatch = 
    (exMeta1 && (exMeta1 === trMeta1 || exMeta1 === trMeta2)) || 
    (exMeta2 && (exMeta2 === trMeta1 || exMeta2 === trMeta2));

  if (metaphoneMatch) {
    return { score: 1, isMatch: true, details: "Phonetic match (Double Metaphone)" };
  }

  // Check 3: Jaro-Winkler Fuzzy Match (Threshold > 0.88)
  const jwScore = jaroWinkler(normExtracted, normTruth);
  if (jwScore > 0.88) {
    return { score: jwScore, isMatch: true, details: `Fuzzy match (Jaro-Winkler: ${jwScore.toFixed(2)})` };
  }

  return { score: jwScore, isMatch: false, details: `No match (Jaro-Winkler: ${jwScore.toFixed(2)})` };
};

// 3. Strict Float Matcher (0% Tolerance)
export const evaluateFloat = (extracted: any, truth: number): EvaluationResult => {
  const extNum = parseFloat(extracted);
  if (isNaN(extNum)) return { score: 0, isMatch: false, details: "Invalid number format" };
  
  // Forces exactly 2 decimal places for comparison (e.g., 1500.50 === 1500.50)
  const isMatch = extNum.toFixed(2) === truth.toFixed(2);
  return { 
    score: isMatch ? 1 : 0, 
    isMatch, 
    details: isMatch ? "Exact float match" : `Mismatch: expected ${truth}, got ${extNum}`
  };
};

// 4. Strict Date & Regex Matchers
export const evaluateDate = (extracted: string, truth: string): EvaluationResult => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(extracted)) {
    return { score: 0, isMatch: false, details: "Invalid format. Expected YYYY-MM-DD" };
  }
  const isMatch = extracted === truth;
  return { score: isMatch ? 1 : 0, isMatch, details: isMatch ? "Exact date match" : "Date mismatch" };
};

export const evaluateGSTIN = (extracted: string, truth: string): EvaluationResult => {
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(extracted)) {
    return { score: 0, isMatch: false, details: "Fails standard GSTIN regex format" };
  }
  const isMatch = extracted === truth;
  return { score: isMatch ? 1 : 0, isMatch, details: isMatch ? "Exact GSTIN match" : "GSTIN mismatch" };
};

// 5. Core Pipeline execution
export const evaluateExtraction = (extractedData: Partial<InvoiceData>, groundTruth: InvoiceData) => {
  const results = {
    vendor_name: evaluateVendorName(extractedData.vendor_name || "", groundTruth.vendor_name),
    invoice_number: { 
        isMatch: extractedData.invoice_number === groundTruth.invoice_number,
        details: extractedData.invoice_number === groundTruth.invoice_number ? "Exact match" : "Mismatch"
    },
    date: evaluateDate(extractedData.date || "", groundTruth.date),
    total_amount: evaluateFloat(extractedData.total_amount, groundTruth.total_amount),
    tax_amount: evaluateFloat(extractedData.tax_amount, groundTruth.tax_amount),
    gstin: evaluateGSTIN(extractedData.gstin || "", groundTruth.gstin)
  };

  const totalFields = Object.keys(results).length;
  const passedFields = Object.values(results).filter(r => r.isMatch).length;
  
  return {
    accuracy_score: ((passedFields / totalFields) * 100).toFixed(1) + "%",
    passed: passedFields,
    total: totalFields,
    field_breakdown: results
  };
};