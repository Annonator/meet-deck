import type { ContentMeetingState, ContentToWorkerMessage } from "./internal-protocol";

type StateMessage = Extract<ContentToWorkerMessage, { kind: "meet.state" }>;

export class ContentStatePublisher {
  #lastState = "";
  #revision = 0;
  #send: ((message: StateMessage) => void) | undefined;

  connect(send: (message: StateMessage) => void): void {
    this.#send = send;
    this.#lastState = "";
  }

  disconnect(): void {
    this.#send = undefined;
  }

  publish(state: ContentMeetingState): boolean {
    const serialized = JSON.stringify(state);
    if (serialized === this.#lastState || this.#send === undefined) {
      return false;
    }

    const revision = this.#revision + 1;
    try {
      this.#send({ kind: "meet.state", revision, state });
    } catch {
      return false;
    }
    this.#revision = revision;
    this.#lastState = serialized;
    return true;
  }
}
