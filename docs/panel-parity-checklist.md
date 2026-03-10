# Panel parity checklist

Use this checklist to verify Build 111-style panel hide/show ergonomics against current panel IDs.

## Per-panel hide/restore
- [ ] Hide each toggleable panel via its `Hide` control.
- [ ] Confirm the matching launcher appears in `#panel-launcher-strip`.
- [ ] Activate the launcher and confirm the original panel is restored.
- [ ] Confirm the panel launcher hides again after restore.

## Global toggle (`H`)
- [ ] Press `H` when any toggleable panel is visible: confirm all toggleable panels hide.
- [ ] Confirm launchers appear for hidden panels and `#panel-launcher-strip` is visible.
- [ ] Press `H` again: confirm all toggleable panels are restored.
- [ ] Confirm `#panel-launcher-strip` hides when no panel launchers are needed.
