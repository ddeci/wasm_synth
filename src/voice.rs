use crate::envelope::Envelope;
use crate::filter::Filter;
use crate::lfo::{Lfo, LfoTarget};
use crate::oscillator::{Oscillator, Waveform};

pub struct Voice {
    pub osc1: Oscillator,
    pub osc2: Oscillator,
    pub filter: Filter,
    pub envelope: Envelope,
    pub filter_env: Envelope,
    pub pitch_env: Envelope,
    pub lfo: Lfo,
    pub note: u8,
    pub velocity: f32,
    freq: f32,
    pub age: u64,
    noise_state: u32,
}

impl Voice {
    pub fn new(sample_rate: f32) -> Self {
        let mut osc2 = Oscillator::new(sample_rate);
        osc2.waveform = Waveform::Saw;
        osc2.detune = 0.1;

        Self {
            osc1: Oscillator::new(sample_rate),
            osc2,
            filter: Filter::new(sample_rate),
            envelope: Envelope::new(sample_rate),
            filter_env: Envelope::new(sample_rate),
            pitch_env: Envelope::new(sample_rate),
            lfo: Lfo::new(sample_rate),
            note: 0,
            velocity: 0.0,
            freq: 440.0,
            age: 0,
            noise_state: 12345,
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32, age: u64) {
        self.note = note;
        self.velocity = velocity;
        self.freq = 440.0 * 2.0_f32.powf((note as f32 - 69.0) / 12.0);
        self.age = age;
        self.osc1.reset();
        self.osc2.reset();
        self.filter.reset();
        self.lfo.reset();
        self.envelope.trigger();
        self.filter_env.trigger();
        self.pitch_env.trigger();
    }

    pub fn note_off(&mut self) {
        self.envelope.release();
        self.filter_env.release();
        self.pitch_env.release();
    }

    pub fn is_free(&self) -> bool {
        self.envelope.is_idle()
    }

    fn white_noise(&mut self) -> f32 {
        // Simple xorshift
        self.noise_state ^= self.noise_state << 13;
        self.noise_state ^= self.noise_state >> 17;
        self.noise_state ^= self.noise_state << 5;
        (self.noise_state as f32 / u32::MAX as f32) * 2.0 - 1.0
    }

    pub fn tick(
        &mut self,
        osc_mix: f32,
        noise_level: f32,
        osc2_octave: f32,
        filter_env_amount: f32,
        base_cutoff: f32,
        drive: f32,
        pitch_env_amount: f32,
    ) -> f32 {
        let lfo_val = self.lfo.tick();
        let penv = self.pitch_env.tick();

        // Pitch modulation: pitch envelope + LFO (if targeting pitch)
        let pitch_mod_semitones = pitch_env_amount * penv * 24.0
            + if self.lfo.target == LfoTarget::Pitch {
                lfo_val * 12.0
            } else {
                0.0
            };
        let freq_mod = self.freq * 2.0_f32.powf(pitch_mod_semitones / 12.0);

        let s1 = self.osc1.tick(freq_mod);
        let osc2_freq = freq_mod * 2.0_f32.powf(osc2_octave);
        let s2 = self.osc2.tick(osc2_freq);
        let noise = self.white_noise() * noise_level;

        let mixed = s1 * (1.0 - osc_mix) + s2 * osc_mix + noise;

        // Filter modulation: base cutoff + filter envelope + LFO (if targeting filter)
        let fenv = self.filter_env.tick();
        let lfo_filter = if self.lfo.target == LfoTarget::FilterCutoff {
            lfo_val * 4000.0
        } else {
            0.0
        };
        let cutoff_mod = filter_env_amount * fenv * 16000.0 + lfo_filter;
        self.filter.cutoff = (base_cutoff + cutoff_mod).clamp(20.0, 18000.0);

        let filtered = self.filter.tick(mixed);

        // Soft-clip distortion
        let driven = if drive > 0.01 {
            let gain = 1.0 + drive * 20.0;
            let x = filtered * gain;
            x.tanh()
        } else {
            filtered
        };

        let env = self.envelope.tick();

        // Amplitude LFO (tremolo)
        let amp_lfo = if self.lfo.target == LfoTarget::Amplitude {
            1.0 + lfo_val * 0.5
        } else {
            1.0
        };

        driven * env * self.velocity * amp_lfo
    }
}

const NUM_VOICES: usize = 8;

pub struct VoicePool {
    pub voices: Vec<Voice>,
    age_counter: u64,
}

impl VoicePool {
    pub fn new(sample_rate: f32) -> Self {
        let voices = (0..NUM_VOICES).map(|_| Voice::new(sample_rate)).collect();
        Self {
            voices,
            age_counter: 0,
        }
    }

    pub fn note_on(&mut self, note: u8, velocity: f32) {
        for v in &mut self.voices {
            if v.note == note && !v.is_free() {
                self.age_counter += 1;
                v.note_on(note, velocity, self.age_counter);
                return;
            }
        }
        if let Some(v) = self.voices.iter_mut().find(|v| v.is_free()) {
            self.age_counter += 1;
            v.note_on(note, velocity, self.age_counter);
            return;
        }
        if let Some(v) = self.voices.iter_mut().min_by_key(|v| v.age) {
            self.age_counter += 1;
            v.note_on(note, velocity, self.age_counter);
        }
    }

    pub fn note_off(&mut self, note: u8) {
        for v in &mut self.voices {
            if v.note == note && !v.is_free() {
                v.note_off();
            }
        }
    }
}
