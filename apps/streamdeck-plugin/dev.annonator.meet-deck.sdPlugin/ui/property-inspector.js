(() => {
  "use strict";

  const DEFAULT_PORT = 53421;
  const elements = {
    statusDot: document.querySelector("#status-dot"),
    statusTitle: document.querySelector("#status-title"),
    statusDetail: document.querySelector("#status-detail"),
    port: document.querySelector("#port"),
    pair: document.querySelector("#pair"),
    cancelPair: document.querySelector("#cancel-pair"),
    unpair: document.querySelector("#unpair"),
    pairingCodeWrap: document.querySelector("#pairing-code-wrap"),
    pairingCode: document.querySelector("#pairing-code"),
    pairingExpiry: document.querySelector("#pairing-expiry"),
    message: document.querySelector("#message")
  };

  let socket;
  let registration;
  let countdownTimer;

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN || !registration) {
      elements.message.textContent = "The Stream Deck connection is not ready.";
      return;
    }

    socket.send(
      JSON.stringify({
        action: registration.action,
        context: registration.context,
        event: "sendToPlugin",
        payload
      })
    );
  }

  function setCountdown(expiresAt) {
    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = undefined;
    }

    if (!expiresAt) {
      elements.pairingExpiry.textContent = "";
      return;
    }

    const update = () => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      elements.pairingExpiry.textContent = seconds > 0 ? `Expires in ${seconds}s` : "Code expired";
      if (seconds === 0 && countdownTimer) {
        window.clearInterval(countdownTimer);
        countdownTimer = undefined;
      }
    };

    update();
    countdownTimer = window.setInterval(update, 1000);
  }

  function render(status) {
    if (!status || status.type !== "bridge.status") {
      return;
    }

    elements.port.value = String(status.port || DEFAULT_PORT);
    elements.pairingCodeWrap.hidden = !status.pairingCode;
    elements.pairingCode.textContent = status.pairingCode || "—";
    elements.cancelPair.hidden = !status.pairingCode;
    elements.pair.hidden = Boolean(status.pairingCode);
    elements.unpair.hidden = !status.paired;
    setCountdown(status.pairingExpiresAt);

    elements.statusDot.className = "status-dot";
    if (status.connected) {
      elements.statusDot.classList.add("online");
      elements.statusTitle.textContent = "Extension connected";
      elements.statusDetail.textContent = "Meet controls are authenticated over the local bridge.";
    } else if (status.pairingCode) {
      elements.statusDot.classList.add("pairing");
      elements.statusTitle.textContent = "Pairing open";
      elements.statusDetail.textContent = "Enter the one-time code in the Chrome extension.";
    } else {
      elements.statusDot.classList.add("offline");
      elements.statusTitle.textContent = status.paired
        ? "Extension offline"
        : "Extension not paired";
      elements.statusDetail.textContent = status.listening
        ? `Local bridge is listening on 127.0.0.1:${status.port}.`
        : "The local bridge could not be started.";
    }

    elements.message.textContent = status.error || "";
  }

  elements.port.addEventListener("change", () => {
    const port = Number(elements.port.value);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      elements.message.textContent = "Choose a port between 1024 and 65535.";
      return;
    }
    elements.message.textContent = "";
    send({ type: "port.set", port });
  });

  elements.pair.addEventListener("click", () => {
    elements.message.textContent = "";
    send({ type: "pairing.start" });
  });

  elements.cancelPair.addEventListener("click", () => {
    elements.message.textContent = "";
    send({ type: "pairing.cancel" });
  });

  elements.unpair.addEventListener("click", () => {
    elements.message.textContent = "";
    send({ type: "pairing.unpair" });
  });

  document.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!socket || socket.readyState !== WebSocket.OPEN || !registration) {
        return;
      }
      event.preventDefault();
      socket.send(
        JSON.stringify({
          event: "openUrl",
          payload: { url: link.href }
        })
      );
    });
  });

  window.connectElgatoStreamDeckSocket = (port, context, event, info, actionInfo) => {
    void info;
    let parsedActionInfo;
    try {
      parsedActionInfo = JSON.parse(actionInfo);
    } catch {
      elements.message.textContent = "Stream Deck supplied invalid action information.";
      return;
    }

    registration = {
      action: parsedActionInfo.action,
      context
    };

    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ event, uuid: context }));
      send({ type: "status.request" });
    });
    socket.addEventListener("message", (messageEvent) => {
      try {
        const message = JSON.parse(messageEvent.data);
        if (message.event === "sendToPropertyInspector") {
          render(message.payload);
        }
      } catch {
        elements.message.textContent = "The plugin returned an invalid status message.";
      }
    });
    socket.addEventListener("close", () => {
      elements.statusDot.className = "status-dot offline";
      elements.statusTitle.textContent = "Stream Deck disconnected";
      elements.statusDetail.textContent = "Re-select the action to reconnect settings.";
    });
  };
})();
