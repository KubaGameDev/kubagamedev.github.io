# Arcade browser checks

These checks run the four HTML games in Chromium, exercising real keyboard/touch inputs, animation time, pause/resume, restarts and game endings. Narrow state fixtures cover collision and full-board edge cases. They also verify the screenshot assets, game links and 320px/390px layouts. External font and analytics requests are stubbed so network availability does not affect the games.

From the repository root, start a static preview:

```sh
python3 -m http.server 8791 --bind 127.0.0.1
```

In another terminal, install Playwright in a temporary directory and run the checks:

```sh
npm install --prefix /tmp/jumpkat-test-tools playwright
/tmp/jumpkat-test-tools/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/jumpkat-test-tools/node_modules node tests/arcade.spec.cjs
```

If you already have Chrome, skip the browser download and set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable. On macOS:

```sh
NODE_PATH=/tmp/jumpkat-test-tools/node_modules \
PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node tests/arcade.spec.cjs
```

`ARCADE_BASE_URL` overrides the preview URL (default `http://127.0.0.1:8791`). This is a browser regression suite, not a substitute for checking physical touch devices or Safari/Firefox.

## Regenerate the gameplay thumbnails

With the preview server still running, capture each game into `images/games/`:

```sh
NODE_PATH=/tmp/jumpkat-test-tools/node_modules \
PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node tests/capture-thumbnails.cjs
```

Omit `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use Playwright's downloaded Chromium. The captures use a deterministic clock and random seed, playing through real keyboard and pointer controls. They read game state to choose moves but never write staged game states or draw replacement artwork.
