import { PROTOCOL_VERSION, type CommandMessage, type ResultMessage } from "@meet-deck/protocol";

import { BridgeClient } from "./bridge/bridge-client";
import {
  isTrustedExtensionPageSender,
  validateMeetContentSender
} from "./bridge/sender-validation";
import { TabRegistry, type JoinedDocument } from "./bridge/tab-registry";
import {
  CONTENT_PORT_NAME,
  isContentToWorkerMessage,
  type ContentResultStatus,
  type MeetCommand
} from "./content/internal-protocol";
import {
  isExtensionRequest,
  type ExtensionError,
  type ExtensionRequest,
  type ExtensionResponse,
  type PublicBridgeStatus
} from "./shared/extension-messages";

const CONTENT_COMMAND_TIMEOUT_MS = 4_000;
const RECONNECT_ALARM = "meet-deck-bridge-reconnect-v1";
const RECONNECT_ALARM_DELAY_MINUTES = 0.5;

interface PendingContentCommand {
  readonly documentId: string;
  readonly resolve: (status: ContentResultStatus) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const registry = new TabRegistry();
const ports = new Map<string, chrome.runtime.Port>();
const pendingCommands = new Map<string, PendingContentCommand>();

const bridge = new BridgeClient({
  getMeetingState: () => registry.aggregate(),
  onCommand: routeCommand,
  onStatusChange: scheduleDurableReconnect
});

chrome.runtime.onConnect.addListener((port) => {
  const sender = validateMeetContentSender(port.sender, chrome.runtime.id);
  if (port.name !== CONTENT_PORT_NAME || sender === undefined) {
    port.disconnect();
    return;
  }

  const previous = ports.get(sender.documentId);
  if (previous !== undefined && previous !== port) {
    previous.disconnect();
  }
  ports.set(sender.documentId, port);
  registry.register(sender.documentId, sender.tabId, sender.windowId);
  // A newly connected document is intentionally unresolved until its first
  // state frame. Publish that fail-closed aggregate immediately so commands
  // cannot keep targeting a stale document during the hand-off.
  bridge.publishMeetingState();

  port.onMessage.addListener((message: unknown) => {
    if (!isContentToWorkerMessage(message)) {
      return;
    }

    if (message.kind === "meet.state") {
      if (registry.update(sender.documentId, message.revision, message.state)) {
        bridge.publishMeetingState();
      }
      return;
    }

    const pending = pendingCommands.get(message.id);
    if (pending === undefined || pending.documentId !== sender.documentId) {
      return;
    }
    pendingCommands.delete(message.id);
    clearTimeout(pending.timer);
    pending.resolve(message.status);
  });

  port.onDisconnect.addListener(() => {
    if (ports.get(sender.documentId) !== port) {
      return;
    }
    ports.delete(sender.documentId);
    registry.unregister(sender.documentId);
    for (const [id, pending] of pendingCommands) {
      if (pending.documentId === sender.documentId) {
        pendingCommands.delete(id);
        clearTimeout(pending.timer);
        pending.resolve("timeout");
      }
    }
    bridge.publishMeetingState();
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isTrustedExtensionPageSender(sender, chrome.runtime.id) || !isExtensionRequest(message)) {
    return false;
  }

  void handleExtensionRequest(message)
    .then(sendResponse)
    .catch(() => {
      const response: ExtensionResponse = {
        error: "request_failed",
        ok: false,
        status: publicStatus()
      };
      sendResponse(response);
    });
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void bridgeReady.then((ready) => {
    if (ready) {
      bridge.retryConnection();
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) {
    bridge.retryConnection();
  }
});

chrome.permissions.onRemoved.addListener((permissions) => {
  bridge.handleLoopbackPermissionRemoval(permissions.origins ?? []);
});

const bridgeReady = bridge.start().then(
  () => true,
  () => false
);

async function handleExtensionRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  if (!(await bridgeReady)) {
    return {
      error: "secure_storage_unavailable",
      ok: false,
      status: publicStatus()
    };
  }

  switch (request.kind) {
    case "bridge.connect":
      return bridge.resumeAfterPermissionGrant()
        ? { ok: true, status: publicStatus() }
        : { error: "not_paired", ok: false, status: publicStatus() };
    case "bridge.status.get":
      return { ok: true, status: publicStatus() };
    case "bridge.pair": {
      const success = await bridge.pair(request.code);
      return success
        ? { ok: true, status: publicStatus() }
        : { error: pairingError(publicStatus()), ok: false, status: publicStatus() };
    }
    case "bridge.pair.forget":
      await bridge.forgetPairing();
      return { ok: true, status: publicStatus() };
    case "bridge.port.set":
      await bridge.setPort(request.port);
      return { ok: true, status: publicStatus() };
  }
}

async function routeCommand(command: CommandMessage): Promise<ResultMessage> {
  const aggregate = registry.aggregate();
  const target = registry.singleJoinedDocument();

  if (target === undefined) {
    return result(
      command.id,
      aggregate.meetingMultiplicity === "multiple" ? "ambiguous_target" : "no_meeting"
    );
  }

  const targetPort = ports.get(target.documentId);
  if (targetPort === undefined) {
    return result(command.id, "no_meeting");
  }

  if (command.action === "meet.focus") {
    if (!(await focusDocument(target))) {
      return result(command.id, "blocked");
    }
    const targetFailure = revalidateCommandTarget(target, targetPort);
    return result(command.id, targetFailure ?? "ok");
  }

  if (command.action === "presentation.start") {
    if (!(await focusDocument(target))) {
      return result(command.id, "blocked");
    }
    const targetFailure = revalidateCommandTarget(target, targetPort);
    if (targetFailure !== undefined) {
      return result(command.id, targetFailure);
    }
  }

  const contentCommand = toContentCommand(command);
  const deadline = Date.now() + CONTENT_COMMAND_TIMEOUT_MS;
  const status = await new Promise<ContentResultStatus>((resolve) => {
    const timer = setTimeout(
      () => {
        const pending = pendingCommands.get(command.id);
        if (pending?.documentId === target.documentId) {
          pendingCommands.delete(command.id);
          resolve("timeout");
        }
      },
      Math.max(0, deadline - Date.now())
    );
    pendingCommands.set(command.id, { documentId: target.documentId, resolve, timer });
    try {
      targetPort.postMessage({ command: contentCommand, deadline, kind: "meet.command" });
    } catch {
      pendingCommands.delete(command.id);
      clearTimeout(timer);
      resolve("timeout");
    }
  });
  return result(command.id, status);
}

function revalidateCommandTarget(
  expected: JoinedDocument,
  expectedPort: chrome.runtime.Port
): "ambiguous_target" | "no_meeting" | undefined {
  const current = registry.singleJoinedDocument();
  if (
    current !== undefined &&
    current.documentId === expected.documentId &&
    current.tabId === expected.tabId &&
    current.windowId === expected.windowId &&
    ports.get(current.documentId) === expectedPort
  ) {
    return undefined;
  }
  return registry.aggregate().meetingMultiplicity === "multiple"
    ? "ambiguous_target"
    : "no_meeting";
}

function toContentCommand(command: CommandMessage): MeetCommand {
  switch (command.action) {
    case "microphone.set":
    case "camera.set":
    case "hand.set":
      return { action: command.action, id: command.id, value: command.value };
    case "presentation.start":
    case "presentation.stop":
      return { action: command.action, id: command.id };
    case "meet.focus":
      throw new Error("Focus commands are handled by the service worker");
  }
}

function result(id: string, status: ResultMessage["status"]): ResultMessage {
  return { v: PROTOCOL_VERSION, type: "result", id, status };
}

async function focusDocument(target: JoinedDocument): Promise<boolean> {
  try {
    await chrome.tabs.update(target.tabId, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}

function publicStatus(): PublicBridgeStatus {
  return bridge.status(registry.aggregate().meetingMultiplicity);
}

function scheduleDurableReconnect(): void {
  const status = publicStatus();
  if (
    status.connection === "disconnected" &&
    status.authentication === "pairing" &&
    status.problem === "bridge_unavailable"
  ) {
    void chrome.alarms.create(RECONNECT_ALARM, {
      delayInMinutes: RECONNECT_ALARM_DELAY_MINUTES
    });
    return;
  }
  void chrome.alarms.clear(RECONNECT_ALARM);
}

function pairingError(status: PublicBridgeStatus): ExtensionError {
  return status.problem ?? "bridge_unavailable";
}
