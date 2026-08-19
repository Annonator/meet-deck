import { describe, expect, it } from "vitest";

import {
  AUTH_RESULT_STATUSES,
  COMMAND_ACTIONS,
  MAX_MESSAGE_BYTES,
  MEETING_MULTIPLICITIES,
  PAIR_REJECTION_REASONS,
  PROTOCOL_VERSION,
  ProtectedMessageReplayGuard,
  ProtocolValidationError,
  RESULT_STATUSES,
  TRANSPORT_DIRECTIONS,
  canonicalizeAuthProofInput,
  canonicalizeProtectedMessageMacInput,
  canonicalizeSessionKeyInfo,
  canonicalizeSessionKeySalt,
  encodeAuthProofInput,
  encodeProtectedMessageMacInput,
  encodeSessionKeyInfo,
  encodeSessionKeySalt,
  isApplicationMessage,
  isAuthBinding,
  isAuthMessage,
  isCommandMessage,
  isMeetingStateMessage,
  isNewerSequence,
  isPairingCode,
  isPairingMessage,
  isProtectedMacInput,
  isProtectedMessage,
  isProtocolMessage,
  isResultMessage,
  parseProtocolMessage,
  safeParseProtocolMessage,
  serializeProtocolMessage,
  type ApplicationMessage,
  type AuthBinding,
  type MeetingStateMessage,
  type ProtectedMacInput,
  type ProtectedMessage
} from "../src/index.js";

const clientNonce = "A".repeat(43);
const serverNonce = `${"B".repeat(42)}A`;
const mac = `${"C".repeat(42)}A`;
const token = `${"D".repeat(42)}A`;
const session = `${"S".repeat(42)}A`;
const origin = `chrome-extension://${"a".repeat(32)}`;
const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const validBase64Url256FinalCharacters = "AEIMQUYcgkosw048";

function validBinding(): AuthBinding {
  return {
    session,
    clientNonce,
    serverNonce,
    origin,
    clientRole: "extension",
    serverRole: "plugin"
  };
}

function validState(): MeetingStateMessage {
  return {
    v: 1,
    type: "state",
    meetingMultiplicity: "one",
    microphone: "off",
    camera: "on",
    hand: "lowered",
    selfPresentation: "inactive"
  };
}

function protectedFrame(message: ApplicationMessage = validState(), seq = 1): ProtectedMessage {
  return {
    v: 1,
    type: "protected",
    session,
    direction: message.type === "command" ? "plugin_to_extension" : "extension_to_plugin",
    seq,
    message,
    mac
  };
}

function macInput(frame: ProtectedMessage): ProtectedMacInput {
  return {
    v: frame.v,
    type: frame.type,
    session: frame.session,
    direction: frame.direction,
    seq: frame.seq,
    message: frame.message
  };
}

describe("protocol constants", () => {
  it("pins the wire contract", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(MAX_MESSAGE_BYTES).toBe(16_384);
    expect(COMMAND_ACTIONS).toEqual([
      "microphone.set",
      "camera.set",
      "hand.set",
      "presentation.start",
      "presentation.stop",
      "meet.focus"
    ]);
    expect(RESULT_STATUSES).toEqual([
      "ok",
      "noop",
      "no_meeting",
      "ambiguous_target",
      "unsupported_ui",
      "blocked",
      "timeout",
      "needs_user_action"
    ]);
    expect(MEETING_MULTIPLICITIES).toEqual(["none", "one", "multiple"]);
    expect(TRANSPORT_DIRECTIONS).toEqual(["extension_to_plugin", "plugin_to_extension"]);
    expect(AUTH_RESULT_STATUSES).toEqual(["ok", "invalid"]);
  });
});

