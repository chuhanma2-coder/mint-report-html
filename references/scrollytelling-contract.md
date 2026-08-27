# Scrollytelling and interaction contract

- Use semantic `<section class="mint-scene">` elements with stable `data-scene-id` values.
- Each scene starts with a visible management answer and follows one natural axis: top-to-bottom, left-to-right, center-out, or staged focus.
- Each scene contains `.mint-scene__viewport > .mint-scene__stage`. Desktop and PDF compose the stage at 1920×1080 and scale it uniformly; mobile removes the transform and reflows the same content. Supporting details may follow the viewport. Use `scroll-snap-type:y proximity`.
- Visible previous/next controls remain available at the left and right edges in addition to scrolling. Left/Right, Up/Down, and Page Up/Down navigate to neighboring scenes when the user is not editing text.
- Navigation exposes every scene title and current progress. The first/last previous/next control is visibly disabled instead of wrapping unexpectedly.
- A visible edit control and the `E` shortcut are mandatory in every generated file. Both enter the same field-contract editing state; only `[data-edit-policy="editable"]` fields become editable. Editing is a default runtime capability, not an optional feature requested by prompt.
- Edit mode highlights only hovered or focused fields. It must not alter typography, color, geometry, or make navigation and locked/derived fields editable.
- Motion must encode entrance, progression, comparison, change, or focus. Limit the report to three motion primitives.
- Honor `prefers-reduced-motion`; no information may disappear when motion is disabled.
- Tabs, filters, details, and media enlargement supplement visible conclusions. A key conclusion may not exist only in a tooltip, hidden tab, or modal.
- Print mode hides controls, disables motion, opens required details, and preserves source references.
- The first view and all core content must work offline in one HTML file.
