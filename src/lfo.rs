use std::f32::consts::PI;

pub struct Lfo {
    pub rate: f32,  // Hz
    pub amount: f32, // 0..1
    phase: f32,
    sample_rate: f32,
}

impl Lfo {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            rate: 1.0,
            amount: 0.0,
            phase: 0.0,
            sample_rate,
        }
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
    }

    pub fn tick(&mut self) -> f32 {
        let out = (2.0 * PI * self.phase).sin() * self.amount;
        self.phase += self.rate / self.sample_rate;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        out
    }
}