describe("application messages", () => {
  it.each([
    { action: "microphone.set", value: true },
    { action: "camera.set", value: false },
    { action: "hand.set", value: true }
  ] as const)("accepts $action with a boolean target", (command) => {
    expect(
      isCommandMessage({
        v: 1,
        type: "command",
        id: "command-1",
        ...command
      })
    ).toBe(true);
  });

  it.each(["presentation.start", "presentation.stop", "meet.focus"] as const)(
    "accepts %s without a value",
    (action) => {
      expect(isCommandMessage({ v: 1, type: "command", id: "command-1", action })).toBe(true);
    }
  );

  it("rejects bad action shapes and unknown fields", () => {
    expect(
      isCommandMessage({
        v: 1,
        type: "command",
        id: "command-1",
        action: "camera.set"
      })
    ).toBe(false);
    expect(
      isCommandMessage({
        v: 1,
        type: "command",
        id: "command-1",
        action: "meet.focus",
        value: true
      })
    ).toBe(false);
    expect(
      isCommandMessage({
        v: 1,
        type: "command",
        id: "command-1",
        action: "meet.focus",
        meetingUrl: "https://meet.google.com/secret"
      })
    ).toBe(false);
  });

  it("accepts the renamed privacy-minimised state", () => {
    expect(isMeetingStateMessage(validState())).toBe(true);
    for (const meetingMultiplicity of MEETING_MULTIPLICITIES) {
      expect(isMeetingStateMessage({ ...validState(), meetingMultiplicity })).toBe(true);
    }
  });

  it("rejects legacy, sensitive, and unknown state fields", () => {
    expect(
      isMeetingStateMessage({
        ...validState(),
        joinedCount: 1
      })
    ).toBe(false);
    expect(
      isMeetingStateMessage({
        ...validState(),
        presentation: "inactive"
      })
    ).toBe(false);
    for (const [field, value] of [
      ["meetingUrl", "https://meet.google.com/abc-defg-hij"],
      ["meetingCode", "abc-defg-hij"],
      ["meetingTitle", "Private planning"],
      ["participantName", "Example Person"],
      ["chat", "private message"],
      ["captions", "private caption"],
      ["account", "person@example.com"],
      ["authToken", "secret"]
    ] as const) {
      expect(isMeetingStateMessage({ ...validState(), [field]: value })).toBe(false);
    }
  });

  it.each(RESULT_STATUSES)("accepts result status %s", (status) => {
    expect(
      isResultMessage({
        v: 1,
        type: "result",
        id: "command-1",
        status
      })
    ).toBe(true);
  });

  it("does not accept raw application messages as wire frames", () => {
    expect(isApplicationMessage(validState())).toBe(true);
    expect(isProtocolMessage(validState())).toBe(false);
  });
});

describe("pairing and bound mutual authentication", () => {
  it("requires an eight-digit pairing code", () => {
    expect(isPairingCode("01234567")).toBe(true);
    expect(isPairingCode("1234567")).toBe(false);
    expect(isPairingCode("1234567a")).toBe(false);
    expect(isPairingMessage({ v: 1, type: "pair.request", code: "01234567" })).toBe(true);
  });

  it("accepts token issuance and bounded rejection reasons", () => {
    expect(isPairingMessage({ v: 1, type: "pair.granted", token })).toBe(true);
    for (const reason of PAIR_REJECTION_REASONS) {
      expect(isPairingMessage({ v: 1, type: "pair.rejected", reason })).toBe(true);
    }
    expect(isPairingMessage({ v: 1, type: "pair.granted", token: "too-short" })).toBe(false);
    expect(
      isPairingMessage({
        v: 1,
        type: "pair.granted",
        token: "D".repeat(43)
      })
    ).toBe(false);
  });

  it("accepts every canonical 256-bit base64url ending and rejects every non-canonical one", () => {
    for (const finalCharacter of validBase64Url256FinalCharacters) {
      expect(
        isPairingMessage({
          v: 1,
          type: "pair.granted",
          token: `${"D".repeat(42)}${finalCharacter}`
        })
      ).toBe(true);
    }

    const invalidFinalCharacters = [...base64UrlAlphabet].filter(
      (character) => !validBase64Url256FinalCharacters.includes(character)
    );
    expect(invalidFinalCharacters).toHaveLength(48);
    for (const finalCharacter of invalidFinalCharacters) {
      expect(
        isPairingMessage({
          v: 1,
          type: "pair.granted",
          token: `${"D".repeat(42)}${finalCharacter}`
        })
      ).toBe(false);
    }
  });

  it("validates a binding with both nonces, origin, roles, and session", () => {
    expect(isAuthBinding(validBinding())).toBe(true);
    expect(isAuthBinding({ ...validBinding(), origin: "https://meet.google.com" })).toBe(false);
    expect(isAuthBinding({ ...validBinding(), clientRole: "plugin" })).toBe(false);
    expect(isAuthBinding({ ...validBinding(), meetingCode: "secret" })).toBe(false);
  });

  it("validates hello, challenge, client proof, and server proof", () => {
    expect(
      isAuthMessage({
        v: 1,
        type: "auth.hello",
        clientNonce,
        origin,
        role: "extension"
      })
    ).toBe(true);
    expect(isAuthMessage({ v: 1, type: "auth.challenge", ...validBinding() })).toBe(true);
    expect(
      isAuthMessage({
        v: 1,
        type: "auth.response",
        ...validBinding(),
        hmac: mac
      })
    ).toBe(true);
    expect(
      isAuthMessage({
        v: 1,
        type: "auth.result",
        session,
        status: "ok",
        serverHmac: mac
      })
    ).toBe(true);
    expect(
      isAuthMessage({
        v: 1,
        type: "auth.result",
        session,
        status: "invalid"
      })
    ).toBe(true);
    expect(
      isAuthMessage({
        v: 1,
        type: "auth.result",
        session,
        status: "invalid",
        serverHmac: mac
      })
    ).toBe(false);
  });
});

