import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireEnv } from "@/server/config/env";

export const dynamic = "force-dynamic";

function foldVcardLine(line: string): string {
  const chunks = line.match(/.{1,74}/g) ?? [line];
  return chunks.join("\r\n ");
}

export async function GET() {
  const env = requireEnv(["APP_BASE_URL", "SENDBLUE_PHONE_NUMBER"]);
  const photo = await readFile(path.join(process.cwd(), "public", "images", "tempo-avatar.png"));
  const photoLine = foldVcardLine(`PHOTO;ENCODING=b;TYPE=PNG:${photo.toString("base64")}`);
  const vcard = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:;Tempo;;;",
    "FN:Tempo",
    "ORG:Tempo",
    `TEL;TYPE=CELL:${env.SENDBLUE_PHONE_NUMBER}`,
    `URL:${env.APP_BASE_URL}`,
    "NOTE:Your AI accountability partner. Reply STOP to opt out or HELP for help.",
    photoLine,
    "END:VCARD",
    "",
  ].join("\r\n");

  return new NextResponse(vcard, {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": 'inline; filename="Tempo.vcf"',
      "cache-control": "public, max-age=3600",
    },
  });
}
