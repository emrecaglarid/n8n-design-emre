/**
 * Hands a position between the Slack button above the input and the chip in
 * the input, so one can fly from where the other was: the chip in, and the
 * button back when the chip is removed. They live in different slots of the
 * chat panel.
 */
let from: DOMRect | null = null;

export function markFlightStart(element: Element | null | undefined) {
	from = element?.getBoundingClientRect() ?? null;
}

const FLIGHT_MS = 320;

/** Plays the flight once, then forgets the start. Skipped with reduced motion. */
export function flyIn(element: HTMLElement | null | undefined) {
	const start = from;
	from = null;
	if (!start || !element || typeof element.animate !== 'function') return;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
	const end = element.getBoundingClientRect();
	const dx = start.left - end.left;
	const dy = start.top - end.top;
	element.animate(
		[
			{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.6 },
			{ transform: 'translate(0, 0)', opacity: 1 },
		],
		{ duration: FLIGHT_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
	);
}

const RESIZE_MS = 240;

function reducedMotion() {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Runs `callback` once the input has finished growing or shrinking. Focusing
 * the input earlier draws its focus ring while the resize clips it, so the
 * ring flashes in and out.
 */
export function afterResize(callback: () => void) {
	if (reducedMotion()) {
		callback();
		return;
	}
	window.setTimeout(callback, RESIZE_MS + 20);
}

/** The whole input, so its height includes every gap and padding around the chip. */
function inputBox(strip: HTMLElement) {
	return strip.closest<HTMLElement>('[data-testid="chat-input"]');
}

/** The input's height with and without the chip strip. */
function heights(box: HTMLElement, strip: HTMLElement) {
	const withStrip = box.getBoundingClientRect().height;
	const display = strip.style.display;
	strip.style.display = 'none';
	const withoutStrip = box.getBoundingClientRect().height;
	strip.style.display = display;
	return { withStrip, withoutStrip };
}

/** The input grows to make room for the chip strip, instead of jumping taller. */
export function growIn(strip: HTMLElement | null | undefined) {
	const box = strip ? inputBox(strip) : null;
	if (!strip || !box || typeof box.animate !== 'function' || reducedMotion()) return;
	const { withStrip, withoutStrip } = heights(box, strip);
	box.animate(
		[
			{ height: `${withoutStrip}px`, overflow: 'hidden' },
			{ height: `${withStrip}px`, overflow: 'hidden' },
		],
		{ duration: RESIZE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
	);
}

/**
 * The input shrinks back before the chip strip leaves it. Resolves with a
 * function that releases the held height once the strip is gone.
 */
export async function shrinkOut(strip: HTMLElement | null | undefined): Promise<() => void> {
	const box = strip ? inputBox(strip) : null;
	if (!strip || !box || typeof box.animate !== 'function' || reducedMotion()) return () => {};
	const { withStrip, withoutStrip } = heights(box, strip);
	strip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: RESIZE_MS, fill: 'forwards' });
	const animation = box.animate(
		[
			{ height: `${withStrip}px`, overflow: 'hidden' },
			{ height: `${withoutStrip}px`, overflow: 'hidden' },
		],
		{ duration: RESIZE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
	);
	await animation.finished.catch(() => {});
	return () => animation.cancel();
}
