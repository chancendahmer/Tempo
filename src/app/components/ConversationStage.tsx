import Image from "next/image";

export function ConversationStage() {
  return (
    <div className="conversation-stage" aria-label="Examples of messages from Tempo">
      <div className="message message-left">
        You’ve got 35 minutes free.
        <br />
        Want to start the lab report
        <br />
        together?
      </div>
      <div className="message message-response">Open it with me</div>
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
        Free until 2:00.
        <br />
        Start the thing you’ve
        <br />
        been avoiding?
      </div>
    </div>
  );
}
