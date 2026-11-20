<script setup lang="ts">
import { resolveAgentPersonalisation, type AgentJsonConfig } from '@n8n/api-types';
import { computed, onBeforeUnmount, ref } from 'vue';

/**
 * The agent avatar in a test chat. At rest it is a plain avatar. Drag it and it
 * resists; keep pulling and a leash shows, tied to a point behind its center.
 * It follows the pointer for as long as the button is held, then bounces
 * back to that point, and the leash hides again.
 * The slot holds a 64px avatar. The leash takes the avatar's colors.
 */
const props = defineProps<{ personalisation?: AgentJsonConfig['personalisation'] | null }>();

const SIZE = 64;
const CENTER = SIZE / 2;
/** How far the avatar gives before the leash shows. */
const RESIST = 12;
/** How far the pointer must pull before the leash shows. */
const LEASH_AFTER = 48;
/** Past this, the leash stretches: the avatar keeps following the pointer, a bit behind it. */
const LENGTH = 110;

const gradient = computed(() => resolveAgentPersonalisation(props.personalisation).gradient);
const gradientId = `agent-test-copy-leash-${Math.random().toString(36).slice(2, 8)}`;

const root = ref<HTMLElement | null>(null);
const transform = ref('');
const leashShown = ref(false);
const dragging = ref(false);
const line = ref({ x1: CENTER, y1: CENTER, x2: CENTER, y2: CENTER });
const path = ref('');

const state = {
	x: 0,
	y: 0,
	vx: 0,
	vy: 0,
	px: 0,
	py: 0,
	grabX: 0,
	grabY: 0,
	last: 0,
	hasPointer: false,
};
let frameId = 0;
const reduceMotion =
	typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where the avatar sits for the current pull: it resists first, then the leash holds it. */
function target(): { x: number; y: number } {
	const pull = Math.hypot(state.px, state.py);
	if (!leashShown.value && pull > LEASH_AFTER) leashShown.value = true;
	if (!pull) return { x: 0, y: 0 };
	if (!leashShown.value) {
		const give = RESIST * (1 - Math.exp(-pull / 30));
		return { x: (state.px / pull) * give, y: (state.py / pull) * give };
	}
	if (pull <= LENGTH) return { x: state.px, y: state.py };
	// It never lets go while held: past the leash length it follows at a slower rate.
	const reach = LENGTH + (pull - LENGTH) * 0.6;
	return { x: (state.px / pull) * reach, y: (state.py / pull) * reach };
}

function step(now: number) {
	const dt = Math.min(0.032, state.last ? (now - state.last) / 1000 : 0.016);
	state.last = now;

	if (dragging.value && state.hasPointer) {
		const next = target();
		state.vx = (next.x - state.x) / dt;
		state.vy = (next.y - state.y) / dt;
		state.x = next.x;
		state.y = next.y;
	} else if (!dragging.value) {
		// A damped spring back to the anchor, with a bounce.
		state.vx += (-90 * state.x - 8 * state.vx) * dt;
		state.vy += (-90 * state.y - 8 * state.vy) * dt;
		state.x += state.vx * dt;
		state.y += state.vy * dt;
	}

	const dist = Math.hypot(state.x, state.y);
	const tilt = Math.max(-20, Math.min(20, state.x * 0.25 + state.vx * 0.01));
	transform.value = `translate(${state.x}px, ${state.y}px) rotate(${tilt}deg)`;

	// A slack leash sags to one side; a taut one is straight.
	const ax = CENTER + state.x;
	const ay = CENTER + state.y;
	const slack = Math.max(0, 1 - dist / LENGTH);
	const ux = dist ? -state.x / dist : 0;
	const uy = dist ? -state.y / dist : 0;
	const sag = slack * Math.min(dist, 40) * 0.5;
	const cx = ax + ux * dist * 0.5 - uy * sag;
	const cy = ay + uy * dist * 0.5 + ux * sag;
	path.value = `M${ax} ${ay} Q ${cx} ${cy}, ${CENTER} ${CENTER}`;
	line.value = { x1: ax, y1: ay, x2: CENTER, y2: CENTER };

	if (!dragging.value && dist < 0.4 && Math.hypot(state.vx, state.vy) < 4) {
		state.x = 0;
		state.y = 0;
		state.vx = 0;
		state.vy = 0;
		transform.value = '';
		leashShown.value = false;
		frameId = 0;
		return;
	}
	frameId = requestAnimationFrame(step);
}

