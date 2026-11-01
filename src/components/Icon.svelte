<script lang="ts">
  export let name = 'plus';
  export let size = 18;
  const paths: Record<string, string> = {
    edit: 'm16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    plus: 'M12 5v14M5 12h14', board: 'M4 4h16v16H4zM9 4v16M15 4v16',
    sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    moon: 'M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z',
    monitor: 'M3 4h18v13H3zM8 21h8M12 17v4', chevron: 'm9 5 7 7-7 7',
    close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6',
    search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    note: 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5', arrow: 'm7 10 5-5 5 5M12 5v14',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01'
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name] || paths.plus}/></svg>
