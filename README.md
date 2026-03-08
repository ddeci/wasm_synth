# WASM Synth

A browser-based subtractive synthesizer. All DSP runs in Rust compiled to WebAssembly via an AudioWorklet — no JavaScript audio processing. Vanilla HTML/CSS/JS frontend, no frameworks.

## Features

- 2 oscillators (saw, square, sine, triangle) with mix, detune, and octave offset
- State-variable filter (LP/HP/BP) with cutoff and resonance
- Dedicated filter envelope (ADSR + amount) for sweep effects
- Amplitude envelope (ADSR)
- LFO modulating filter cutoff
- White noise generator
- Soft-clip distortion (tanh waveshaping)
- 8-voice polyphony with voice stealing
- 25+ presets (leads, basses, pads, keys, stabs, FX)
- Keyboard input via QWERTY/number rows with focus capture
- Configurable octave and root note

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
2. Play notes with the QWERTY row (white keys) and number row (black keys)
3. Select a preset or tweak parameters manually
4. Press Escape or click outside to release keyboard capture

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
│   ├── filter.rs       # State-variable filter (LP/HP/BP)
│   ├── envelope.rs     # ADSR envelope
│   ├── lfo.rs          # Sine LFO
│   └── voice.rs        # Voice (osc+filter+env+lfo), 8-voice pool
└── www/
    ├── index.html      # UI layout
    ├── style.css       # Styling
    ├── main.js         # Audio context, keyboard, presets, params
    └── worklet.js      # AudioWorkletProcessor, WASM instantiation
```
