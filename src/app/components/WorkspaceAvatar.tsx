import Image from "next/image";

/** Use the source logo's aspect ratio at every UI size. */
export function WorkspaceAvatar({ size = 39 }: { size?: number }) {
  return <Image src="/images/tempo-avatar.png" alt="" width={1312} height={1199} sizes={`${size}px`} style={{ width: size, height: "auto" }} />;
}
