<script lang="ts">
  const paths = {
    board: 'M4 4h16v16H4zM9 4v16M15 4v16',
    check: 'm5 12 4 4L19 6',
    chevron: 'm9 5 7 7-7 7',
    close: 'm6 6 12 12M6 18 18 6',
    edit: 'm16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5',
    plus: 'M12 5v14M5 12h14',
    sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  };
  let { name, size = 18 }: { name: keyof typeof paths; size?: number } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
