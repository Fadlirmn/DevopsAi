<script lang="ts">
	import { toast } from '#lib/ui.svelte';
</script>

<div id="toast" class="toast" role="status" hidden={!toast.text}>{toast.text}</div>
