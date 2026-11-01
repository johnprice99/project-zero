<script lang="ts">
  import iconLight from '../assets/icon-light.png';
  import iconDark from '../assets/icon-dark.png';
  import { version } from '../../package.json';
  // Typr's About panel: small and centred, in the same style as the palette. Esc or a click outside closes it.
  let { onclose }: { onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let close: HTMLButtonElement;
  const dark = document.documentElement.dataset.appearance === 'dark';
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); close.focus(); } });
</script>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<dialog bind:this={dialog} class="about-dialog" aria-labelledby="about-title" onclose={onclose} onmousedown={(e) => { if (e.target === dialog) dialog.close(); }}>
  <img src={dark ? iconDark : iconLight} width="96" height="96" alt=""/>
  <h2 id="about-title">Project Zero</h2>
  <p class="about-version">Version {version}</p>
  <p>A clear view of what's next.</p>
  <button class="about-close" bind:this={close} onclick={() => dialog.close()}>Close</button>
</dialog>
