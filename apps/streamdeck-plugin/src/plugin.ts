import streamDeck from "@elgato/streamdeck";

import { PluginRuntime } from "./runtime.js";

streamDeck.settings.useExperimentalMessageIdentifiers = true;

const runtime = new PluginRuntime();

await streamDeck.connect();
await runtime.initialize();
