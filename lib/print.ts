'use client';

export function printElement(element: HTMLElement | null): void {
  if (typeof window === 'undefined') return;
  if (!element) {
    window.print();
    return;
  }

  const body = document.body;
  const oldBodyClass = body.classList.contains('printing-specific');
  const oldTarget = element.getAttribute('data-print-target');
  body.classList.add('printing-specific');
  element.setAttribute('data-print-target', 'active');

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('afterprint', cleanup);
    if (oldTarget === null) element.removeAttribute('data-print-target');
    else element.setAttribute('data-print-target', oldTarget);
    if (!oldBodyClass) body.classList.remove('printing-specific');
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    window.print();
  } finally {
    // Some mobile browsers do not fire afterprint after saving a PDF. Keep the
    // print scope alive long enough for the OS print/share sheet to snapshot it.
    window.setTimeout(cleanup, 30_000);
  }
}
