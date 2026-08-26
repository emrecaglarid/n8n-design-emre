<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * AI Trust prototype: a realistic Slack desktop channel window (title bar,
 * channel header, message area, composer). Content goes into the default slot,
 * usually a list of SlackMessage rows. The "Simulated preview" marker in the
 * title bar is the honesty cue — this chrome is convincing on purpose, so the
 * marker is not optional by default.
 *
 * With `interactive`, the composer is a live input: `v-model` + a `send` emit.
 */
const props = withDefaults(
	defineProps<{
		channelName: string;
		simulatedLabel?: string;
		interactive?: boolean;
		modelValue?: string;
		sendDisabled?: boolean;
	}>(),
	{
		simulatedLabel: 'Simulated preview — nothing sent',
		interactive: false,
		modelValue: '',
		sendDisabled: false,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: string];
	send: [];
}>();

function onInput(event: Event) {
	emit('update:modelValue', (event.target as HTMLInputElement).value);
}

function onSend() {
	if (props.sendDisabled) return;
	emit('send');
}

const bodyEl = ref<HTMLElement | null>(null);
let observer: MutationObserver | undefined;

onMounted(() => {
	if (!bodyEl.value) return;
	observer = new MutationObserver(() => {
		if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight;
	});
	observer.observe(bodyEl.value, { childList: true, subtree: true, characterData: true });
});

onBeforeUnmount(() => observer?.disconnect());
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
		</div>
		<div ref="bodyEl" :class="$style.body">
			<slot />
		</div>
		<div :class="$style.composer">
			<slot name="beforeComposer" />
			<div :class="$style.composerBox">
				<input
					v-if="interactive"
					:value="modelValue"
					:class="$style.composerInput"
					:placeholder="`Message #${channelName.replace(/^#/, '')}`"
					data-testid="slack-composer-input"
					@input="onInput"
					@keydown.enter.prevent="onSend"
				/>
				<span v-else :class="$style.composerPlaceholder"
					>Message #{{ channelName.replace(/^#/, '') }}</span
				>
				<div :class="$style.composerActions">
					<button
						v-if="interactive"
						:class="[$style.sendButton, sendDisabled && $style.sendDisabled]"
						:disabled="sendDisabled"
						data-testid="slack-composer-send"
						@click="onSend"
					>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M3.4 20.4 20.85 12.92a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91Z"
							/>
						</svg>
					</button>
					<span v-else :class="$style.sendButton">
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
	height: 100%;
	background: #fff;
	border-radius: 10px;
	overflow: hidden;
	border: 1px solid rgba(0, 0, 0, 0.18);
	box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
}

.titleBar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
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
	flex-shrink: 0;
	padding: 10px 20px;
	border-bottom: 1px solid rgba(29, 28, 29, 0.13);
}

.channelName {
	font-size: 15px;
	font-weight: 700;
	color: #1d1c1d;
}

.chevron {
	font-size: 11px;
	color: #616061;
}

.body {
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	gap: 8px;
	flex-grow: 1;
	min-height: 180px;
	padding: 12px 0 16px;
	overflow-y: auto;
}

.composer {
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex-shrink: 0;
	padding: 0 20px 20px;
}

.composerBox {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	border: 1px solid rgba(29, 28, 29, 0.25);
	border-radius: 8px;
	padding: 9px 10px 9px 12px;
}

.composerInput {
	flex-grow: 1;
	border: none;
	outline: none;
	font-family: inherit;
	font-size: 15px;
	color: #1d1c1d;
	background: transparent;

	&::placeholder {
		color: #616061;
	}
}

.composerPlaceholder {
	font-size: 15px;
	color: #616061;
}

.composerActions {
	display: flex;
	align-items: center;
}

.sendButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 26px;
	border: none;
	border-radius: 4px;
	background: #007a5a;
	color: #fff;
	cursor: pointer;
	transition-property: scale;
	transition-duration: 100ms;

	&:active:not(:disabled) {
		scale: 0.96;
	}
}

.sendDisabled {
	opacity: 0.5;
	cursor: default;
}
</style>
