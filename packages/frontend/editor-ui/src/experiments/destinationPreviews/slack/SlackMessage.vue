<script setup lang="ts">
import { computed } from 'vue';

/**
 * AI Trust prototype: one message row rendered with Slack's own visual anatomy
 * (light theme). Shared between the agent preview stage and, later, the
 * workflow builder's destination previews.
 */
const props = withDefaults(
	defineProps<{
		authorName: string;
		time?: string;
		text?: string;
		/** Renders the grey APP badge next to the author name */
		appBadge?: boolean;
		/** Avatar tile color; derived from the name when omitted */
		avatarColor?: string;
		/** Replaces the text with a typing indicator */
		pending?: boolean;
		/** Renders the text in Slack's error red */
		error?: boolean;
	}>(),
	{ time: undefined, text: '', avatarColor: undefined, pending: false, error: false },
);

const AVATAR_COLORS = ['#7C3085', '#3C8C69', '#B8656F', '#4A7DAB', '#8F6C3B', '#5D6DBE'];

const EMOJI_CODES: Record<string, string> = {
	white_check_mark: '✅',
	x: '❌',
	warning: '⚠️',
	tada: '🎉',
	eyes: '👀',
	thumbsup: '👍',
	'+1': '👍',
	memo: '📝',
	page_facing_up: '📄',
	wave: '👋',
	rocket: '🚀',
};

const initials = computed(() =>
	props.authorName
		.split(/\s+/)
		.map((part) => part[0] ?? '')
		.slice(0, 2)
		.join('')
		.toUpperCase(),
);

const avatarBackground = computed(() => {
	if (props.avatarColor) return props.avatarColor;
	let hash = 0;
	for (const char of props.authorName) hash = (hash * 31 + char.charCodeAt(0)) % 997;
	return AVATAR_COLORS[hash % AVATAR_COLORS.length];
});

/** Slack mrkdwn, minimally: *bold* / **bold** and :emoji_code: */
const segments = computed(() => {
	const withEmoji = (props.text ?? '').replace(
		/:([a-z0-9_+-]+):/g,
		(match, code: string) => EMOJI_CODES[code] ?? match,
	);
	const normalized = withEmoji.replace(/\*\*/g, '*');
	return normalized
		.split(/(\*[^*\n]+\*)/g)
		.filter((part) => part.length > 0)
		.map((part) =>
			part.startsWith('*') && part.endsWith('*') && part.length > 2
				? { bold: true, text: part.slice(1, -1) }
				: { bold: false, text: part },
		);
});
</script>

<template>
	<div :class="$style.message">
		<div :class="$style.avatar" :style="{ backgroundColor: avatarBackground }">
			{{ initials }}
		</div>
		<div :class="$style.content">
			<div :class="$style.meta">
				<span :class="$style.author">{{ authorName }}</span>
				<span v-if="appBadge" :class="$style.appBadge">APP</span>
				<span v-if="time" :class="$style.time">{{ time }}</span>
			</div>
			<div v-if="pending" :class="$style.typing">
				<span :class="$style.dot" />
				<span :class="[$style.dot, $style.dot2]" />
				<span :class="[$style.dot, $style.dot3]" />
			</div>
			<div v-else :class="[$style.text, error && $style.errorText]">
				<template v-for="(segment, index) in segments" :key="index">
					<strong v-if="segment.bold">{{ segment.text }}</strong>
					<template v-else>{{ segment.text }}</template>
				</template>
			</div>
			<slot />
		</div>
	</div>
</template>

<style lang="scss" module>
.message {
	display: flex;
	gap: 8px;
	padding: 4px 20px;
	font-family:
		'Lato',
		'Inter',
		-apple-system,
		sans-serif;
}

.avatar {
	flex: 0 0 auto;
	width: 36px;
	height: 36px;
	border-radius: 4px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: #fff;
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0.02em;
}

.content {
	min-width: 0;
	flex: 1;
}

.meta {
	display: flex;
	align-items: baseline;
	gap: 6px;
}

.author {
	font-size: 15px;
	font-weight: 900;
	color: #1d1c1d;
}

.appBadge {
	font-size: 10px;
	font-weight: 700;
	color: #616061;
	background: rgba(29, 28, 29, 0.08);
	border-radius: 2px;
	padding: 0 4px;
	line-height: 14px;
}

.time {
	font-size: 12px;
	color: #616061;
}

.text {
	font-size: 15px;
	line-height: 1.46;
	color: #1d1c1d;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	text-wrap: pretty;
	max-height: 300px;
	overflow-y: auto;
}

.errorText {
	color: #e01e5a;
}

.typing {
	display: flex;
	gap: 4px;
	padding: 8px 0 4px;
}

.dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #b6b6b6;
	animation: slack-typing 1.2s infinite ease-in-out;
}

.dot2 {
	animation-delay: 0.15s;
}

.dot3 {
	animation-delay: 0.3s;
}

@keyframes slack-typing {
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
</style>
