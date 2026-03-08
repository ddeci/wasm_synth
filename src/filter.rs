use std::f32::consts::PI;

#[derive(Clone, Copy, PartialEq)]
pub enum FilterMode {
    LowPass,
    HighPass,
    BandPass,
    Notch,
}

pub struct Filter {
    pub mode: FilterMode,
    pub cutoff: f32,    // Hz
    pub resonance: f32, // 0..1
    ic1eq: f32,
    ic2eq: f32,
    sample_rate: f32,
}

impl Filter {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            mode: FilterMode::LowPass,
            cutoff: 8000.0,
            resonance: 0.0,
            ic1eq: 0.0,
            ic2eq: 0.0,
            sample_rate,
        }
    }

    pub fn reset(&mut self) {
        self.ic1eq = 0.0;
        self.ic2eq = 0.0;
    }

    pub fn tick(&mut self, input: f32) -> f32 {
        let g = (PI * self.cutoff / self.sample_rate).tan();
        let k = 2.0 - 2.0 * self.resonance.min(0.99);
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;

        let v3 = input - self.ic2eq;
        let v1 = a1 * self.ic1eq + a2 * v3;
        let v2 = self.ic2eq + a2 * self.ic1eq + a3 * v3;

        self.ic1eq = 2.0 * v1 - self.ic1eq;
        self.ic2eq = 2.0 * v2 - self.ic2eq;

        match self.mode {
            FilterMode::LowPass => v2,
            FilterMode::HighPass => input - k * v1 - v2,
            FilterMode::BandPass => v1,
            FilterMode::Notch => {
                let lp = v2;
                let hp = input - k * v1 - v2;
                lp + hp
            }
        }
    }
}
