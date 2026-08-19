import Image from "next/image";
import Link from "next/link";

export function TempoMark() {
  return (
    <Link className="tempo-mark" href="/" aria-label="Tempo home">
      <span className="tempo-wordmark">Tempo</span>
      <Image
        className="tempo-mark-avatar"
        src="/images/tempo-avatar.png"
        alt=""
        width={56}
        height={52}
        priority
      />
    </Link>
  );
}
