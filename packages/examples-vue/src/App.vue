<script setup lang="ts">
/**
 * Root component — just the router outlet. The Vue vertical's shell, kept minimal so each route owns
 * its own layout (matching the React/Svelte apps).
 */
import { RouterView } from 'vue-router';
</script>

<template>
	<RouterView />
</template>
