import { describe, expect, it } from "vitest";

import { fetchLocalUsage } from "../src/localUsage.ts";

const client = {
	session: {
		stats: async () => ({
			models: [
				{ model: { providerID: "google" }, tokens: { input: 1000, output: 500 }, cost: 1.5 },
				{ model: { providerID: "xai" }, tokens: { input: 2_000_000, output: 0 }, cost: 0 },
			],
		}),
	},
};

describe("local usage", () => {
	it("returns three windows per provider, aggregated by providerID", async () => {
		const usage = await fetchLocalUsage(client as never, Date.now());
		expect(Object.keys(usage).sort()).toEqual(["google", "xai"]);
		expect(usage.google?.map((w) => w.label)).toEqual(["5h", "7d", "30d"]);
		expect(usage.google?.[0]).toEqual({ label: "5h", input: 1000, output: 500, cost: 1.5 });
	});
});
