<script setup lang="ts">
import { computed, ref } from 'vue';
import { N8nIcon } from '@n8n/design-system';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { GOOGLE_GMAIL_NODE_TYPE } from '@/app/constants/nodeTypes';
import type { SimulatedPreview } from '../simulatedOutputPreview.store';

/**
 * AI Trust prototype: the thumbs-down modal. The output is shown as itself,
 * the reason is a chip or a sentence, and "correct output" prefills with what
 * the agent said so the edit reads as "what it should have said". Saving needs
 * at least one signal — a bare 👎 with nothing attached teaches nothing.
 */
const props = defineProps<{
	preview: SimulatedPreview;
}>();

const emit = defineEmits<{
	save: [details: { reason: string; correction?: string }];
	cancel: [];
}>();

const nodeTypesStore = useNodeTypesStore();
const nodeType = computed(() => nodeTypesStore.getNodeType(props.preview.nodeType));

const title = computed(() => {
	if (props.preview.kind === 'slack') return 'Slack message';
	return props.preview.nodeType === GOOGLE_GMAIL_NODE_TYPE ? 'Gmail' : 'Email';
});

const REASON_CHIPS = ['Wrong data', 'Too long', 'Wrong tone', 'Off-brand', "Shouldn't send at all"];

const selectedChip = ref<string | null>(null);
const explainText = ref('');
const originalText = computed(() =>
	props.preview.kind === 'slack' ? (props.preview.messageText ?? '') : (props.preview.body ?? ''),
);
const correctionText = ref(originalText.value);

const canSave = computed(
	() =>
		selectedChip.value !== null ||
		explainText.value.trim().length > 0 ||
		correctionText.value.trim() !== originalText.value.trim(),
);

function onSave() {
	if (!canSave.value) return;
	const parts = [selectedChip.value, explainText.value.trim()].filter(Boolean);
	const correction =
		correctionText.value.trim() !== originalText.value.trim()
			? correctionText.value.trim()
			: undefined;
	emit('save', { reason: parts.join(' — ') || 'Corrected the output', correction });
}
</script>

<template>
	<Teleport to="body">
		<div :class="$style.scrim" data-test-id="output-verdict-modal" @click.self="emit('cancel')">
			<div :class="$style.modal">
				<div :class="$style.header">
					<NodeIcon :node-type="nodeType" :size="18" />
					<span :class="$style.title">{{ title }}</span>
					<button :class="$style.close" @click="emit('cancel')">
						<N8nIcon icon="x" size="medium" />
					</button>
				</div>

				<div :class="$style.body">
					<div :class="$style.outputBox">
						<template v-if="preview.kind === 'email'">
							<div :class="$style.emailMeta">
								<span><b>To:</b> {{ preview.to }}</span>
								<span><b>From:</b> {{ preview.from }}</span>
								<span><b>Subject:</b> {{ preview.subject }}</span>
							</div>
						</template>
						<template v-else>
							<div :class="$style.emailMeta">
								<span
									><b>#{{ preview.channel?.replace(/^#/, '') }}</b></span
								>
							</div>
						</template>
						<div :class="$style.outputText">{{ originalText }}</div>
					</div>

					<span :class="$style.sectionLabel">What's wrong with this output?</span>
					<div :class="$style.chipRow">
						<button
							v-for="chip in REASON_CHIPS"
							:key="chip"
							:class="[$style.chip, selectedChip === chip && $style.chipSelected]"
							@click="selectedChip = selectedChip === chip ? null : chip"
						>
							{{ chip }}
						</button>
					</div>

					<span :class="$style.sectionLabel">Explain (Optional)</span>
					<textarea
						v-model="explainText"
						:class="$style.input"
						rows="2"
						placeholder="e.g. Clients shouldn't be asked to react with an emoji, just tell them the due date."
						data-test-id="output-verdict-explain"
					/>

					<span :class="$style.sectionLabel">Correct output (Optional)</span>
					<textarea
						v-model="correctionText"
						:class="[$style.input, $style.correctionInput]"
						rows="5"
						data-test-id="output-verdict-correction"
					/>
				</div>

				<div :class="$style.footer">
					<button :class="$style.cancelButton" @click="emit('cancel')">Cancel</button>
					<button
						:class="$style.saveButton"
						:disabled="!canSave"
						data-test-id="output-verdict-save"
						@click="onSave"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<style lang="scss" module>
.scrim {
	position: fixed;
	inset: 0;
	z-index: 2000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.45);
}

.modal {
	display: flex;
	flex-direction: column;
	width: 566px;
	max-width: 92vw;
	max-height: 88vh;
	background: var(--color--background--light-3, #fff);
	border-radius: var(--radius--lg);
	box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	padding: var(--spacing--xs) var(--spacing--sm);
	border-bottom: var(--border);
}

.title {
	flex-grow: 1;
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.close {
	display: flex;
	align-items: center;
	background: transparent;
	border: none;
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.body {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	padding: var(--spacing--sm);
	overflow-y: auto;
}

.outputBox {
	display: flex;
	flex-direction: column;
	border: var(--border);
	border-radius: var(--radius);
	overflow: hidden;
}

.emailMeta {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-bottom: var(--border);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
}

.outputText {
	padding: var(--spacing--2xs) var(--spacing--xs);
	font-size: var(--font-size--xs);
	color: var(--color--text);
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	max-height: 180px;
	overflow-y: auto;
}

.sectionLabel {
	margin-top: var(--spacing--3xs);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.chipRow {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--3xs);
}

.chip {
	background: var(--color--background--light-3, #fff);
	border: 1px solid var(--color--foreground);
	border-radius: 15px;
	padding: 5px 12px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	cursor: pointer;
	transition-property: scale, border-color, background-color;
	transition-duration: 100ms;

	&:hover {
		border-color: var(--color--text--tint-1);
	}

	&:active {
		scale: 0.96;
	}
}

.chipSelected {
	border-color: var(--color--primary);
	background: var(--color--primary--tint-4, #fdefe9);
	color: var(--color--primary);
	font-weight: var(--font-weight--bold);
}

.input {
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	font-family: var(--font-family);
	font-size: var(--font-size--xs);
	color: var(--color--text);
	padding: var(--spacing--2xs);
	resize: vertical;
	line-height: 1.5;

	&::placeholder {
		color: var(--color--text--tint-1);
	}
}

.correctionInput {
	color: var(--color--text--tint-1);

	&:focus {
		color: var(--color--text);
	}
}

.footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: var(--spacing--2xs);
	padding: var(--spacing--2xs) var(--spacing--sm);
	border-top: var(--border);
}

.cancelButton {
	background: transparent;
	border: none;
	font-size: var(--font-size--xs);
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.saveButton {
	background: var(--color--primary);
	border: none;
	border-radius: var(--radius);
	color: #fff;
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
	padding: 7px 16px;
	cursor: pointer;
	transition-property: scale;
	transition-duration: 100ms;

	&:active:not(:disabled) {
		scale: 0.96;
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}
</style>
