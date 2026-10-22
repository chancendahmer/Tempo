import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), verify: vi.fn(), create: vi.fn(), signin: vi.fn(), consent: vi.fn(), existing: vi.fn(), optedOut: vi.fn(),
  policy: { PILOT_ADMISSION_MODE: "open" as "open" | "invite_only" | null, PILOT_INVITED_PHONES: [] as string[] | null } }));
vi.mock("@/server/config/env", () => ({ requireEnv: () => ({ DATABASE_URL: "test", FIELD_ENCRYPTION_KEY: "test", MESSAGING_PROVIDER: "sendblue", NODE_ENV: "test", ...mocks.policy }) }));
vi.mock("@/server/db/repositories/pilot-admission-repository", () => ({ PilotAdmissionRepository: class { isVerifiedExisting = mocks.existing; isOptedOut = mocks.optedOut; } }));
vi.mock("@/server/db/repositories/consent-repository", () => ({ DrizzleConsentRepository: class {} }));
vi.mock("@/server/domain/phone", async () => await import("../../../server/domain/phone"));
vi.mock("@/server/domain/pilot-admission", async () => await import("../../../server/domain/pilot-admission"));
vi.mock("@/server/domain/consent", async () => ({ ...await import("../../../server/domain/consent"), recordWebConsent: mocks.consent }));
vi.mock("@/server/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/db/repositories/operational-repository", () => ({ OperationalRepository: class { consumeRateLimit = async () => ({ allowed: true }); } }));
vi.mock("@/server/adapters/sms/linq-onboarding", () => ({ LinqOnboardingService: class {} }));
vi.mock("@/server/adapters/sms/sendblue-onboarding", () => ({ SendblueOnboardingService: class { prepareContact = mocks.prepare; requestVerification = mocks.verify; } }));
vi.mock("@/server/security/web-session", () => ({ WEB_SESSION_COOKIE: "tempo", WEB_SESSION_TTL_SECONDS: 1800, WebSessionService: class { create = mocks.create; createSignInRequest = mocks.signin; } }));
import { POST } from "./route";

describe("Sendblue signup routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.policy.PILOT_ADMISSION_MODE = "open";
    mocks.policy.PILOT_INVITED_PHONES = [];
    mocks.existing.mockResolvedValue(false);
    mocks.optedOut.mockResolvedValue(false);
    mocks.consent.mockResolvedValue({ userId: "demo" });
    mocks.create.mockResolvedValue({ token: "pending-browser", expiresAt: new Date("2027-01-01") });
    mocks.signin.mockResolvedValue({ token: "pending-link", expiresAt: new Date("2027-01-01") });
  });
  const request = () => new NextRequest("http://localhost/api/early-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ countryCode: "US", callingCode: "+1", areaCode: "415", subscriberNumber: "5550198", consent: true }) });
  it("returns the assigned shared line and requires inbound START without claiming a text was sent", async () => {
    mocks.prepare.mockResolvedValue({ phoneNumber: "+12025550111", verified: false, verificationMethod: "inbound" });
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect((await response.json()).onboarding).toMatchObject({ phoneNumber: "+12025550111", messageHref: "sms:+12025550111?body=START", verificationSent: false, alreadyVerified: false, signInLinkQueued: false });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.signin).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith("demo");
  });
  it("queues the existing-account link only for a provider-verified contact", async () => {
    mocks.prepare.mockResolvedValue({ phoneNumber: "+12025550111", verified: true, verificationMethod: "inbound" });
    const response = await POST(request());
    expect((await response.json()).onboarding).toMatchObject({ signInLinkQueued: true, verificationSent: false, alreadyVerified: true });
    expect(mocks.signin).toHaveBeenCalledWith("demo");
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("does not persist consent or make sessions after a provider route failure", async () => {
    mocks.prepare.mockRejectedValue(new Error("Invalid provider route"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([[], null])("rejects new/unverified accounts before provider or account side effects with closed invites (%j)", async phones => {
    mocks.policy.PILOT_ADMISSION_MODE = "invite_only";
    mocks.policy.PILOT_INVITED_PHONES = phones;
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("phone number on your invitation");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.signin).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("accepts an exact invited number", async () => {
    mocks.policy.PILOT_ADMISSION_MODE = "invite_only";
    mocks.policy.PILOT_INVITED_PHONES = ["+14155550198"];
    mocks.prepare.mockResolvedValue({ phoneNumber: "+12025550111", verified: false, verificationMethod: "inbound" });
    expect((await POST(request())).status).toBe(202);
    expect(mocks.prepare).toHaveBeenCalledWith("+14155550198");
    expect(mocks.existing).not.toHaveBeenCalled();
  });
  it("keeps verified existing sign-in available with malformed admission configuration", async () => {
    mocks.policy.PILOT_ADMISSION_MODE = null;
    mocks.policy.PILOT_INVITED_PHONES = null;
    mocks.existing.mockResolvedValue(true);
    mocks.prepare.mockResolvedValue({ phoneNumber: "+12025550111", verified: true, verificationMethod: "inbound" });
    expect((await POST(request())).status).toBe(202);
    expect(mocks.signin).toHaveBeenCalledWith("demo");
  });
  it("does not let a later invitation or website consent erase a prior SMS STOP", async () => {
    mocks.policy.PILOT_ADMISSION_MODE = "invite_only";
    mocks.policy.PILOT_INVITED_PHONES = ["+14155550198"];
    mocks.optedOut.mockResolvedValue(true);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("Reply START");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.signin).not.toHaveBeenCalled();
  });
});
