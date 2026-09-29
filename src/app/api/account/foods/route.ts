import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";
import { foodCatalog } from "@/server/db/repositories/food-catalog";
import { FoodProviderError } from "@/server/adapters/food/open-food-facts";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Log in to search foods." }, { status: 401, headers });
    const account = await new WebSessionService().findAccount(token);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Verify your account to search foods." }, { status: 401, headers });
    const products = await foodCatalog(account.userId, { term: request.nextUrl.searchParams.get("q") ?? undefined, barcode: request.nextUrl.searchParams.get("barcode") ?? undefined });
    return NextResponse.json({ products, source: "Open Food Facts", license: "ODbL" }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof FoodProviderError ? error.message : error instanceof z.ZodError ? "Enter a food name or a valid 8–14 digit barcode." : "Food search is unavailable. Try again, or add food manually." }, { status: error instanceof z.ZodError ? 400 : 503, headers });
  }
}
