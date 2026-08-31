import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { DEFAULT_VARIANTS, VARIANT_AXES, VARIANT_PRESETS, type VariantState } from './variants';

const STORAGE_KEY = 'N8N_EXPERIMENT_VARIANTS';

/**
 * AI Trust prototype: which design alternative is on screen. One source of
 * truth, written from three places — the Variant menu in the toolbar, a query
 * parameter so a link renders deterministically for whoever opens it, and
 * localStorage so a session survives a reload.
 *
 * The repo's own experiment pattern reads PostHog, which needs a flag service
 * and cannot be flipped live; this is local on purpose.
 */
export const useVariantsStore = defineStore('experiments.variants', () => {
	const state = ref<VariantState>({ ...DEFAULT_VARIANTS, ...readStored(), ...readUrl() });

	function readStored(): Partial<VariantState> {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? (JSON.parse(raw) as Partial<VariantState>) : {};
		} catch {
			// A corrupt or unavailable store just means defaults.
			return {};
		}
	}

	/** Query parameters win over stored values, so a shared link is exact. */
	function readUrl(): Partial<VariantState> {
		const found: Partial<VariantState> = {};
		try {
			const params = new URLSearchParams(window.location.search);
			for (const axis of VARIANT_AXES) {
				const value = params.get(axis.param);
				if (value && axis.notches.some((notch) => notch.value === value)) {
					// The axis key and its notch type are paired by construction.
					Object.assign(found, { [axis.key]: value });
				}
			}
		} catch {
			// No window, no parameters — defaults are fine.
		}
		return found;
	}

	function persist() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value));
		} catch {
			// Private mode or blocked storage: the variant just won't survive a reload.
		}
	}

	function set<K extends keyof VariantState>(key: K, value: VariantState[K]) {
		state.value = { ...state.value, [key]: value };
		persist();
	}

	function applyPreset(presetId: string) {
		const preset = VARIANT_PRESETS.find((candidate) => candidate.id === presetId);
		if (!preset) return;
		state.value = { ...state.value, ...preset.values };
		persist();
	}

	function reset() {
		state.value = { ...DEFAULT_VARIANTS };
		persist();
	}

	/** The preset currently matching every axis, if any — for a tick in the menu. */
	const activePreset = computed(
		() =>
			VARIANT_PRESETS.find((preset) =>
				Object.entries(preset.values).every(
					([key, value]) => state.value[key as keyof VariantState] === value,
				),
			) ?? null,
	);

	/** A link that reproduces exactly what is on screen. */
	const shareUrl = computed(() => {
		try {
			const url = new URL(window.location.href);
			for (const axis of VARIANT_AXES) {
				url.searchParams.set(axis.param, String(state.value[axis.key]));
			}
			return url.toString();
		} catch {
			return '';
		}
	});

	return {
		localization: computed(() => state.value.localization),
		annotation: computed(() => state.value.annotation),
		secondCandidate: computed(() => state.value.secondCandidate),
		rankedCandidateCount: computed(() => state.value.rankedCandidateCount),
		state: computed(() => state.value),
		activePreset,
		shareUrl,
		set,
		applyPreset,
		reset,
	};
});
