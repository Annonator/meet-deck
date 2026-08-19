import { access, mkdir, readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import { chromium } from "playwright-core";

const distRoot = new URL("../dist/", import.meta.url);
const assetRoot = new URL("../store/assets/", import.meta.url);
const sourceCss = await readFile(
  new URL("../store/source/store-assets.css", import.meta.url),
  "utf8"
);
const messages = JSON.parse(
  await readFile(new URL("../public/_locales/en/messages.json", import.meta.url), "utf8")
);

const unpairedStatus = {
  authentication: "unpaired",
  connection: "disconnected",
  meetingMultiplicity: "none",
  paired: false,
  port: 53_421
};

const connectedStatus = {
  authentication: "authenticated",
  connection: "connected",
  meetingMultiplicity: "one",
  paired: true,
  port: 53_421
};

await assertBuiltInput("popup.html");
await assertBuiltInput("onboarding.html");
await mkdir(assetRoot, { recursive: true });

const executablePath = await findChromeExecutable();
const browser = await chromium.launch({
  args: ["--force-color-profile=srgb", "--hide-scrollbars"],
  executablePath,
  headless: true
});

try {
  const pairPopup = await capturePopup(browser, unpairedStatus, "48273196");
  const connectedPopup = await capturePopup(browser, connectedStatus);
  const privacyCard = await capturePrivacyCard(browser);
  const actionImages = await readActionImages();

  await renderAsset(browser, {
    height: 280,
    html: promoMarkup(),
    name: "small-promo-440x280.png",
    width: 440
  });
  await renderAsset(browser, {
    height: 800,
    html: pairingMarkup(dataUrl(pairPopup)),
    name: "01-pair-locally.png",
    width: 1280
  });
  await renderAsset(browser, {
    height: 800,
    html: connectedMarkup(dataUrl(connectedPopup), actionImages),
    name: "02-connected-controls.png",
    width: 1280
  });
  await renderAsset(browser, {
    height: 800,
    html: privacyMarkup(dataUrl(privacyCard)),
    name: "03-private-by-design.png",
    width: 1280
  });

  console.log(`Generated Chrome Web Store media with ${await browser.version()}`);
} finally {
  await browser.close();
}

async function assertBuiltInput(name) {
  try {
    await access(new URL(name, distRoot));
  } catch {
    throw new Error(`Missing dist/${name}; build the Chrome extension before generating media`);
  }
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known system location.
    }
  }

  throw new Error(
    "Google Chrome was not found. Set CHROME_EXECUTABLE to a Chrome or Chromium executable."
  );
}

async function capturePopup(browserInstance, status, pairingCode) {
  const context = await browserInstance.newContext(browserOptions(360, 720));
  const page = await context.newPage();
  await installChromeFixture(page, status);
  await page.goto(pathToFileURL(fileURLToPath(new URL("popup.html", distRoot))).href, {
    waitUntil: "load"
  });
  await page.waitForFunction(
    (expected) => globalThis.document.querySelector("#connection-status")?.textContent === expected,
    status.connection === "connected" ? "Securely connected to Stream Deck" : "Not paired yet"
  );

  const pairForm = page.locator("#pair-form");
  if (status.connection === "connected") {
    const hiddenState = await pairForm.evaluate((element) => ({
      display: globalThis.getComputedStyle(element).display,
      hidden: element.hidden
    }));
    if (!hiddenState.hidden || hiddenState.display !== "none") {
      throw new Error(`Connected popup leaked the pairing form: ${JSON.stringify(hiddenState)}`);
    }
  } else {
    if ((await pairForm.getAttribute("hidden")) !== null) {
      throw new Error("Unpaired popup unexpectedly hid the pairing form");
    }
    await page.locator("#pair-code").fill(pairingCode);
  }

  const height = await page.evaluate(() => {
    const panel = globalThis.document.querySelector(".panel");
    if (!(panel instanceof globalThis.HTMLElement)) {
      throw new Error("Popup panel is missing");
    }
    return Math.ceil(Math.max(430, panel.getBoundingClientRect().bottom));
  });
  const image = await page.screenshot({
    animations: "disabled",
    clip: { height, width: 360, x: 0, y: 0 },
    type: "png"
  });
  await context.close();
  return image;
}

async function capturePrivacyCard(browserInstance) {
  const context = await browserInstance.newContext(browserOptions(600, 900));
  const page = await context.newPage();
  await installChromeFixture(page, unpairedStatus);
  await page.goto(pathToFileURL(fileURLToPath(new URL("onboarding.html", distRoot))).href, {
    waitUntil: "load"
  });
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector(".privacy h2")?.textContent ===
      "What the extension processes"
  );
  await page.evaluate(() => {
    globalThis.document.body.style.background = "#090d13";
  });
  const image = await page.locator(".privacy").screenshot({
    animations: "disabled",
    type: "png"
  });
  await context.close();
  return image;
}

