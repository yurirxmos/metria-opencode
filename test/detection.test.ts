import { describe, expect, it } from "vitest";

import { unmeasuredIntegrations } from "../src/detection.ts";

describe("unmeasured integrations", () => {
	it("lists only connected integrations Metria does not measure", () => {
		const others = unmeasuredIntegrations([
			{ integrationID: "anthropic", active: true },
			{ integrationID: "opencode-go", active: true },
			{ integrationID: "opencode", active: true },
			{ integrationID: "codex", active: true },
			{ integrationID: "google", active: true },
			{ integrationID: "xai", active: true },
			{ integrationID: "zai", active: false },
		]);
		expect(others).toEqual([
			{ id: "google", label: "Google" },
			{ id: "xai", label: "xAI" },
		]);
	});

	it("uses readable names for known integrations", () => {
		expect(unmeasuredIntegrations([{ integrationID: "github-copilot", active: true }])).toEqual([
			{ id: "github-copilot", label: "GitHub Copilot" },
		]);
	});

	it("does not repeat the same integration", () => {
		const others = unmeasuredIntegrations([
			{ integrationID: "google", active: true },
			{ integrationID: "google", active: true },
		]);
		expect(others).toEqual([{ id: "google", label: "Google" }]);
	});
});
