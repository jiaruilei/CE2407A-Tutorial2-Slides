const PAGE_WIDTH = 1280;
const PAGE_HEIGHT = 720;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

/** Enlarge a statement without moving its slide or copying its annotations. */
export function installQuestionViewer({ onOpen = () => {}, onClose = () => {} } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'question-viewer';
  dialog.setAttribute('aria-label', 'Question viewer');
  dialog.innerHTML = `
    <header class="question-viewer-toolbar">
      <h2 class="question-viewer-title"></h2>
      <button class="question-viewer-close" type="button" autofocus>Close</button>
      <div class="question-viewer-zoom" role="group" aria-label="Question zoom">
        <button type="button" data-question-zoom="out" aria-label="Zoom out">−</button>
        <output class="question-viewer-percent" aria-live="polite" aria-atomic="true">100%</output>
        <button type="button" data-question-zoom="fit">Fit width</button>
        <button type="button" data-question-zoom="in" aria-label="Zoom in">+</button>
      </div>
    </header>
    <div class="question-viewer-viewport" tabindex="0" role="region" aria-label="Question image">
      <div class="question-viewer-stage"><div class="question-viewer-page"></div></div>
    </div>`;
  document.body.append(dialog);

  const title = dialog.querySelector('.question-viewer-title');
  const closeButton = dialog.querySelector('.question-viewer-close');
  const viewport = dialog.querySelector('.question-viewer-viewport');
  const stage = dialog.querySelector('.question-viewer-stage');
  const page = dialog.querySelector('.question-viewer-page');
  const percent = dialog.querySelector('.question-viewer-percent');
  const zoomOut = dialog.querySelector('[data-question-zoom="out"]');
  const zoomIn = dialog.querySelector('[data-question-zoom="in"]');
  let zoom = 1;
  let fitted = false;
  let sessionOpen = false;
  let drag = null;

  function setZoom(value, preserveCenter = true) {
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2 -
      Math.max(0, (viewport.clientWidth - PAGE_WIDTH * zoom) / 2)) / zoom;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / zoom;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
    stage.style.width = `${PAGE_WIDTH * zoom}px`;
    stage.style.height = `${PAGE_HEIGHT * zoom}px`;
    page.style.transform = `scale(${zoom})`;
    percent.value = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= MIN_ZOOM;
    zoomIn.disabled = zoom >= MAX_ZOOM;
    if (preserveCenter) {
      viewport.scrollLeft = centerX * zoom - viewport.clientWidth / 2 +
        Math.max(0, (viewport.clientWidth - PAGE_WIDTH * zoom) / 2);
      viewport.scrollTop = centerY * zoom - viewport.clientHeight / 2;
    }
  }

  function fitWidth() {
    fitted = true;
    setZoom(viewport.clientWidth / PAGE_WIDTH, false);
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }

  function endDrag() {
    if (drag && viewport.hasPointerCapture?.(drag.id)) viewport.releasePointerCapture(drag.id);
    drag = null;
    viewport.classList.remove('is-dragging');
  }

  function closed() {
    if (dialog.open || !sessionOpen) return;
    sessionOpen = false;
    endDrag();
    onClose();
  }

  function close() {
    if (dialog.open) dialog.close();
    closed();
  }

  function open(slide) {
    const heading = slide?.querySelector('.slide-heading');
    const images = slide?.querySelectorAll('.question-crop');
    if (!slide?.classList.contains('question-statement') || !heading || !images?.length) return false;

    const headingStyle = getComputedStyle(heading);
    const headingCopy = document.createElement('h2');
    headingCopy.className = 'question-viewer-page-heading';
    headingCopy.textContent = heading.textContent;
    for (const property of ['left', 'top', 'width', 'color', 'font-family', 'font-size',
      'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align']) {
      headingCopy.style.setProperty(property, headingStyle.getPropertyValue(property));
    }
    const copies = [...images].map(source => {
      const copy = document.createElement('img');
      const style = getComputedStyle(source);
      copy.className = 'question-viewer-crop';
      copy.src = source.currentSrc || source.src;
      copy.alt = source.alt;
      copy.draggable = false;
      for (const property of ['left', 'top', 'width', 'height']) {
        copy.style.setProperty(property, style.getPropertyValue(property));
      }
      return copy;
    });
    page.replaceChildren(headingCopy, ...copies);
    title.textContent = heading.textContent;
    dialog.setAttribute('aria-label', `${heading.textContent.trim()} · enlarged image`);
    viewport.setAttribute('aria-label', `${heading.textContent.trim()} image`);
    const wasOpen = dialog.open;
    if (!wasOpen) dialog.showModal();
    fitted = viewport.clientWidth >= 800;
    const initialZoom = fitted ? Math.min(1, viewport.clientWidth / PAGE_WIDTH,
      viewport.clientHeight / PAGE_HEIGHT) : 0.9;
    setZoom(initialZoom, false);
    const leftEdge = Math.min(parseFloat(headingStyle.left) || 0,
      ...copies.map(copy => parseFloat(copy.style.left) || 0));
    viewport.scrollLeft = fitted ? 0 : Math.max(0, (leftEdge - 20) * zoom);
    viewport.scrollTop = 0;
    if (!wasOpen) {
      sessionOpen = true;
      onOpen();
    }
    return true;
  }

  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', closed);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  zoomOut.addEventListener('click', () => { fitted = false; setZoom(zoom / 1.25); });
  zoomIn.addEventListener('click', () => { fitted = false; setZoom(zoom * 1.25); });
  dialog.querySelector('[data-question-zoom="fit"]').addEventListener('click', fitWidth);

  // Capture above Reveal and the ink shortcuts. Browser keyboard defaults such
  // as Tab, button activation, and scrolling remain available inside the modal.
  window.addEventListener('keydown', event => {
    if (!dialog.open) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }, true);
  window.addEventListener('resize', () => {
    if (!dialog.open) return;
    endDrag();
    if (fitted) fitWidth();
    else setZoom(zoom);
  });

  // Touch uses native scrolling. Mouse and pen can drag the enlarged page.
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary ||
      !event.target.closest('.question-viewer-stage')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
    viewport.focus({ preventScroll: true });
    event.preventDefault();
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    viewport.scrollLeft = drag.left - event.clientX + drag.x;
    viewport.scrollTop = drag.top - event.clientY + drag.y;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    viewport.addEventListener(event, endDrag);
  }

  return { open, close, isOpen: () => dialog.open };
}
