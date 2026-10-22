import { describe, expect, it } from "vitest";

import { parseClaudeUsage } from "../src/providers/claude.ts";
import { parseCodexAuth, parseCodexUsage } from "../src/providers/codex.ts";
import { parseOpenCodeGoUsage } from "../src/providers/opencodeGo.ts";
import { formatReset, level, providerKind, resetLabel, summarize, usageBar } from "../src/usage.ts";

describe("parsers", () => {
	it("parses Claude windows, primary first", () => {
		const windows = parseClaudeUsage({
			five_hour: { utilization: 24, resets_at: "2026-10-22T00:00:00Z" },
			seven_day: { utilization: 7 },
			seven_day_opus: null,
		});
		expect(windows.map((w) => [w.label, w.percent])).toEqual([
			["5h", 24],
			["7d", 7],
		]);
	});

	it("parses Codex windows and auth shapes", () => {
		const windows = parseCodexUsage({
			rate_limit: {
				primary_window: { used_percent: 10, limit_window_seconds: 18000, reset_at: 1 },
				secondary_window: { used_percent: 90, limit_window_seconds: 604800 },
			},
		});
		expect(windows.map((w) => w.label)).toEqual(["5h", "7d"]);
		expect(parseCodexAuth({ openai: { access: "a", accountId: "b" } })).toEqual({ access: "a", accountId: "b" });
		expect(parseCodexAuth({ tokens: { access_token: "a", account_id: "b" } })).toEqual({ access: "a", accountId: "b" });
	});

	it("parses OpenCode Go windows", () => {
		const windows = parseOpenCodeGoUsage({ usage: { rolling: { percent: 5 }, monthly: { percent: 99 } } });
		expect(windows.map((w) => w.label)).toEqual(["5h", "30d"]);
	});
});

describe("summary", () => {
	it("maps provider ids", () => {
		expect(providerKind("anthropic")).toBe("Claude");
		expect(providerKind("openai")).toBe("Codex");
		expect(providerKind("opencode-go")).toBe("OpenCode Go");
		expect(providerKind("google")).toBeUndefined();
	});

	it("alerts only for non-primary windows at or above 85%", () => {
		const w = (label: string, percent: number) => ({ label, title: label, percent, resetDate: null });
		expect(summarize([w("5h", 99), w("7d", 50)]).alert).toBeUndefined();
		expect(summarize([w("5h", 10), w("7d", 85), w("30d", 100)]).alert?.label).toBe("30d");
	});

	it("levels and reset formatting", () => {
		expect(level(100)).toBe("exceeded");
		expect(level(85)).toBe("high");
		expect(level(10)).toBe("ok");
		expect(formatReset(new Date(90 * 60_000).toISOString(), 0)).toBe("1h30m");
		expect(formatReset(new Date(45 * 60_000).toISOString(), 0)).toBe("45m");
		expect(formatReset(new Date(3 * 24 * 60 * 60_000).toISOString(), 0)).toBe("3d");
		expect(formatReset(new Date((3 * 24 + 4) * 60 * 60_000).toISOString(), 0)).toBe("3d4h");
	});

	it("shows the reset time only once a window is used up", () => {
		const window = (percent: number, minutes: number) => ({
			label: "5h",
			title: "Current session",
			percent,
			resetDate: new Date(minutes * 60_000).toISOString(),
		});
		expect(resetLabel(window(99, 90), 0)).toBe("");
		expect(resetLabel(window(100, 90), 0)).toBe("resets in 1h30m");
		expect(resetLabel(window(100, 0), 0)).toBe("resets in now");
		expect(resetLabel({ ...window(100, 90), resetDate: null }, 0)).toBe("");
	});
});

describe("usage bar", () => {
	it("fills proportionally to the percentage", () => {
		expect(usageBar(0, 10)).toBe("░".repeat(10));
		expect(usageBar(50, 10)).toBe(`${"█".repeat(5)}${"░".repeat(5)}`);
		expect(usageBar(100, 10)).toBe("█".repeat(10));
	});

	it("clamps values outside 0-100", () => {
		expect(usageBar(-20, 4)).toBe("░".repeat(4));
		expect(usageBar(180, 4)).toBe("█".repeat(4));
	});
});