async function installChromeFixture(page, status) {
  await page.addInitScript(
    ({ localizedMessages, publicStatus }) => {
      const messageMap = Object.fromEntries(
        Object.entries(localizedMessages).map(([key, value]) => [key, value.message])
      );
      globalThis.chrome = {
        action: { openPopup: async () => undefined },
        i18n: {
          getMessage: (key) => messageMap[key] ?? "",
          getUILanguage: () => "en-US"
        },
        permissions: {
          contains: async () => true,
          remove: async () => true,
          request: async () => true
        },
        runtime: {
          sendMessage: async () => ({ ok: true, status: publicStatus })
        }
      };
    },
    { localizedMessages: messages, publicStatus: status }
  );
}

function browserOptions(width, height) {
  return {
    colorScheme: "dark",
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "reduce",
    timezoneId: "UTC",
    viewport: { height, width }
  };
}

async function readActionImages() {
  const actions = [
    ["microphone", "off"],
    ["camera", "on"],
    ["hand", "on"],
    ["presentation", "on"]
  ];
  const result = {};
  for (const [action, state] of actions) {
    const image = await readFile(
      new URL(
        `../../streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/imgs/actions/${action}/${state}@2x.png`,
        import.meta.url
      )
    );
    result[action] = dataUrl(image);
  }
  return result;
}

async function renderAsset(browserInstance, asset) {
  const context = await browserInstance.newContext(browserOptions(asset.width, asset.height));
  const page = await context.newPage();
  await page.setContent(documentMarkup(asset.html), { waitUntil: "load" });
  await page.waitForFunction(() =>
    Array.from(globalThis.document.images).every(
      (image) => image.complete && image.naturalWidth > 0
    )
  );
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    path: fileURLToPath(new URL(asset.name, assetRoot)),
    type: "png"
  });
  await context.close();
}

function documentMarkup(body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${sourceCss}</style>
  </head>
  <body>${body}</body>
</html>`;
}

function promoMarkup() {
  return `<main class="promo" aria-label="Meet Deck">
  <div class="promo-lockup">
    <div class="promo-mark" aria-hidden="true">MD</div>
    <h1>Meet Deck</h1>
    <div class="promo-signal" aria-hidden="true"><span></span></div>
  </div>
</main>`;
}

function pairingMarkup(popupImage) {
  return `<main class="screenshot pair">
  <section class="copy">
    <div class="eyebrow">Pair locally</div>
    <h1>Connect with an<br>eight-digit code.</h1>
    <p>Meet Deck requests access only to the configured WebSocket origin on 127.0.0.1.</p>
  </section>
  <div class="frame-label">Actual extension UI · example code</div>
  <div class="ui-frame"><img src="${popupImage}" alt="Meet Deck pairing popup"></div>
</main>`;
}

function connectedMarkup(popupImage, images) {
  return `<main class="screenshot connected">
  <div class="frame-label">Actual extension UI</div>
  <div class="ui-frame"><img src="${popupImage}" alt="Connected Meet Deck popup"></div>
  <section class="copy">
    <div class="eyebrow">Live states</div>
    <h1>Your meeting controls,<br>on keys.</h1>
    <p>Microphone, camera, hand, and your own presentation stay in sync locally.</p>
  </section>
  <section class="states" aria-label="Example live key states">
    ${stateMarkup(images.microphone, "Mic", "Muted")}
    ${stateMarkup(images.camera, "Camera", "On")}
    ${stateMarkup(images.hand, "Hand", "Raised")}
    ${stateMarkup(images.presentation, "Presentation", "Sharing")}
  </section>
</main>`;
}

function stateMarkup(source, control, state) {
  return `<figure class="state"><img src="${source}" alt=""><figcaption>${control}<span>${state}</span></figcaption></figure>`;
}

function privacyMarkup(privacyImage) {
  return `<main class="screenshot privacy-shot">
  <section class="copy">
    <div class="eyebrow">Private by design</div>
    <h1>Meet Deck does not access meeting media.</h1>
    <p>Meet Deck connects Google Meet and Stream Deck only over IPv4 loopback. No cloud, no telemetry, and no meeting media or communications.</p>
  </section>
  <div class="privacy-frame"><img src="${privacyImage}" alt="Meet Deck privacy summary"></div>
  <div class="chips"><span class="chip">127.0.0.1 only</span><span class="chip">Open source</span></div>
</main>`;
}

function dataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
