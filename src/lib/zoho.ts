// src/lib/zoho.ts

export interface ExtractedBillData {
  vendor_name?: string;
  invoice_number?: string;
  date?: string;
  total_amount?: number;
  tax_amount?: number;
  gstin?: string;
}

export async function pushExpenseToZoho(data: any) {
  // Extract target fields whether nested or direct
  const extraction: ExtractedBillData = data?.extracted || data || {};

  const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID!;
  const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET!;
  const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN!;
  const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID!;
  const EXPENSE_ACCOUNT_ID = process.env.EXPENSE_ACCOUNT_ID!;

  if (!ZOHO_CLIENT_ID || !ZOHO_REFRESH_TOKEN) {
    throw new Error("Zoho credentials missing in process.env");
  }

  // 1. Fetch fresh access token
  const tokenRes = await fetch(
    `https://accounts.zoho.in/oauth/v2/token?refresh_token=${ZOHO_REFRESH_TOKEN}&client_id=${ZOHO_CLIENT_ID}&client_secret=${ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
    { method: 'POST' }
  );

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Token Exchange Failed: ${errorText}`);
  }

  const { access_token } = await tokenRes.json();

  // 2. Format JSON payload for Zoho Books
  const formattedDate = extraction.date && /^\d{4}-\d{2}-\d{2}$/.test(extraction.date) 
    ? extraction.date 
    : new Date().toISOString().split('T')[0];

  const expensePayload = {
    account_id: EXPENSE_ACCOUNT_ID,
    date: formattedDate,
    amount: typeof extraction.total_amount === 'number' ? extraction.total_amount : Number(extraction.total_amount) || 0,
    reference_number: extraction.invoice_number || "N/A",
    description: `Vendor: ${extraction.vendor_name || 'Unknown'} | GSTIN: ${extraction.gstin || 'N/A'}`,
  };

  // 3. Post to Zoho Books API
  const expenseRes = await fetch(`https://www.zohoapis.in/books/v3/expenses?organization_id=${ZOHO_ORG_ID}`, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(expensePayload)
  });

  return await expenseRes.json();
}