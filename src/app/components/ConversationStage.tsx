import Image from "next/image";

export function ConversationStage() {
  return (
    <figure>
      <div className="conversation-stage">
        <div className="message message-left">
          You’ve got 35 minutes free.
          <br />
          Want to outline your
          <br />
          lab report?
        </div>
        <div className="message message-response">Help me get started</div>
        <div className="mascot-wrap">
          <Image
            className="hero-mascot"
            src="/images/tempo-avatar.png"
            alt="Tempo, a small white robot with a glossy black face and teal eyes"
            width={250}
            height={229}
            priority
          />
        </div>
        <div className="message message-right">
          You planned a walk today.
          <br />
          Want to start with
          <br />
          five minutes?
        </div>
      </div>
      <figcaption className="eyebrow">Sample check-ins · available when enabled in the pilot</figcaption>
    </figure>
  );
}
