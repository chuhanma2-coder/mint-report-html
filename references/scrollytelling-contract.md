# Scrollytelling and interaction contract

- Use semantic `<section class="mint-scene">` elements with stable `data-scene-id` values.
- Each scene starts with a visible management answer and follows one natural axis: top-to-bottom, left-to-right, center-out, or staged focus.
- Scenes use `min-height:100svh` and may grow. Use `scroll-snap-type:y proximity`.
- Arrow keys and Page Up/Down navigate to neighboring scenes without trapping normal scrolling.
- Navigation exposes every scene title and current progress.
- Motion must encode entrance, progression, comparison, change, or focus. Limit the report to three motion primitives.
- Honor `prefers-reduced-motion`; no information may disappear when motion is disabled.
- Tabs, filters, details, and media enlargement supplement visible conclusions. A key conclusion may not exist only in a tooltip, hidden tab, or modal.
- Print mode hides controls, disables motion, opens required details, and preserves source references.
- The first view and all core content must work offline in one HTML file.
