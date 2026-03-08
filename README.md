# WASM Synth

A browser-based subtractive synthesizer. All DSP runs in Rust compiled to WebAssembly via an AudioWorklet — no JavaScript audio processing. Vanilla HTML/CSS/JS frontend, no frameworks.

## Features

**Sound Engine**
- 2 oscillators (saw, square, sine, triangle) with mix, detune, and octave offset
- State-variable filter (LP/HP/BP/Notch) with cutoff and resonance
- Filter envelope (ADSR + amount)
- Pitch envelope (ADSR + amount) for 808 drops, plucks, and FX
- Amplitude envelope (ADSR)
- LFO with 5 waveforms (sine, triangle, saw, square, sample & hold) and 3 targets (filter, pitch, amplitude)
- White noise generator
- Soft-clip distortion (tanh waveshaping)
- 8-voice polyphony with voice stealing

**Presets**
- 18 curated presets across 4 categories (leads, bass, pads, keys)
- Category filter tabs for quick browsing

**Interface**
- Responsive full-width piano keyboard with mouse glide
- Real-time oscilloscope visualizer
- Keyboard input via ASDF (white keys) and QWERTY (black keys) rows
- Octave switching with Z/X keys
- Configurable root note and octave

## Setup

Requires [Nix](https://nixos.org/) with flakes enabled.

```bash
# Clone and enter the directory — direnv activates the dev shell automatically
cd wasm_synth
direnv allow

# Build the WASM module
./build.sh

# Serve and open in browser
./serve.sh
# -> http://localhost:8080
```

## Usage

1. Click "Click here to play" to capture keyboard input
2. Play notes with the ASDF row (white keys) and QWERTY row (black keys)
3. Press Z/X to shift the octave down/up
4. Select a preset or tweak parameters manually
5. Press Escape or click outside to release keyboard capture

## Project Structure

```
wasm_synth/
├── flake.nix           # Nix dev environment
├── Cargo.toml
├── build.sh            # Build WASM module
├── serve.sh            # Build + start dev server
├── src/
│   ├── lib.rs          # wasm-bindgen entry, Synth struct, param routing
│   ├── oscillator.rs   # Polyblep saw/square, sine, triangle
│   ├── filter.rs       # State-variable filter (LP/HP/BP/Notch)
│   ├── envelope.rs     # ADSR envelope
│   ├── lfo.rs          # LFO (sin/tri/saw/sq/S&H)
│   └── voice.rs        # Voice (osc+filter+env+lfo), 8-voice pool
└── www/
    ├── index.html      # UI layout
    ├── style.css       # Styling
    ├── main.js         # Audio context, keyboard, presets, params
    └── worklet.js      # AudioWorkletProcessor, WASM instantiation
```
