import streamDeck from "@elgato/streamdeck";

import { PluginRuntime } from "./runtime.js";

const runtime = new PluginRuntime();

await streamDeck.connect();
await runtime.initialize();
