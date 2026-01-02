# PoE2 Trade Import

Import item stats directly into the Path of Exile 2 trade site search filters.

A Tampermonkey userscript that adds an "Import Item" button to quickly populate search filters from copied item text.

## Features

- **Item Import** — Paste item text to automatically populate stat filters
- **Variance Control** — Adjust min/max search ranges with sliders
- **Generic Stats** — Option to combine attributes and resistances into weighted searches
- **Smart Parsing** — Handles implicit, explicit, and crafted modifiers

## Installation

### Tampermonkey (Recommended)

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. [Click here to install the script](https://github.com/marco-vrinssen/PoE2-Trade-Import/raw/main/PoE2-Trade-Import.js)
3. Click **Install** in Tampermonkey
4. Visit [PoE 2 Trade](https://www.pathofexile.com/trade2/) to use it

### Manual Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Click the Tampermonkey icon → Create a new script
3. Copy the contents of `PoE2-Trade-Import.js` into the editor
4. Save

## Usage

1. Copy item text from the game (Ctrl+C on an item)
2. Click the **Import Item** button on the trade site
3. Paste the item text and adjust settings
4. Click **Import** to populate the search filters

## License

MIT License — see [LICENSE](./LICENSE) for details.
