/**
 * Prints only the given element (via the browser's native print-to-PDF), with the document title
 * set so "Save as PDF" suggests the given filename. There's no dependency-free way to trigger a
 * silent one-click PDF download from the browser with real, selectable text — this rides the native
 * print dialog instead, which produces a proper vector PDF (unlike canvas-screenshot approaches).
 */
export function printElementAsPdf(elementId, filename) {
  const style = document.createElement("style");
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #${elementId}, #${elementId} * { visibility: visible !important; }
      /* A positioned ancestor (e.g. a fixed modal overlay) would otherwise anchor the page below
         instead of the sheet's top-left corner, shifting it down and off the page. */
      *:has(#${elementId}) { position: static !important; transform: none !important; }
      #${elementId} {
        position: absolute; left: 0; top: 0; width: 210mm !important; height: 297mm !important;
        box-shadow: none !important; border: none !important; overflow: hidden !important;
        transform: none !important; /* on-screen previews zoom the page down to fit their column */
      }
      @page { size: A4; margin: 0; }
    }
  `;
  document.head.appendChild(style);

  const prevTitle = document.title;
  document.title = filename;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.title = prevTitle;
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 8000); // fallback in case afterprint doesn't fire

  window.print();
}