/** Runs only while the avatar moves, so a resting avatar costs nothing. */
function run() {
	if (frameId) return;
	state.last = 0;
	frameId = requestAnimationFrame(step);
}

function pointerOffset(event: PointerEvent) {
	const box = root.value?.getBoundingClientRect();
	return {
		x: event.clientX - (box?.left ?? 0) - CENTER,
		y: event.clientY - (box?.top ?? 0) - CENTER,
	};
}

function onPointerDown(event: PointerEvent) {
	if (reduceMotion) return;
	event.preventDefault();
	const point = pointerOffset(event);
	state.grabX = point.x;
	state.grabY = point.y;
	state.px = 0;
	state.py = 0;
	state.hasPointer = false;
	dragging.value = true;
	// Follow the pointer anywhere on the page, so a drag always ends.
	window.addEventListener('pointermove', onPointerMove);
	window.addEventListener('pointerup', letGo);
	window.addEventListener('pointercancel', letGo);
	window.addEventListener('blur', letGo);
	run();
}

function onPointerMove(event: PointerEvent) {
	if (!dragging.value) return;
	// A move without a pressed button means the release happened outside the page.
	if (event.buttons === 0) {
		letGo();
		return;
	}
	const point = pointerOffset(event);
	state.px = point.x - state.grabX;
	state.py = point.y - state.grabY;
	state.hasPointer = true;
}

function letGo() {
	dragging.value = false;
	state.hasPointer = false;
	window.removeEventListener('pointermove', onPointerMove);
	window.removeEventListener('pointerup', letGo);
	window.removeEventListener('pointercancel', letGo);
	window.removeEventListener('blur', letGo);
	run();
}

onBeforeUnmount(() => {
	letGo();
	cancelAnimationFrame(frameId);
	frameId = 0;
});
</script>

<template>
	<span ref="root" :class="$style.leash" data-testid="agent-test-copy-leash">
		<!-- The leash and its anchor sit behind the avatar, so they only show when pulled out. -->
		<svg
			v-if="leashShown"
			:class="$style.string"
			:viewBox="`0 0 ${SIZE} ${SIZE}`"
			aria-hidden="true"
		>
			<defs>
				<linearGradient
					:id="gradientId"
					gradientUnits="userSpaceOnUse"
					:x1="line.x1"
					:y1="line.y1"
					:x2="line.x2"
					:y2="line.y2"
				>
					<stop offset="0" :stop-color="gradient.to" />
					<stop offset="1" :stop-color="gradient.from" />
				</linearGradient>
			</defs>
			<path :d="path" :stroke="`url(#${gradientId})`" :class="$style.line" />
			<circle :cx="CENTER" :cy="CENTER" r="4" :fill="gradient.from" />
		</svg>
		<span
			:class="[$style.avatar, { [$style.dragging]: dragging }]"
			:style="{ transform }"
			@pointerdown="onPointerDown"
			@dragstart.prevent
		>
			<slot />
		</span>
	</span>
</template>

<style lang="scss" module>
.leash {
	position: relative;
	display: inline-block;
	width: 64px;
	height: 64px;
}

.string {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	overflow: visible;
	pointer-events: none;
}

.line {
	fill: none;
	stroke-width: 2;
	stroke-linecap: round;
}

.avatar {
	position: relative;
	display: inline-flex;
	cursor: grab;
	touch-action: none;
	user-select: none;
	will-change: transform;
}

.dragging {
	cursor: grabbing;
}
</style>
