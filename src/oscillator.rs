use std::f32::consts::PI;

#[derive(Clone, Copy, PartialEq)]
pub enum Waveform {
    Sine,
    Saw,
    Square,
    Triangle,
}

pub struct Oscillator {
    pub waveform: Waveform,
    pub detune: f32, // semitones
    phase: f32,
    sample_rate: f32,
}

impl Oscillator {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            waveform: Waveform::Saw,
            detune: 0.0,
            phase: 0.0,
            sample_rate,
        }
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
    }

    pub fn tick(&mut self, freq: f32) -> f32 {
        let freq = freq * 2.0_f32.powf(self.detune / 12.0);
        let dt = freq / self.sample_rate;
        let sample = match self.waveform {
            Waveform::Sine => self.sine(),
            Waveform::Saw => self.polyblep_saw(dt),
            Waveform::Square => self.polyblep_square(dt),
            Waveform::Triangle => self.triangle(),
        };
        self.phase += dt;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        sample
    }

    fn sine(&self) -> f32 {
        (2.0 * PI * self.phase).sin()
    }

    fn polyblep(&self, t: f32, dt: f32) -> f32 {
        if t < dt {
            let t = t / dt;
            2.0 * t - t * t - 1.0
        } else if t > 1.0 - dt {
            let t = (t - 1.0) / dt;
            t * t + 2.0 * t + 1.0
        } else {
            0.0
        }
    }

    fn polyblep_saw(&self, dt: f32) -> f32 {
        let naive = 2.0 * self.phase - 1.0;
        naive - self.polyblep(self.phase, dt)
    }

    fn polyblep_square(&self, dt: f32) -> f32 {
        let naive = if self.phase < 0.5 { 1.0 } else { -1.0 };
        naive + self.polyblep(self.phase, dt) - self.polyblep((self.phase + 0.5) % 1.0, dt)
    }

    fn triangle(&self) -> f32 {
        if self.phase < 0.25 {
            4.0 * self.phase
        } else if self.phase < 0.75 {
            2.0 - 4.0 * self.phase
        } else {
            4.0 * self.phase - 4.0
        }
    }
}
