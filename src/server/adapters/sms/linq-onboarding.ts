import { z } from "zod";
import { requireEnv } from "../../config/env";
import { normalizeE164 } from "../../domain/phone";
import { LinqApiError } from "./linq-transport";

const availableNumberSchema = z.object({
  phone_number: z.string().min(1),
  vcf_url: z.url(),
});

export type LinqOnboardingAssignment = {
  phoneNumber: string;
  vcfUrl: string;
};

export class LinqOnboardingService {
  constructor(private readonly request: typeof fetch = fetch) {}

  async assignLine(recipient: string): Promise<LinqOnboardingAssignment> {
    const env = requireEnv(["LINQ_API_KEY"]);
    const url = new URL(`${env.LINQ_API_BASE_URL}/available_number`);
    url.searchParams.set("to", normalizeE164(recipient));
    const response = await this.request(url, {
      headers: { Authorization: `Bearer ${env.LINQ_API_KEY!}` },
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new LinqApiError(`Linq onboarding request failed with HTTP ${response.status}`, response.status);
    }
    const assignment = availableNumberSchema.parse(payload);
    return {
      phoneNumber: normalizeE164(assignment.phone_number),
      vcfUrl: assignment.vcf_url,
    };
  }
}
