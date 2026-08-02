import dotenv from 'dotenv';
import path from 'path';

// Explicitly load variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID!;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET!;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN!;
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID!;
const EXPENSE_ACCOUNT_ID = process.env.EXPENSE_ACCOUNT_ID!;

// Simulated output from Gemini 3.6 Flash pipeline
const geminiExtraction = {
  vendor_name: "Sri Krishna Bakery",
  invoice_number: "INV-442",
  date: "2026-07-28", // YYYY-MM-DD
  total_amount: 450.50,
  tax_amount: 22.50,
  gstin: "32XXXXX1234X1Z5"
};

async function pushExpenseToZoho() {
  try {
    console.log("1. Fetching fresh Zoho Access Token...");
    const tokenRes = await fetch(
      `https://accounts.zoho.in/oauth/v2/token?refresh_token=${ZOHO_REFRESH_TOKEN}&client_id=${ZOHO_CLIENT_ID}&client_secret=${ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
      { method: 'POST' }
    );
    
    if (!tokenRes.ok) throw new Error("Failed to get Access Token");
    const { access_token } = await tokenRes.json();

    console.log("2. Formatting Gemini data for Zoho Books schema...");
    const expensePayload = {
      account_id: EXPENSE_ACCOUNT_ID,
      date: geminiExtraction.date,
      amount: geminiExtraction.total_amount,
      reference_number: geminiExtraction.invoice_number,
      description: `Vendor: ${geminiExtraction.vendor_name} | GSTIN: ${geminiExtraction.gstin}`, 
    };

    console.log("3. Pushing expense to Zoho Books...");
    const expenseRes = await fetch(`https://www.zohoapis.in/books/v3/expenses?organization_id=${ZOHO_ORG_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(expensePayload)
    });

    const expenseData = await expenseRes.json();

    if (expenseData.code === 0) {
      console.log("✅ Success! Expense created in Zoho Books.");
      console.log(`Expense ID: ${expenseData.expense.expense_id}`);
    } else {
      console.error("❌ Zoho API Error:", expenseData.message);
    }

  } catch (error) {
    console.error("Pipeline Failed:", error);
  }
}

pushExpenseToZoho();