describe("protected application frames", () => {
  it("accepts authenticated state and command envelopes", () => {
    expect(isProtectedMessage(protectedFrame())).toBe(true);
    expect(
      isProtectedMessage(
        protectedFrame({
          v: 1,
          type: "command",
          id: "command-1",
          action: "microphone.set",
          value: false
        })
      )
    ).toBe(true);
  });

  it("requires the role-appropriate direction", () => {
    expect(
      isProtectedMessage({
        ...protectedFrame(),
        direction: "plugin_to_extension"
      })
    ).toBe(false);
    const command = protectedFrame({
      v: 1,
      type: "command",
      id: "command-1",
      action: "meet.focus"
    });
    expect(isProtectedMessage({ ...command, direction: "extension_to_plugin" })).toBe(false);
  });

  it("requires positive safe sequences, a 256-bit MAC, and exact fields", () => {
    expect(isProtectedMessage({ ...protectedFrame(), seq: 0 })).toBe(false);
    expect(isProtectedMessage({ ...protectedFrame(), mac: "short" })).toBe(false);
    expect(isProtectedMessage({ ...protectedFrame(), meetingUrl: "secret" })).toBe(false);
    expect(isProtectedMacInput(macInput(protectedFrame()))).toBe(true);
  });

  it("rejects replay independently per session and direction after MAC checks", () => {
    const guard = new ProtectedMessageReplayGuard();
    expect(guard.acceptAuthenticated(protectedFrame(validState(), 1))).toBe(true);
    expect(guard.acceptAuthenticated(protectedFrame(validState(), 1))).toBe(false);
    expect(guard.acceptAuthenticated(protectedFrame(validState(), 3))).toBe(true);
    expect(guard.acceptAuthenticated(protectedFrame(validState(), 2))).toBe(false);
    expect(guard.highestAccepted(session, "extension_to_plugin")).toBe(3);

    const ping: ProtectedMessage = {
      ...protectedFrame({
        v: 1,
        type: "ping",
        nonce: "heartbeat_nonce_1"
      }),
      direction: "plugin_to_extension"
    };
    expect(guard.acceptAuthenticated(ping)).toBe(true);

    guard.resetSession(session);
    expect(guard.acceptAuthenticated(protectedFrame(validState(), 1))).toBe(true);
    guard.clear();
    expect(guard.highestAccepted(session, "extension_to_plugin")).toBeUndefined();
  });

  it("exposes a stateless monotonic sequence helper", () => {
    expect(isNewerSequence(1, undefined)).toBe(true);
    expect(isNewerSequence(2, 1)).toBe(true);
    expect(isNewerSequence(1, 1)).toBe(false);
    expect(isNewerSequence(0, undefined)).toBe(false);
  });
});

