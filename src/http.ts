import { readFile } from "node:fs/promises";

export interface UsageWindow {
	/** Short label shown in the footer, e.g. "5h" or "7d". */
	label: string;
	title: string;
	percent: number;
	resetDate: string | null;
}

const REQUEST_TIMEOUT_MS = 10_000;

export class HttpError extends Error {
	constructor(readonly status: number) {
		super(status === 429 ? "Rate limited by the provider." : `The provider returned ${status}.`);
	}
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, {
			headers: { ...headers, "User-Agent": "metria-opencode/0.1" },
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}
}

export async function requestJson(url: string, headers: Record<string, string>): Promise<unknown> {
	const response = await fetchWithTimeout(url, headers);
	if (!response.ok) throw new HttpError(response.status);
	return response.json();
}

export async function postJson(url: string, body: unknown): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", "User-Agent": "metria-opencode/0.1" },
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		if (!response.ok) throw new HttpError(response.status);
		return response.json();
	} finally {
		clearTimeout(timer);
	}
}

export async function readJson(path: string): Promise<any> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return undefined;
	}
}

/** Tries each candidate token in order and returns the first successful result. */
export async function firstSuccessful<T, R>(
	candidates: readonly (T | undefined)[],
	run: (candidate: T) => Promise<R>,
	missing: string,
): Promise<R> {
	let lastError: unknown;
	for (const candidate of candidates) {
		if (candidate === undefined) continue;
		try {
			return await run(candidate);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError ?? new Error(missing);
}

export function percent(value: unknown): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? Math.max(0, number) : 0;
}
