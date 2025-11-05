# Engine Move Suggestion Overlay Implementation Notes

## Overview
This document describes the implementation of engine move suggestion overlays with color-coded squares and arrows for the top 3 engine moves.

## Color Scheme (Matching Legacy)
Following the legacy purrfect-chess implementation, engine moves use a distinct color lineage:

1. **Best Move (#1)**: Blue - `rgba(59, 130, 246, ...)`
2. **Second Best (#2)**: Green - `rgba(16, 185, 129, ...)`
3. **Third Best (#3)**: Pink - `rgba(244, 114, 182, ...)`

## Implementation Components

### 1. CSS Styling (`app/globals.css`)

#### Square Highlights
```css
.square.engine-move-1::after { background: rgba(59, 130, 246, 0.45); }
.square.engine-move-2::after { background: rgba(16, 185, 129, 0.45); }
.square.engine-move-3::after { background: rgba(244, 114, 182, 0.45); }
```

#### Arrow Overlays
```css
.board-arrow.engine-arrow-1 { stroke: rgba(59, 130, 246, 0.95); }
.board-arrow.engine-arrow-2 { stroke: rgba(16, 185, 129, 0.95); }
.board-arrow.engine-arrow-3 { stroke: rgba(244, 114, 182, 0.95); }
```

### 2. Board Component (`components/Board.tsx`)

**Engine Highlight Application** (Lines 760-776):
```typescript
const showEngineSquares = engineDisplayMode === 'both' || engineDisplayMode === 'squares';
let engineHighlightRank: number | null = null;

if (showEngineSquares && engineHighlights.length > 0) {
  for (const highlight of engineHighlights) {
    if (highlight.from === square || highlight.to === square) {
      if (engineHighlightRank === null || highlight.rank < engineHighlightRank) {
        engineHighlightRank = Math.min(Math.max(highlight.rank, 1), 3);
      }
    }
  }
}

if (engineHighlightRank !== null) {
  squareClasses += ` engine-move-${engineHighlightRank}`;
}
```

**Engine Arrow Rendering** (Lines 869-882):
```typescript
<ArrowOverlay
  userArrows={Array.from(userArrows.values())}
  engineArrows={
    engineDisplayMode === 'arrows' || engineDisplayMode === 'both'
      ? engineHighlights
          .filter((h) => h.from && h.to)
          .map((h) => ({
            from: h.from!,
            to: h.to!,
            rank: h.rank,
          }))
      : []
  }
  previewArrow={previewArrow}
/>
```

### 3. Arrow Overlay Component (`components/ArrowOverlay.tsx`)

**Engine Arrow Rendering** (Lines 238-259):
```typescript
{engineArrows.map((arrow, index) => {
  const pathData = buildArrowPath(arrow.from, arrow.to);
  if (!pathData) return null;

  const rank = Math.min(Math.max(arrow.rank ?? 1, 1), 3);

  return (
    <path
      key={`engine-arrow-${index}`}
      className={`board-arrow engine-arrow engine-arrow-${rank}`}
      d={pathData}
      fill="none"
      strokeWidth={ARROW_THICKNESS}
      strokeLinecap="butt"
      strokeLinejoin="round"
      markerEnd={`url(#${ARROW_HEAD_ID})`}
      style={{ pointerEvents: 'none' }}
    />
  );
})}
```

### 4. Engine Panel Component (`components/EnginePanel.tsx`)

**Matching Color Indicators** (Lines 33-37):
```typescript
const LINEAGE_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.6)' },  // blue
  { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.6)' },  // green
  { bg: 'rgba(244, 114, 182, 0.15)', border: 'rgba(244, 114, 182, 0.6)' }, // pink
];
```

### 5. Data Flow (`app/page.tsx`)

**Analysis to Highlights Conversion** (Lines 70-76):
```typescript
const engineHighlights: EngineHighlight[] = analysis
  .filter(line => line.bestMove && line.bestMove.length >= 4)
  .map((line, index) => ({
    from: line.bestMove.slice(0, 2),
    to: line.bestMove.slice(2, 4),
    rank: index + 1, // 1-based rank (1 = best move)
  }));
```

## Display Modes

The engine overlay supports three display modes:

1. **Squares Only**: Highlights from/to squares with colored overlays
2. **Arrows Only**: Draws colored arrows showing the moves
3. **Both**: Shows both square highlights and arrows simultaneously

User can toggle between modes using the "Overlay" controls in the Engine Panel.

## Right-Click Interaction

The board supports user-drawn overlays independent of engine suggestions:

- **Right-click (short)**: Toggle square highlight (purple color)
- **Right-click drag**: Draw arrow between squares

These user overlays are distinct from engine suggestions and use different colors to avoid confusion.

## Legacy Parity

The implementation matches the legacy behavior exactly:

- Same color scheme (blue/green/pink)
- Same display modes (squares/arrows/both)
- Same multi-PV analysis (top 3 moves)
- Same overlay rendering logic
- User arrows remain independent and use blue color

## Testing Verification

To verify the implementation:

1. Start the app and make a move
2. Type "gmmamun" to reveal the engine panel
3. Click "Start Analysis"
4. Observe top 3 moves with color-coded overlays:
   - Move #1: Blue squares/arrows
   - Move #2: Green squares/arrows
   - Move #3: Pink squares/arrows
5. Toggle overlay modes (squares/arrows/both)
6. Verify colors match the engine panel indicators

## Design Decisions

1. **Color Clamping**: Rank is clamped to 1-3 to handle edge cases
2. **Highest Priority**: When a square appears in multiple moves, the lowest rank (highest priority) is displayed
3. **Performance**: Arrows are memoized to prevent unnecessary re-renders
4. **Separation**: User arrows (blue) are rendered separately from engine arrows (ranked colors)

## Differences from Legacy

None identified - implementation matches legacy behavior exactly.
