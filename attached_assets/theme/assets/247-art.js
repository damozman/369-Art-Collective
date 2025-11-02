
document.addEventListener('DOMContentLoaded', () => {
  const formatRadios = document.querySelectorAll('input[name="properties[Format]"]');
  const physicalEls = document.querySelectorAll('[data-physical-only]');
  const digitalEls = document.querySelectorAll('[data-digital-only]');
  const sizeSelect = document.getElementById('size-select');
  const finishRadios = document.querySelectorAll('input[name="properties[Finish]"]');
  const variantIdInput = document.getElementById('selected-variant-id');

  function setMode(mode) {
    const isDigital = mode === 'digital';
    physicalEls.forEach(el => el.style.display = isDigital ? 'none' : '');
    digitalEls.forEach(el => el.style.display = isDigital ? '' : 'none');
  }

  function findVariantId() {
    // naive matching by option names; assumes product options are Size, Finish
    const size = sizeSelect?.value;
    const finish = Array.from(finishRadios).find(r => r.checked)?.value;
    const variants = window?.ShopifyAnalytics?.meta?.product?.variants || [];
    const found = variants.find(v => v.name?.includes(size) && v.name?.includes(finish));
    if (found && variantIdInput) variantIdInput.value = found.id;
  }

  formatRadios.forEach(r => r.addEventListener('change', e => setMode(e.target.dataset.format)));
  sizeSelect?.addEventListener('change', findVariantId);
  finishRadios.forEach(r => r.addEventListener('change', findVariantId));

  // initialize
  const checked = Array.from(formatRadios).find(r => r.checked);
  setMode(checked?.dataset.format || 'physical');
  findVariantId();
});
