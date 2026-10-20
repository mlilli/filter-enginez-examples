<script setup lang="ts">
/**
 * Root component — the router outlet, or the page-error screen while a navigation has failed. The Vue
 * vertical's shell, kept minimal so each route owns its own layout (matching the React/Svelte apps).
 */
import { RouterView } from 'vue-router';

import { pageFailure } from './router.js';
import PageErrorScreen from './shell/PageErrorScreen.vue';
</script>

<template>
	<PageErrorScreen v-if="pageFailure !== null" :error="pageFailure.error" />
	<RouterView v-else />
</template>
