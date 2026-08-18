import { executeMeetCommand } from "./content/command-executor";
import { ContentCommandScheduler } from "./content/command-scheduler";
import { inspectMeetDom } from "./content/dom-adapter";
import { observeMeetDom } from "./content/dom-observer";
import {
  CONTENT_PORT_NAME,
  isWorkerToContentMessage,
  type ContentMeetingState,
  type ContentToWorkerMessage
} from "./content/internal-protocol";
import { ContentStatePublisher } from "./content/state-publisher";

const RECONNECT_DELAY_MS = 750;

let port: chrome.runtime.Port | undefined;
let updateScheduled = false;
const statePublisher = new ContentStatePublisher();
const commandScheduler = new ContentCommandScheduler({
  execute: executeMeetCommand,
  onAfterExecution: scheduleStateUpdate,
  postResult: post
});

function connect(): void {
  if (port !== undefined) {
    return;
  }

  const nextPort = chrome.runtime.connect({ name: CONTENT_PORT_NAME });
  port = nextPort;
  statePublisher.connect((message) => nextPort.postMessage(message));
  nextPort.onMessage.addListener((message: unknown) => {
    if (!isWorkerToContentMessage(message)) {
      return;
    }
    void commandScheduler.enqueue(message);
  });
  nextPort.onDisconnect.addListener(() => {
    if (port === nextPort) {
      port = undefined;
      statePublisher.disconnect();
      setTimeout(connect, RECONNECT_DELAY_MS);
    }
  });
  publishState(inspectMeetDom().state);
}

function scheduleStateUpdate(): void {
  if (updateScheduled) {
    return;
  }
  updateScheduled = true;
  queueMicrotask(() => {
    updateScheduled = false;
    publishState(inspectMeetDom().state);
  });
}

function publishState(state: ContentMeetingState): void {
  statePublisher.publish(state);
}

function post(message: ContentToWorkerMessage): boolean {
  if (port === undefined) {
    return false;
  }
  try {
    port.postMessage(message);
    return true;
  } catch {
    // A disconnected port is retried by onDisconnect; no meeting data is logged.
    return false;
  }
}

observeMeetDom(document.documentElement, scheduleStateUpdate);

connect();