describe("canonical cryptographic inputs", () => {
  it("binds both nonces, origin, roles, session, and prover role", () => {
    const binding = validBinding();
    const challenge = { v: 1, type: "auth.challenge", ...binding } as const;
    expect(canonicalizeAuthProofInput(binding, "extension")).toBe(
      JSON.stringify([
        "meet-deck/auth-proof/v1",
        "extension",
        binding.session,
        binding.clientNonce,
        binding.serverNonce,
        binding.origin,
        binding.clientRole,
        binding.serverRole
      ])
    );
    expect(canonicalizeAuthProofInput(binding, "plugin")).not.toBe(
      canonicalizeAuthProofInput(binding, "extension")
    );
    expect(new TextDecoder().decode(encodeAuthProofInput(binding, "extension"))).toBe(
      canonicalizeAuthProofInput(binding, "extension")
    );
    expect(canonicalizeAuthProofInput(challenge, "extension")).toBe(
      canonicalizeAuthProofInput(binding, "extension")
    );
  });

  it("separates session key derivation by transport direction", () => {
    const binding = validBinding();
    const salt = canonicalizeSessionKeySalt(binding);
    expect(salt).toBe(
      JSON.stringify([
        "meet-deck/session-salt/v1",
        binding.session,
        binding.clientNonce,
        binding.serverNonce
      ])
    );
    expect(new TextDecoder().decode(encodeSessionKeySalt(binding))).toBe(salt);

    const clientToPlugin = canonicalizeSessionKeyInfo(binding, "extension_to_plugin");
    const pluginToClient = canonicalizeSessionKeyInfo(binding, "plugin_to_extension");
    expect(clientToPlugin).not.toBe(pluginToClient);
    expect(new TextDecoder().decode(encodeSessionKeyInfo(binding, "extension_to_plugin"))).toBe(
      clientToPlugin
    );
  });

  it("canonicalises protected payloads independently of object key order", () => {
    const input = macInput(protectedFrame());
    expect(canonicalizeProtectedMessageMacInput(input)).toBe(
      JSON.stringify([
        "meet-deck/protected-frame/v1",
        1,
        session,
        "extension_to_plugin",
        1,
        [1, "state", "one", "off", "on", "lowered", "inactive"]
      ])
    );
    expect(new TextDecoder().decode(encodeProtectedMessageMacInput(input))).toBe(
      canonicalizeProtectedMessageMacInput(input)
    );
    expect(canonicalizeProtectedMessageMacInput(protectedFrame())).toBe(
      canonicalizeProtectedMessageMacInput(input)
    );
  });

  it("rejects malformed values before producing cryptographic input", () => {
    expect(() =>
      canonicalizeAuthProofInput({ ...validBinding(), origin: "https://evil.invalid" }, "extension")
    ).toThrowError(ProtocolValidationError);
    expect(() =>
      canonicalizeProtectedMessageMacInput({ ...macInput(protectedFrame()), seq: 0 })
    ).toThrowError(ProtocolValidationError);
  });
});

describe("frame parsing", () => {
  it("parses protected text, Uint8Array, and ArrayBuffer frames", () => {
    const frame = protectedFrame();
    const json = JSON.stringify(frame);
    const bytes = new TextEncoder().encode(json);
    expect(parseProtocolMessage(json)).toEqual(frame);
    expect(parseProtocolMessage(bytes)).toEqual(frame);
    expect(
      parseProtocolMessage(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      )
    ).toEqual(frame);
  });

  it("round-trips every top-level message family", () => {
    const messages = [
      { v: 1, type: "pair.request", code: "01234567" },
      { v: 1, type: "pair.granted", token },
      { v: 1, type: "pair.rejected", reason: "invalid_code" },
      { v: 1, type: "auth.hello", clientNonce, origin, role: "extension" },
      { v: 1, type: "auth.challenge", ...validBinding() },
      { v: 1, type: "auth.response", ...validBinding(), hmac: mac },
      {
        v: 1,
        type: "auth.result",
        session,
        status: "ok",
        serverHmac: mac
      },
      protectedFrame()
    ] as const;

    for (const message of messages) {
      expect(parseProtocolMessage(serializeProtocolMessage(message))).toEqual(message);
    }
  });

  it("returns stable error categories without echoing input", () => {
    const invalidJson = safeParseProtocolMessage("{");
    expect(invalidJson.success ? undefined : invalidJson.error.code).toBe("invalid_json");

    const invalidEncoding = safeParseProtocolMessage(new Uint8Array([0xff]));
    expect(invalidEncoding.success ? undefined : invalidEncoding.error.code).toBe(
      "invalid_encoding"
    );

    const invalidMessage = safeParseProtocolMessage(JSON.stringify(validState()));
    expect(invalidMessage.success ? undefined : invalidMessage.error.code).toBe("invalid_message");
  });

  it("rejects frames over 16 KiB using UTF-8 byte length", () => {
    const ascii = safeParseProtocolMessage("x".repeat(MAX_MESSAGE_BYTES + 1));
    expect(ascii.success ? undefined : ascii.error.code).toBe("too_large");

    const multibyte = safeParseProtocolMessage("€".repeat(Math.floor(MAX_MESSAGE_BYTES / 3) + 1));
    expect(multibyte.success ? undefined : multibyte.error.code).toBe("too_large");
  });
});
