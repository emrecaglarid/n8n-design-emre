<script setup lang="ts">
/**
 * AI Trust prototype: a realistic Slack desktop channel window (title bar,
 * channel header, message area, composer). Content goes into the default slot,
 * usually a list of SlackMessage rows. The "Simulated preview" marker in the
 * title bar is the honesty cue — this chrome is convincing on purpose, so the
 * marker is not optional by default.
 */
withDefaults(
	defineProps<{
		channelName: string;
		memberCount?: number;
		simulatedLabel?: string;
	}>(),
	{ memberCount: 3, simulatedLabel: 'Simulated preview — nothing sent' },
);
</script>

<template>
	<div :class="$style.window">
		<div :class="$style.titleBar">
			<div :class="$style.trafficLights">
				<span :class="[$style.light, $style.red]" />
				<span :class="[$style.light, $style.yellow]" />
				<span :class="[$style.light, $style.green]" />
			</div>
			<span :class="$style.simulated">
				<svg
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
				{{ simulatedLabel }}
			</span>
		</div>
		<div :class="$style.channelHeader">
			<span :class="$style.channelName"
				>#{{ channelName.replace(/^#/, '') }} <span :class="$style.chevron">▾</span></span
			>
			<span :class="$style.headerMeta">
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
					<path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
				{{ memberCount }}
			</span>
		</div>
		<div :class="$style.body">
			<div :class="$style.dateDivider">
				<span :class="$style.dateLine" />
				<span :class="$style.datePill">Today</span>
				<span :class="$style.dateLine" />
			</div>
			<slot />
		</div>
		<div :class="$style.composer">
			<div :class="$style.composerBox">
				<span :class="$style.composerPlaceholder"
					>Message #{{ channelName.replace(/^#/, '') }}</span
				>
				<div :class="$style.composerActions">
					<span :class="$style.composerIcons">＋&nbsp;&nbsp;Aa&nbsp;&nbsp;😊&nbsp;&nbsp;@</span>
					<span :class="$style.sendButton">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M3.4 20.4 20.85 12.92a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91Z"
							/>
						</svg>
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.window {
	display: flex;
	flex-direction: column;
	width: 100%;
	background: #fff;
	border-radius: 10px;
	overflow: hidden;
	border: 1px solid rgba(0, 0, 0, 0.35);
	box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
	font-family:
		'Lato',
		'Inter',
		-apple-system,
		sans-serif;
}

.titleBar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 38px;
	padding: 0 14px;
	background: #350d36;
}

.trafficLights {
	display: flex;
	gap: 8px;
}

.light {
	width: 12px;
	height: 12px;
	border-radius: 50%;
}

.red {
	background: #ff5f57;
}

.yellow {
	background: #febc2e;
}

.green {
	background: #28c840;
}

.simulated {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	font-size: 11px;
	color: rgba(255, 255, 255, 0.6);
}

.channelHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 20px;
	border-bottom: 1px solid rgba(29, 28, 29, 0.13);
}

.channelName {
	font-size: 16px;
	font-weight: 900;
	color: #1d1c1d;
}

.chevron {
	font-size: 11px;
	color: #616061;
}

.headerMeta {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 12px;
	color: #616061;
	border: 1px solid rgba(29, 28, 29, 0.13);
	border-radius: 4px;
	padding: 2px 8px;
}

.body {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px 0 16px;
	min-height: 220px;
}

.dateDivider {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 20px 8px;
}

.dateLine {
	flex-grow: 1;
	height: 1px;
	background: rgba(29, 28, 29, 0.13);
}

.datePill {
	font-size: 12px;
	font-weight: 700;
	color: #1d1c1d;
	border: 1px solid rgba(29, 28, 29, 0.13);
	border-radius: 20px;
	padding: 3px 10px;
}

.composer {
	padding: 0 20px 20px;
}

.composerBox {
	display: flex;
	flex-direction: column;
	gap: 10px;
	border: 1px solid rgba(29, 28, 29, 0.3);
	border-radius: 8px;
	padding: 10px 12px;
}

.composerPlaceholder {
	font-size: 15px;
	color: #616061;
}

.composerActions {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.composerIcons {
	font-size: 13px;
	color: #616061;
	letter-spacing: 0.05em;
}

.sendButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 26px;
	border-radius: 4px;
	background: #007a5a;
	color: #fff;
}
</style>
