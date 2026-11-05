# Chess board photos

People-free photos of the owner's own chess board, taken from above by the webcam, with
the pieces in known positions. Each `NAME.png` has a `NAME.json` beside it:

```json
{
  "corners": [[x, y], [x, y], [x, y], [x, y]],
  "position": ["rank 8", "...", "rank 1"],
  "start": true
}
```

`corners` are the board's outer corners as fractions of the picture, top-left first,
clockwise. `position` is eight lines, rank 8 first: `W` a white piece, `B` a black
piece, `.` empty. The one photo with `"start": true` is the start position; the test
learns the board from it and reads every other photo.
