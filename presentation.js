'use strict';
import { installAnnotations } from './annotations.js?v=whiteboard-1';
import { createFullscreenController } from './fullscreen.js';
import { installQuestionViewer } from './question-viewer.js';
const deck = new Reveal({
  width: 1280, height: 720, margin: 0.015, minScale: 0.1, maxScale: 3,
  hash: true, history: true, controls: false, progress: true, center: false,
  transition: 'none', backgroundTransition: 'none', overview: true,
  // Keep our fixed slide layout, navigation and ink surfaces together on phones.
  scrollActivationWidth: null,
  keyboard: true, slideNumber: false,
  keyboardCondition: event => !document.querySelector('dialog[open]') &&
    document.getElementById('question-menu').hidden &&
    !event.target.closest?.('.exercise-options[open], input, textarea, select, [contenteditable="true"]') &&
    !(['Enter', ' '].includes(event.key) && event.target.closest?.('button, a, summary'))
});
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const counter = document.getElementById('counter');
const fullscreen = document.getElementById('fullscreen');
const questionMenu = document.getElementById('question-menu');
const questionMenuToggle = document.getElementById('question-menu-toggle');
const openExercise = document.getElementById('open-exercise');
const viewQuestion = document.getElementById('view-question');
const questionViewer = installQuestionViewer();

function setQuestionMenu(open, restoreFocus = false) {
  questionMenu.hidden = !open;
  questionMenuToggle.setAttribute('aria-expanded', String(open));
  if (restoreFocus) questionMenuToggle.focus();
}
questionMenuToggle.addEventListener('click', () => setQuestionMenu(questionMenu.hidden));
questionMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    if (deck.isOverview()) deck.toggleOverview(false);
    setQuestionMenu(false, true);
  });
});
viewQuestion.addEventListener('click', () => {
  if (deck.isOverview()) deck.toggleOverview(false);
  questionViewer.open(deck.getCurrentSlide());
});
document.addEventListener('click', event => {
  if (!event.target.closest('.question-navigation')) setQuestionMenu(false);
  document.querySelectorAll('.exercise-options[open]').forEach(menu => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
// Close transient controls before the presentation or annotation shortcuts run.
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || questionViewer.isOpen()) return;
  const exerciseMenu = deck.getCurrentSlide()?.querySelector('.exercise-options[open]');
  if (!questionMenu.hidden) setQuestionMenu(false, true);
  else if (exerciseMenu) { exerciseMenu.open = false; exerciseMenu.querySelector('summary').focus(); }
  else return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

function notice(message) {
  const element = document.getElementById('notice');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { element.hidden = true; }, 6000);
}

function loadQuestion(panel) {
  const frame = panel.querySelector('iframe');
  const loading = panel.querySelector('.web-loading');
  loading.textContent = 'Loading question…';
  loading.hidden = false;
  clearTimeout(panel.loadingTimer);
  panel.loadingTimer = setTimeout(() => {
    loading.textContent = 'Still loading. Select Open exercise above.';
  }, 15000);
  frame.onload = () => { clearTimeout(panel.loadingTimer); loading.hidden = true; };
  // Keep src when leaving a slide so calculations and chat remain intact.
  frame.src = frame.dataset.webSrc;
}

function setExpanded(panel, expanded) {
  panel.classList.toggle('is-expanded', expanded);
  const button = panel.querySelector('.expand-web');
  button.textContent = expanded ? 'Back to slide' : 'Enlarge exercise';
  button.setAttribute('aria-expanded', String(expanded));
  document.dispatchEvent(new CustomEvent('tutorial:layout'));
}

document.querySelectorAll('.web-panel').forEach(panel => {
  panel.querySelector('.reload-web').addEventListener('click', () => {
    const menu = panel.querySelector('.exercise-options');
    menu.open = false;
    menu.querySelector('summary').focus();
    loadQuestion(panel);
  });
  panel.querySelector('.expand-web').addEventListener('click', () => setExpanded(panel, !panel.classList.contains('is-expanded')));
});

function sync() {
  const index = deck.getIndices().h;
  counter.textContent = `${index + 1} / ${deck.getTotalSlides()}`;
  previous.disabled = deck.isFirstSlide();
  next.disabled = deck.isLastSlide();
  const slide = deck.getCurrentSlide();
  document.title = `${slide.dataset.title} · CE2407A Tutorial 2`;
  const question = slide.dataset.question;
  const questionLabel = question ? `T${slide.dataset.tutorial} Q${question}` : '';
  const isStatement = slide.classList.contains('question-statement');
  const isWhiteboard = slide.id === 'whiteboard';
  document.getElementById('current-question').textContent = question
    ? `${questionLabel} · ${isStatement ? 'Question' : 'Explore'}` : isWhiteboard ? 'Whiteboard' : 'Questions';
  viewQuestion.hidden = !isStatement;
  openExercise.hidden = isWhiteboard;
  openExercise.href = slide.dataset.exerciseUrl || 'https://jiaruilei.github.io/CE2407A_Tutorial2/';
  openExercise.textContent = question ? 'Open exercise' : 'Open exercises';
  openExercise.setAttribute('aria-label', question ? `Open ${questionLabel} exercise in a new tab` : 'Open exercises in a new tab');
  questionMenu.querySelectorAll('a').forEach(link => {
    if (link.getAttribute('href') === `#/${slide.id}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const panel = slide.querySelector('.web-panel');
  if (panel && !panel.querySelector('iframe').hasAttribute('src')) loadQuestion(panel);
}

let fullscreenState;
const screenController = createFullscreenController({
  document,
  onFallback(expanded) {
    document.body.classList.toggle('is-expanded-view', expanded);
    if (deck.isReady()) deck.layout();
    document.dispatchEvent(new CustomEvent('tutorial:layout'));
  },
  onChange(state) {
    fullscreenState = state;
    const label = state.mode === 'native' ? 'Exit full screen'
      : state.mode === 'fallback' ? 'Exit view'
      : state.nativeSupported ? 'Full screen' : 'Expand view';
    fullscreen.textContent = label;
    fullscreen.title = state.mode === 'fallback' ? 'Exit expanded view' : label;
    fullscreen.setAttribute('aria-label', fullscreen.title);
    fullscreen.setAttribute('aria-pressed', String(state.expanded));
    fullscreen.disabled = state.pending;
    if (deck.isReady()) deck.layout();
    document.dispatchEvent(new CustomEvent('tutorial:layout'));
  }
});
const toggleFullscreen = () => screenController.toggle();
previous.addEventListener('click', () => deck.prev());
next.addEventListener('click', () => deck.next());
document.getElementById('overview').addEventListener('click', () => deck.toggleOverview());
fullscreen.addEventListener('click', toggleFullscreen);
installAnnotations(deck, notice);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const panel = deck.getCurrentSlide()?.querySelector('.is-expanded');
    if (panel) {
      setExpanded(panel, false);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (fullscreenState.mode === 'fallback') {
      screenController.exit();
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}, true);
deck.on('slidechanged', event => {
  event.previousSlide?.querySelectorAll('.is-expanded').forEach(panel => setExpanded(panel, false));
  event.previousSlide?.querySelectorAll('.exercise-options[open]').forEach(menu => { menu.open = false; });
  setQuestionMenu(false);
  sync();
});
deck.initialize().then(() => {
  deck.addKeyBinding({ keyCode: 79, key: 'O', description: 'Slide overview' }, () => deck.toggleOverview());
  deck.addKeyBinding({ keyCode: 70, key: 'F', description: 'Full screen' }, toggleFullscreen);
  sync();
});
