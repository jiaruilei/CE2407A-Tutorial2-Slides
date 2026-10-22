# CE2407A Tutorial 2

Ten web slides for Tutorial 2, Week 10. Covers Tutorial Questions Set 1, Q6 and Q7, then Set 2, Q1 and Q2, followed by a blank whiteboard.

1. Tutorial 2
2. Tutorial 1 Q6: Original question statement
3. Tutorial 1 Q6: Earthquakes and liquefaction
4. Tutorial 1 Q7: Original question statement
5. Tutorial 1 Q7: Two independent detectors
6. Tutorial 2 Q1: Original question statement
7. Tutorial 2 Q1: Contractor bids
8. Tutorial 2 Q2: Original question statement
9. Tutorial 2 Q2: Density and moments
10. Blank whiteboard for handwritten equations

## Present

Open [the presentation](https://jiaruilei.github.io/CE2407A-Tutorial2-Slides/). Use the arrow keys or bottom buttons to change slides. Press O for overview and F for full screen. When a question has keyboard focus, use the bottom buttons to change slides.

The top question menu jumps directly to **Question** or **Explore** for T1 Q6, T1 Q7, T2 Q1 and T2 Q2. Its active item follows arrow navigation and browser history. **Open exercise** opens the current question in the responsive tutorial in a new tab, with normal-sized controls on phones. These study controls stay outside the scaled slides.

Phones retain the same slide layout and navigation. Rotate to landscape for larger text, or use **View larger** on a question statement to open its image viewer. Drag or scroll to pan, use the zoom buttons or select **Fit width**, then **Close** to return. The viewer preserves all crop proportions and leaves slide annotations intact. Reveal's automatic mobile scroll view is disabled because it reparents slides and breaks this deck's fixed layout and annotation surfaces.

Full screen uses the browser's standard or WebKit fullscreen API when available. If the browser does not support or allow it, **Expand view** uses the available browser window with compact controls. Select **Exit view** to return. On wide screens the controls move beside the slide to leave its full height available. The browser may keep its address bar visible. This mode does not claim to bypass that browser restriction.

Interactive slides use a larger panel with a compact heading. **Enlarge exercise** fills the slide, and **Back to slide** restores its layout. **More → Reset exercise** reloads only that exercise and clears its answers and chat. Leaving a slide preserves its calculations and chat.

The live exercises need an internet connection. T1 Q6 and T1 Q7 embed [CE2407A_Tutorial1](https://jiaruilei.github.io/CE2407A_Tutorial1/) with `question=q6` or `question=q7`. T2 Q1 and T2 Q2 embed [CE2407A_Tutorial2](https://jiaruilei.github.io/CE2407A_Tutorial2/) with `question=q1` or `question=q2`. Each iframe uses `embed=1`. The existing apps provide their calculations, MathJax and AI coaching. No API keys belong in this repository.

## Annotate

The final slide is a blank whiteboard. Reach it with the next-slide button after T2 Q2, or choose **Whiteboard** from the top menu. Select **Ink** to write equations. It supports the same pen, highlighter, eraser, undo/redo and automatic saving as the other slides.

Select **Ink** in the bottom controls to open the annotation toolbar. Use Pen or Highlighter with a classroom pen, mouse or touch input. Choose a color and thickness. Eraser removes a whole stroke. Undo, Redo and Clear ink apply to the current slide view. Clearing is undoable.

Choose **Pointer** or press Escape to interact with the question. Ink drawn over the embedded question follows its main page as you scroll. Scrolling inside the chat or other nested panels, and opening content that changes the layout, does not reposition existing ink. Normal and expanded layouts keep separate ink because the question reflows when expanded. Full screen and window resizing preserve alignment. Ink remains visible when the toolbar is closed.

Ink is saved automatically in this browser on this device, under a Tutorial 2 namespace separate from Tutorial 1. It is not synced to GitHub or other computers. Use one presentation tab when annotating the same slide. If browser storage is unavailable, ink remains available while the tab stays open. Ctrl+Z undoes ink and Ctrl+Y (or Ctrl+Shift+Z) redoes it while the toolbar is open. Text fields retain normal editing shortcuts.

The pen must send normal pen, mouse or touch input to the browser. This feature does not capture webcam video or require camera permission. Test the classroom device before teaching.

Run `npm test` with Node.js to check annotation history, storage validation, coordinate scaling and stroke erasing.

## Design and assets

The 1280 × 720 layout, navy and orange palette, Arial type, title positions, question snapshot scale, embedded panels and controls match [CE2407A-Tutorial1-Slides](https://github.com/jiaruilei/CE2407A-Tutorial1-Slides). All four stylesheets are unchanged. The cover QR code links to this deck and includes a four-module quiet zone. Reveal.js is bundled with its license in `LICENSE-reveal.txt`.

Question statements are cropped from the supplied Set 1 PDF (page 4, Q6 and Q7) and Set 2 PDF (page 1, Q1 and Q2). Every crop is rendered at 288 dpi and displayed at 2 CSS pixels per PDF point. Set 2 Q2 places its original diagram and subparts side by side below the statement and formula, retaining the same scale. The source manifest records every crop boundary and source PDF checksum. The original PDFs are not included in the repository.

The statement IDs are `question-t1-q6`, `question-t1-q7`, `question-t2-q1` and `question-t2-q2`. Cover and explore IDs are `slide-1` through `slide-5`; the final blank slide is `whiteboard`. Keep these IDs and the ink namespace stable when editing content.

## Local preview

Run `python -m http.server 4173` in this directory and open [http://localhost:4173](http://localhost:4173). Local previews can use the live exercises, but ink anchored to scrolling inside an exercise requires the same origin. The published slide and exercise sites share the same GitHub Pages origin. Run `npm test` to check ink persistence and fullscreen behavior.

## Publish

GitHub Pages serves the repository root from the main branch. No build step is required. Edit `index.html`, `styles.css` or `presentation.js` and push to main to update the slides.

