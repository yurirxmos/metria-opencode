import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOpenCodeGoUsage } from "../src/providers/opencodeGo.ts";
import type { CredentialSource } from "../src/credentials.ts";

const USAGE = { usage: { rolling: { percent: 1 }, weekly: { percent: 2 }, monthly: { percent: 3 } } };

function sourceGiven(entries: Record<string, Record<string, unknown>>): CredentialSource {
	return { get: async (integrationID) => entries[integrationID] };
}

function stubFetch() {
	const sent: string[] = [];
	vi.stubGlobal("fetch", async (_url: string, init: { headers: Record<string, string> }) => {
		sent.push(init.headers.Authorization);
		return { ok: true, status: 200, json: async () => USAGE };
	});
	return sent;
}

describe("OpenCode Go credentials", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Regressão: o provider usa o OAuth do Console; a API key de opencode-go expira sozinha.
	it("prefers the OpenCode Console token over the opencode-go API key", async () => {
		const sent = stubFetch();
		const windows = await fetchOpenCodeGoUsage(
			sourceGiven({
				opencode: { type: "oauth", access: "console-token" },
				"opencode-go": { type: "key", key: "expired-key" },
			}),
		);
		expect(sent).toEqual(["Bearer console-token"]);
		expect(windows.map((window) => window.label)).toEqual(["5h", "7d", "30d"]);
	});

	it("falls back to the API key when the Console is unavailable", async () => {
		const sent = stubFetch();
		await fetchOpenCodeGoUsage(sourceGiven({ "opencode-go": { type: "key", key: "only-key" } }));
		expect(sent).toEqual(["Bearer only-key"]);
	});
});
