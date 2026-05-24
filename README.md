# ▲ AeroCompress

> High-Performance, WebAssembly-Free Local Video Compressor & Multi-Format Converter.

AeroCompress is a visually stunning, ultra-fast local server application designed to compress and convert video files natively. Unlike WebAssembly-based web interfaces which suffer from browser-sandbox thread bottlenecks and slow processing speeds, AeroCompress spawns local multithreaded FFmpeg pipelines directly on your machine's CPU for maximum rendering velocity.

Featuring a premium, glassmorphic **Dark Luxe** single-page web interface, AeroCompress provides real-time encoding feedback, advanced format configurations, custom save paths, and clean cache controls.

---

## Key Features

- ⚡ **WebAssembly-Free Engine**: Executes native local FFmpeg & FFprobe child processes directly on the machine's thread pool for visually lossless rendering speeds.
- 📊 **Server-Sent Events (SSE) Progress**: Displays a dynamic radial completion dial alongside frames-per-second, compression speed multiplier, and estimated time remaining (ETA).
- 💾 **Direct Export Directory**: Optional path input allows you to export completed encodes directly to any local folder on your computer (e.g. your Desktop or Downloads directory) in addition to browser downloading.
- 🧹 **Instant Cache Cleanup**: A one-click header action button lets you safely purge all raw uploads and completed videos from the server's cache when you are done, strictly preserving active runs.
- 🛑 **Programmatic Server Shutdown**: Shutdown button cleanly terminates the active Node.js server thread, freeing up port `3000` immediately, and locks the browser into a safe-to-close obsidian shield.
- 📺 **FFmpeg Console Terminal**: Pipes live, structured CLI stderr logs directly to an interactive terminal console on the webpage.
- 🎨 **Premium Dark Luxe Aesthetic**: Harmonies of deep obsidian cards, neon gradient details, Outfit/Inter typography, and floating ambient glows.
- 🔄 **Supported Formats**:
  - **MP4** (H.264 - Highly Compatible)
  - **MKV** (H.265/HEVC - Maximum Quality-to-Size Ratio)
  - **WebM** (VP9 - Ideal for web streaming)
  - **MP3** (High-quality audio extraction with bitrates up to 320kbps)

---

## 🛠️ How to Run It (3 Easy Steps)

AeroCompress is designed to be fully portable and ready to run for anyone.

### Step 1: Install Node.js
If you don't have it already, download and install the current version of **[Node.js](https://nodejs.org/)** (v18 or higher is recommended).

### Step 2: Install FFmpeg (System Path)
AeroCompress uses a **Smart Binary Path Resolver** that automatically matches your environment:
- **Default Windows Fallback**: If you are running this within the local `C:\ffmpeg` directory, it works **out-of-the-box** using your local executables.
- **Global Path Resolution**: For any other environment, simply download **[FFmpeg](https://ffmpeg.org/download.html)** and make sure it is added to your system's environment path. AeroCompress will automatically bind to the global `ffmpeg` and `ffprobe` commands!

### Step 3: Run and Compress!
1. Double-click the **`run-compressor.bat`** script at the root of the workspace.
2. The Node server starts up, and your default web browser will **automatically open** and load:
   ```text
   http://localhost:3000
   ```
3. Drag and drop a video, adjust your compression presets, and compress!
4. Click the **🛑 Shutdown Server** button in the top-right corner when you are done to close the console safely.

---

## 📁 Project Architecture

Only core code, configs, and guides are stored in source control to keep the repository spotless:

```text
Video-Compressor/
│
├── run-compressor.bat        # One-click Windows server launcher
├── README.md                 # Premium information landing page
├── .gitignore                # Spotless filter ignoring binary & temp logs
│
└── app/                      # Main application workspace
    ├── package.json          # Node dependencies & run scripts
    ├── server.js             # Express backend, multer uploading & FFmpeg spawning
    ├── test.js               # Network and shutdown automated health checker
    │
    └── public/               # Web asset front-end
        ├── index.html        # App layout and overlay structures
        ├── style.css         # Dark Luxe premium styling
        └── app.js            # Front-end bindings & SSE engine connection
```

---

## ⚙️ Compression Guidelines

For optimal results using Constant Rate Factor (CRF):
- **Balanced (Default)**: CRF `23` for H.264. Provides the best visual fidelity-to-file size ratio. Human eye cannot distinguish it from the original.
- **High Quality**: CRF `18` for H.264. Visually lossless compression, resulting in larger files but pristine frames.
- **Max Compression**: CRF `28` for H.264. Saves maximum disk space, suitable for quick sharing or drafts.
- **Custom Bitrate**: Allows you to override CRF rate control and specify exact constraints (e.g. `1500kbps` for stable web streaming limits).

---

*AeroCompress is powered by Node.js, Express, Multer, and native local FFmpeg child processes.*
