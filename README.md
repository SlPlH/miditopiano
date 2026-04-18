# MIDI Piano Visualizer Web App

This project is an interactive web application that can play MIDI files directly in the browser and visualize the piano keys and falling notes.

Powered by the SpessaSynth library for high-quality audio synthesis (via SoundFonts), it also provides powerful video rendering capabilities. Built with Vite, the project can be optimized for single-file HTML output.

## Features
- **MIDI Playback:** Instantly parse and play `.mid` files uploaded to the app.
- **Visualization:** Real-time visualization of playing notes on a piano keyboard and as falling blocks.
- **Video Rendering:** Export high-quality (e.g., 1080p) videos of the playing sequence directly in the browser using `mp4-muxer` and `webm-muxer`.
- **i18n Support:** Built-in multi-language (internationalization) support.
- **Single File HTML:** Ability to bundle styles, scripts, and markup into a single HTML file using `vite-plugin-singlefile` for easy hosting.

## Installation

To run this project locally, ensure you have **Node.js** installed on your system.

1. Clone the repository or download and extract the ZIP:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   cd pianosite
   ```

2. Install the required dependencies:
   ```bash
   npm install
   ```

## Usage

To start the development server:
```bash
npm run dev
```

If you want to run the Vite dev server and the Express backend concurrently:
```bash
npm run start
```
This command will typically start the frontend application at `http://localhost:5173/` (and the backend on its respective port).

## Build for Production

To create a production build for hosting on static servers:

```bash
npm run build
```
This command generates the built files in the `dist/` folder (or just a single compiled file based on your Vite config).

## Built With
- [Vite](https://vitejs.dev/) - Frontend tooling and development server
- [SpessaSynth](https://github.com/spessasus/SpessaSynth) - In-browser MIDI/SoundFont synthesis
- [mp4-muxer](https://github.com/tjenkinson/mp4-muxer) & [webm-muxer](https://github.com/tjenkinson/webm-muxer) - Video multiplexing and rendering

## License
This project is currently marked as private. All rights reserved.
