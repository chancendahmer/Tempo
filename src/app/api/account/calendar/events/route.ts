import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CalendarAssistantIntegrations } from "@/server/adapters/calendar/calendar-assistant";
import { WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";
import { OperationalRepository } from "@/server/db/repositories/operational-repository";
import { CalendarAuthorizationError } from "@/server/adapters/calendar/calendar-provider";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Log in to view your calendar." }, { status: 401, headers });
    const account = await new WebSessionService().findAccount(token);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Verify your account first." }, { status: 401, headers });
    const query = z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).parse(Object.fromEntries(request.nextUrl.searchParams));
    const limit = await new OperationalRepository().consumeRateLimit({ key: `calendar-ui:${account.userId}`, limit: 30, windowMs: 60000 });
    if (!limit.allowed) return NextResponse.json({ error: "Please wait a moment before refreshing your calendar." }, { status: 429, headers });
    const agenda = await new CalendarAssistantIntegrations().agenda(account.userId, query.start, query.end);
    return NextResponse.json({ ...JSON.parse(agenda), fetchedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    if (error instanceof CalendarAuthorizationError) return NextResponse.json({ code: "calendar_reauth_required", error: "Google Calendar access needs to be renewed. Reconnect Google Calendar to see current events." }, { status: 409, headers });
    return NextResponse.json({ error: error instanceof z.ZodError ? "Choose a valid calendar range." : "Google Calendar couldn’t be refreshed. Check your connection in Extensions, then try again." }, { status: error instanceof z.ZodError ? 400 : 503, headers });
  }
}
