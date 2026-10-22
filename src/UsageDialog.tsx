/** @jsxImportSource @opentui/solid */
import { For, Show } from "solid-js";

import type { UsageWindow } from "./http.ts";
import { type Level, type ProviderKind, formatPercent, formatReset, level, usageBar } from "./usage.ts";

const MIN_LABEL_WIDTH = 3;

export interface UsageDialogEntry {
	readonly windows: readonly UsageWindow[];
	readonly error: string | null;
}

export interface UsageDialogProps {
	readonly providers: readonly ProviderKind[];
	readonly others: () => readonly string[];
	readonly current: () => ProviderKind | undefined;
	readonly entry: (kind: ProviderKind) => UsageDialogEntry | undefined;
	readonly now: () => number;
	readonly colors: Readonly<Record<Level, string>>;
	readonly text: string;
	readonly muted: string;
	readonly faint: string;
}

/** Window showing usage for every provider Metria detected in this OpenCode. */
export function UsageDialog(props: UsageDialogProps) {
	const resetText = (window: UsageWindow) => {
		const reset = formatReset(window.resetDate, props.now());
		return reset ? `resets in ${reset}` : "";
	};

	// Largura do maior rótulo visível, para alinhar as barras entre todos os providers.
	const labelWidth = () =>
		Math.max(MIN_LABEL_WIDTH, ...props.providers.flatMap((kind) => (props.entry(kind)?.windows ?? []).map((w) => w.label.length)));

	return (
		<box flexDirection="column" gap={1} paddingLeft={4} paddingRight={4} paddingBottom={1}>
			<text fg={props.text}>{"Metria · usage"}</text>

			<For each={props.providers}>
				{(kind) => {
					const entry = () => props.entry(kind);
					const windows = () => entry()?.windows ?? [];
					return (
						<box flexDirection="column">
							<box flexDirection="row" gap={1}>
								<text fg={props.text}>{kind}</text>
								<Show when={props.current() === kind}>
									<text fg={props.muted}>{"● current"}</text>
								</Show>
							</box>

							<box flexDirection="column" paddingLeft={2}>
								<Show when={windows().length === 0 && !entry()?.error}>
									<text fg={props.faint}>{"loading…"}</text>
								</Show>

								<For each={windows()}>
									{(window) => (
										<box flexDirection="row" gap={2}>
											<text fg={props.faint}>{window.label.padEnd(labelWidth())}</text>
											<text fg={props.colors[level(window.percent)]}>{usageBar(window.percent)}</text>
											<text fg={props.colors[level(window.percent)]}>
												{formatPercent(window.percent).padStart(4)}
											</text>
											<text fg={props.faint}>{resetText(window)}</text>
										</box>
									)}
								</For>

								<Show when={entry()?.error}>
									{(error) => <text fg={props.colors.high}>{error()}</text>}
								</Show>
							</box>
						</box>
					);
				}}
			</For>

			<Show when={props.others().length > 0}>
				<text fg={props.faint}>{`Not measured: ${props.others().join(", ")}`}</text>
			</Show>
		</box>
	);
}
