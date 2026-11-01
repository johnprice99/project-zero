<script lang="ts">
  let { title, message, action, onconfirm, onclose }: { title: string; message: string; action: string; onconfirm: () => void; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let cancel: HTMLButtonElement;
  $effect(() => { if (dialog && !dialog.open) { dialog.showModal(); cancel.focus(); } });
</script>
<dialog bind:this={dialog} class="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message" onclose={onclose}>
  <h2 id="confirm-title">{title}</h2><p id="confirm-message">{message}</p><div class="dialog-actions"><button bind:this={cancel} onclick={() => dialog.close()}>Cancel</button><button class="confirm-action" onclick={onconfirm}>{action}</button></div>
</dialog>
