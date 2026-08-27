<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * AI Trust prototype: the same conversation rendered as a plain embedded chat
 * widget — the surface an agent gets when it lives on a website rather than in
 * Slack. Interactive contract matches SlackWindow (v-model + send emit) so the
 * stage can swap surfaces without touching the session.
 */
withDefaults(
	defineProps<{
		title: string;
		simulatedLabel?: string;
		modelValue?: string;
		sendDisabled?: boolean;
		messages: Array<{
			id: string;
			role: 'user' | 'assistant';
			content: string;
			pending?: boolean;
			error?: boolean;
		}>;
	}>(),
	{
		simulatedLabel: 'Simulated preview — nothing sent',
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
		<div :class="$style.header">
			<span :class="$style.title">{{ title }}</span>
			<span :class="$style.simulated">👁 {{ simulatedLabel }}</span>
		</div>
		<div ref="bodyEl" :class="$style.body">
			<slot name="intro" />
			<div
				v-for="message in messages"
				:key="message.id"
				:class="[$style.bubble, message.role === 'user' ? $style.userBubble : $style.agentBubble]"
			>
				<template v-if="message.pending">
					<span :class="$style.typing">
						<span :class="$style.dot" />
						<span :class="[$style.dot, $style.dot2]" />
						<span :class="[$style.dot, $style.dot3]" />
					</span>
				</template>
				<template v-else>
					<span :class="[$style.bubbleText, message.error && $style.errorText]">{{
						message.content
					}}</span>
				</template>
			</div>
		</div>
		<div :class="$style.composer">
			<slot name="beforeComposer" />
			<div :class="$style.composerBox">
				<input
					:value="modelValue"
					:class="$style.composerInput"
					placeholder="Type a message…"
					data-testid="plain-chat-composer-input"
					@input="onInput"
					@keydown.enter.prevent="!sendDisabled && emit('send')"
				/>
				<button
					:class="[$style.sendButton, sendDisabled && $style.sendDisabled]"
					:disabled="sendDisabled"
					data-testid="plain-chat-composer-send"
					@click="emit('send')"
				>
					➤
				</button>
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
	border-radius: 14px;
	overflow: hidden;
	border: 1px solid rgba(0, 0, 0, 0.18);
	box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-shrink: 0;
	padding: 12px 16px;
	background: #1f2430;
}

.title {
	font-size: 13px;
	font-weight: 700;
	color: #fff;
}

.simulated {
	font-size: 10px;
	color: rgba(255, 255, 255, 0.6);
}

.body {
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	gap: 8px;
	flex-grow: 1;
	min-height: 180px;
	padding: 16px;
	overflow-y: auto;
	background: #f7f8fa;
}

.bubble {
	max-width: 78%;
	border-radius: 14px;
	padding: 8px 12px;
}

.userBubble {
	align-self: flex-end;
	background: #1f2430;
	color: #fff;
	border-bottom-right-radius: 4px;
}

.agentBubble {
	align-self: flex-start;
	background: #fff;
	border: 1px solid rgba(0, 0, 0, 0.08);
	color: #1d1c1d;
	border-bottom-left-radius: 4px;
}

.bubbleText {
	font-size: 13px;
	line-height: 1.45;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.errorText {
	color: #e01e5a;
}

.typing {
	display: flex;
	gap: 4px;
	padding: 4px 0;
}

.dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #b6b6b6;
	animation: plain-chat-typing 1.2s infinite ease-in-out;
}

.dot2 {
	animation-delay: 0.15s;
}

.dot3 {
	animation-delay: 0.3s;
}

@keyframes plain-chat-typing {
	0%,
	60%,
	100% {
		transform: translateY(0);
		opacity: 0.5;
	}
	30% {
		transform: translateY(-4px);
		opacity: 1;
	}
}

.composer {
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex-shrink: 0;
	padding: 0 16px 16px;
	background: #f7f8fa;
}

.composerBox {
	display: flex;
	align-items: center;
	gap: 10px;
	background: #fff;
	border: 1px solid rgba(0, 0, 0, 0.14);
	border-radius: 999px;
	padding: 8px 8px 8px 16px;
}

.composerInput {
	flex-grow: 1;
	border: none;
	outline: none;
	font-family: inherit;
	font-size: 13px;
	color: #1d1c1d;
	background: transparent;

	&::placeholder {
		color: #8a8a8a;
	}
}

.sendButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border: none;
	border-radius: 50%;
	background: #1f2430;
	color: #fff;
	font-size: 12px;
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
