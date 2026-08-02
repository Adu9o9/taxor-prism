// src/app/api/zoho/route.ts
import { NextResponse } from 'next/server';
import { pushExpenseToZoho } from '@/lib/zoho';

export async function POST(req: Request) {
  try {
    const extractedData = await req.json();

    if (!extractedData) {
      return NextResponse.json({ error: "No extraction data provided" }, { status: 400 });
    }

    const result = await pushExpenseToZoho(extractedData);

    if (result.code === 0) {
      return NextResponse.json({ 
        success: true, 
        expense_id: result.expense?.expense_id || "SUCCESS",
        message: "Expense created in Zoho Books!" 
      });
    } else {
      return NextResponse.json({ error: result.message || "Zoho API returned non-zero code" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Zoho API Route Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}