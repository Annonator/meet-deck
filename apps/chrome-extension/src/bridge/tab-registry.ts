import { PROTOCOL_VERSION, type MeetingStateMessage } from "@meet-deck/protocol";

import type { ContentMeetingState } from "../content/internal-protocol";

interface DocumentEntry {
  readonly documentId: string;
  readonly tabId: number;
  readonly windowId: number;
  revision: number;
  state?: ContentMeetingState;
}

type ReportedDocumentEntry = DocumentEntry & { readonly state: ContentMeetingState };

export interface JoinedDocument {
  readonly documentId: string;
  readonly tabId: number;
  readonly windowId: number;
}

export class TabRegistry {
  readonly #entries = new Map<string, DocumentEntry>();

  register(documentId: string, tabId: number, windowId: number): void {
    for (const [existingDocumentId, entry] of this.#entries) {
      if (entry.tabId === tabId && existingDocumentId !== documentId) {
        this.#entries.delete(existingDocumentId);
      }
    }

    this.#entries.set(documentId, {
      documentId,
      revision: 0,
      tabId,
      windowId
    });
  }

  unregister(documentId: string): void {
    this.#entries.delete(documentId);
  }

  update(documentId: string, revision: number, state: ContentMeetingState): boolean {
    const entry = this.#entries.get(documentId);
    if (entry === undefined || revision <= entry.revision) {
      return false;
    }

    entry.revision = revision;
    entry.state = state;
    return true;
  }

  aggregate(): MeetingStateMessage {
    const joined = this.#joinedEntries();
    const hasUnreportedDocument = this.#hasUnreportedDocument();
    if (joined.length !== 1 || hasUnreportedDocument) {
      return {
        v: PROTOCOL_VERSION,
        type: "state",
        meetingMultiplicity: joined.length === 0 ? "none" : "multiple",
        camera: "unknown",
        hand: "unknown",
        microphone: "unknown",
        selfPresentation: "unknown"
      };
    }

    const [entry] = joined;
    if (entry === undefined) {
      throw new Error("Unreachable single-meeting registry state");
    }
    return {
      v: PROTOCOL_VERSION,
      type: "state",
      meetingMultiplicity: "one",
      camera: entry.state.camera,
      hand: entry.state.hand,
      microphone: entry.state.microphone,
      selfPresentation: entry.state.selfPresentation
    };
  }

  singleJoinedDocument(): JoinedDocument | undefined {
    if (this.#hasUnreportedDocument()) {
      return undefined;
    }
    const joined = this.#joinedEntries();
    const entry = joined.length === 1 ? joined[0] : undefined;
    return entry === undefined
      ? undefined
      : { documentId: entry.documentId, tabId: entry.tabId, windowId: entry.windowId };
  }

  #joinedEntries(): ReportedDocumentEntry[] {
    return Array.from(this.#entries.values()).filter(
      (entry): entry is ReportedDocumentEntry => entry.state?.joined === true
    );
  }

  #hasUnreportedDocument(): boolean {
    return Array.from(this.#entries.values()).some((entry) => entry.state === undefined);
  }
}
