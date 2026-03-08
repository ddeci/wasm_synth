mod envelope;
mod filter;
mod lfo;
mod oscillator;
mod voice;

use filter::FilterMode;
use oscillator::Waveform;
use voice::VoicePool;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Synth {
    pool: VoicePool,
    osc_mix: f32,
    noise_level: f32,
    osc2_octave: f32,
    filter_cutoff: f32,
    filter_env_amount: f32,
    drive: f32,
    gain: f32,
    buffer: Vec<f32>,
}

#[wasm_bindgen]
impl Synth {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self {
            pool: VoicePool::new(sample_rate),
            osc_mix: 0.3,
            noise_level: 0.0,
            osc2_octave: 0.0,
            filter_cutoff: 8000.0,
            filter_env_amount: 0.0,
            drive: 0.0,
            gain: 0.5,
            buffer: Vec::with_capacity(128),
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        self.pool.note_on(note, velocity);
    }

    pub fn note_off(&mut self, note: u8) {
        self.pool.note_off(note);
    }

    pub fn get_buffer_ptr(&self) -> *const f32 {
        self.buffer.as_ptr()
    }

    pub fn process(&mut self, num_samples: usize) {
        self.buffer.resize(num_samples, 0.0);
        for sample in self.buffer.iter_mut() {
            let mut sum = 0.0;
            for voice in &mut self.pool.voices {
                if !voice.is_free() {
                    sum += voice.tick(
                        self.osc_mix,
                        self.noise_level,
                        self.osc2_octave,
                        self.filter_env_amount,
                        self.filter_cutoff,
                        self.drive,
                    );
                }
            }
            *sample = sum * self.gain;
        }
    }

    pub fn set_param(&mut self, param: u8, value: f32) {
        let waveform = |v: f32| match v as u8 {
            0 => Waveform::Sine,
            1 => Waveform::Saw,
            2 => Waveform::Square,
            3 => Waveform::Triangle,
            _ => Waveform::Saw,
        };
        let filter_mode = |v: f32| match v as u8 {
            0 => FilterMode::LowPass,
            1 => FilterMode::HighPass,
            2 => FilterMode::BandPass,
            _ => FilterMode::LowPass,
        };

        match param {
            // Oscillators
            0 => { let wf = waveform(value); for v in &mut self.pool.voices { v.osc1.waveform = wf; } }
            1 => { let wf = waveform(value); for v in &mut self.pool.voices { v.osc2.waveform = wf; } }
            2 => self.osc_mix = value,
            3 => { for v in &mut self.pool.voices { v.osc2.detune = value; } }
            4 => self.osc2_octave = value,     // -2..+2 octaves
            5 => self.noise_level = value,      // 0..1

            // Filter
            10 => self.filter_cutoff = value,
            11 => { for v in &mut self.pool.voices { v.filter.resonance = value; } }
            12 => { let m = filter_mode(value); for v in &mut self.pool.voices { v.filter.mode = m; } }

            // Filter envelope
            13 => self.filter_env_amount = value, // 0..1
            14 => { for v in &mut self.pool.voices { v.filter_env.attack = value; } }
            15 => { for v in &mut self.pool.voices { v.filter_env.decay = value; } }
            16 => { for v in &mut self.pool.voices { v.filter_env.sustain = value; } }
            17 => { for v in &mut self.pool.voices { v.filter_env.release = value; } }

            // Amp envelope
            20 => { for v in &mut self.pool.voices { v.envelope.attack = value; } }
            21 => { for v in &mut self.pool.voices { v.envelope.decay = value; } }
            22 => { for v in &mut self.pool.voices { v.envelope.sustain = value; } }
            23 => { for v in &mut self.pool.voices { v.envelope.release = value; } }

            // LFO
            25 => { for v in &mut self.pool.voices { v.lfo.rate = value; } }
            26 => { for v in &mut self.pool.voices { v.lfo.amount = value; } }

            // Output
            30 => self.gain = value,
            31 => self.drive = value,
            _ => {}
        }
    }
}
