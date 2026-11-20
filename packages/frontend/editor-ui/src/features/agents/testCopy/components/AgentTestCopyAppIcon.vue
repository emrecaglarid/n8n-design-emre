<script setup lang="ts">
import { N8nIcon, type IconName } from '@n8n/design-system';
import { computed } from 'vue';

import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';

import { TEST_COPY_APP_NODE_TYPES, type AgentTestChangeAppKey } from '../testCopy.utils';

const props = withDefaults(defineProps<{ appKey: AgentTestChangeAppKey; size?: number }>(), {
	size: 14,
});

const nodeTypesStore = useNodeTypesStore();

const nodeType = computed(() => {
	const name = TEST_COPY_APP_NODE_TYPES[props.appKey];
	return name ? nodeTypesStore.getNodeType(name) : null;
});

const FALLBACK_ICONS: Record<AgentTestChangeAppKey, IconName> = {
	gmail: 'mail',
	slack: 'message-square',
	googleSheets: 'table',
	hubspot: 'user-pen',
	shopify: 'package-open',
	other: 'globe',
};
</script>

<template>
	<NodeIcon v-if="nodeType" :node-type="nodeType" :size="size" aria-hidden="true" />
	<N8nIcon v-else :icon="FALLBACK_ICONS[appKey]" :size="size" aria-hidden="true" />
</template>
