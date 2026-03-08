use std::f32::consts::PI;

#[derive(Clone, Copy, PartialEq)]
pub enum LfoWaveform {
    Sine,
    Triangle,
    Saw,
    Square,
    SampleAndHold,
}

#[derive(Clone, Copy, PartialEq)]
pub enum LfoTarget {
    FilterCutoff,
    Pitch,
    Amplitude,
}

pub struct Lfo {
    pub rate: f32,
    pub amount: f32,
    pub waveform: LfoWaveform,
    pub target: LfoTarget,
    phase: f32,
    sample_rate: f32,
    sh_value: f32,
    noise_state: u32,
}

impl Lfo {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            rate: 1.0,
            amount: 0.0,
            waveform: LfoWaveform::Sine,
            target: LfoTarget::FilterCutoff,
            phase: 0.0,
            sample_rate,
            sh_value: 0.0,
            noise_state: 54321,
        }
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
        self.sh_value = 0.0;
    }

    pub fn tick(&mut self) -> f32 {
        let raw = match self.waveform {
            LfoWaveform::Sine => (2.0 * PI * self.phase).sin(),
            LfoWaveform::Triangle => {
                if self.phase < 0.25 {
                    4.0 * self.phase
                } else if self.phase < 0.75 {
                    2.0 - 4.0 * self.phase
                } else {
                    4.0 * self.phase - 4.0
                }
            }
            LfoWaveform::Saw => 2.0 * self.phase - 1.0,
            LfoWaveform::Square => {
                if self.phase < 0.5 {
                    1.0
                } else {
                    -1.0
                }
            }
            LfoWaveform::SampleAndHold => self.sh_value,
        };

        self.phase += self.rate / self.sample_rate;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
            // New S&H value each cycle
            if self.waveform == LfoWaveform::SampleAndHold {
                self.noise_state ^= self.noise_state << 13;
                self.noise_state ^= self.noise_state >> 17;
                self.noise_state ^= self.noise_state << 5;
                self.sh_value = (self.noise_state as f32 / u32::MAX as f32) * 2.0 - 1.0;
            }
        }

        raw * self.amount
    }
}
