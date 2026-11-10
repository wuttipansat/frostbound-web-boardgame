# FROSTBOUND art style (UI-13)

An abandoned city buried in snow, seen as an isometric voxel diorama at dusk.

- **Stage:** the town sits on a floating square slab of packed snow (rock strata on its sides) with a soft shadow, over a plain dark blue-grey backdrop (`P.backdrop`). No sky.
- **Palette** (`src/render/palette.js`, ≤ 40 swatches): snow whites with cool blue shade; grey-blue concrete; muted sage/ochre walls; asphalt only in tyre ruts (`P.asphalt`), slush between (`P.slush`), half-buried white dashes; sidewalk tiles (`P.paving`) and kerbs (`P.kerb`); containers rust-red / navy / bottle-green; pines dark green under snow; warm orange-yellow light.
- **Snow rules:** every top surface gets a rounded cap (`VoxelModel.snowCap`); drifts against one side of walls and containers; frozen puddles; footprints on paths.
- **Streets:** each road is packed snow with two dark ruts; a strip of sidewalk tiles and a kerb on both sides; street lamps every road; one wrecked car on most roads (red sedan, blue hatch with headlights on, yellow taxi).
- **Lots:** shipping containers (1–2 high) on empty lots; trees and rocks fill the rest.
- **Light:** cold ambient + moonlight; warm point lights only at the fire, building doors and glowing voxels (lamps, windows, neon). Keep active point lights ≤ 8.
- **Fog of war:** thick white puffs over locked places (UI-10).
- **Scale:** buildings 0.3 world units per voxel (HD models at 0.15); props 0.15–0.2.
- **Not yet in this style:** place buildings are the earlier models with snow (no neon signs, roof AC units, ruins); characters and item icons are unchanged.
