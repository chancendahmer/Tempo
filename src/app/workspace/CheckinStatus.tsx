import Link from "next/link";
import type { CheckinAvailability } from "../../server/domain/checkin-availability";
import s from "./workspace.module.css";

export function CheckinStatus({ status, preview }: { status?: CheckinAvailability; preview: boolean }) {
  if (preview) return <p className={s.finePrint}>Preview only · no texts are sent. In your account, this area shows whether check-ins are available and what setup remains.</p>;
  if (!status) return <p className={s.finePrint} role="status">Checking delivery availability. Your preference alone does not guarantee a message.</p>;
  return <div role="status"><p><strong>{status.title}</strong></p><p className={s.finePrint}>{status.detail}</p>{status.state === "calendar" && <Link className={s.textButton} href="/extensions">Open connections →</Link>}</div>;
}
