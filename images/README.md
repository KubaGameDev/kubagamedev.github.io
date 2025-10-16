# Images Directory

This directory contains images used throughout the Jumpkat website.

## Game Thumbnails

To add thumbnail images for games displayed on the game selection page (`games/index.html`):

1. Place your game thumbnail images in this `/images` directory
2. Use a descriptive name for your image file (e.g., `pong-thumbnail.png`, `snake-thumbnail.jpg`)
3. Update the corresponding game link in `games/index.html` to reference your new thumbnail

### Example:

Current code in `games/index.html`:
```html
<div class="game-button"><a href="pong.html">Pong<br><img src="../images/album-cover.jpg" alt="Pong"></a></div>
```

Update to use your custom thumbnail:
```html
<div class="game-button"><a href="pong.html">Pong<br><img src="../images/pong-thumbnail.png" alt="Pong"></a></div>
```

### Recommended Image Specs

- **Size**: 200px width × 150px height (as defined in CSS)
- **Format**: PNG or JPG
- **File size**: Keep under 200KB for fast loading

## Current Images

- `jumping-cat.svg` - Logo used in the header
- `935CF301-8553-44E6-98FD-A0E992BEBD36.png` - Footer cat image
- `album-cover.jpg` - Default placeholder for game thumbnails (currently "Be Good 2 Yourself" album cover)
