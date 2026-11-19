# 🪶 Tara, Sipa!

*"Tara, sipa!" means "Come on, let's play sipa!"*

A browser game inspired by **sipa**, the traditional Filipino game in which you keep a weighted shuttlecock in the air by kicking it.

**▶ Play it here:** https://ysthangabrielcolarina-lang.github.io/tara-sipa/

## How to play

- **Pick your Iskolar** (boy or girl in the PUP uniform), then tap **Tara!**
- **Tap or click the sipa** to kick it up. Each kick is **+1 point**.
- Tap the **center** for a **Perfect** kick worth **+2 points**.
- Tap the **left side** to send it to the right, and the **right side** to send it to the left.
- Don't let it touch the ground!
- Every 10 points the level goes up: gravity gets stronger and the sipa gets smaller.
- After 15 points, **wind** starts pushing the sipa sideways. Watch the wind arrow.

**Keyboard:** `Space`/`Enter` starts the game, and `P`/`Esc` pauses it.

## Features

- Character select: two Iskolars in the PUP uniform
- PUP main gate background with the 3-pillar pylon
- Works on desktop and phones (touch controls, responsive layout)
- Saves your high score in the browser (`localStorage`)
- Sound effects made with the Web Audio API (no audio files needed)
- Difficulty that rises with each level
- Pauses automatically when you switch tabs
- Share-your-score button

## Built with

- HTML5 Canvas
- CSS3
- Vanilla JavaScript (no frameworks or libraries)
- Hosted on GitHub Pages

## Run it locally

1. Download or clone this repository.
2. Open `index.html` in any modern browser.

## Project structure

```
tara-sipa/
├── index.html   # page structure and the menu, pause and game-over screens
├── style.css    # layout and design
├── script.js    # game logic: physics, input, drawing, sound, saving
└── README.md
```

## Author

**Ysthan Gabriel E. Colarina**, BSIT student at PUP Calauan
GitHub: [@ysthangabrielcolarina-lang](https://github.com/ysthangabrielcolarina-lang)