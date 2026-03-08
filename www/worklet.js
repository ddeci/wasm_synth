let wasm = null;
let synthPtr = null;

class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  async onMessage(data) {
    if (data.type === 'init') {
      try {
        const bytes = data.wasmBytes;
        const imports = {
          "./wasm_synth_bg.js": {
            __wbg___wbindgen_throw_6ddd609b62940d55: function(ptr, len) {
              throw new Error(new TextDecoder().decode(
                new Uint8Array(wasm.memory.buffer, ptr, len)
              ));
            },
            __wbindgen_init_externref_table: function() {
              const table = wasm.__wbindgen_externrefs;
              const offset = table.grow(4);
              table.set(0, undefined);
              table.set(offset + 0, undefined);
              table.set(offset + 1, null);
              table.set(offset + 2, true);
              table.set(offset + 3, false);
            },
          }
        };
        const { instance } = await WebAssembly.instantiate(bytes, imports);
        wasm = instance.exports;
        wasm.__wbindgen_start();
        synthPtr = wasm.synth_new(sampleRate);
        this.ready = true;
        this.port.postMessage({ type: 'ready' });
      } catch (err) {
        this.port.postMessage({ type: 'error', message: err.message });
      }
    } else if (!this.ready) return;
    else if (data.type === 'noteOn') {
      wasm.synth_note_on(synthPtr, data.note, data.velocity);
    } else if (data.type === 'noteOff') {
      wasm.synth_note_off(synthPtr, data.note);
    } else if (data.type === 'param') {
      wasm.synth_set_param(synthPtr, data.param, data.value);
    }
  }

  process(inputs, outputs) {
    if (!this.ready) return true;
    const output = outputs[0][0];
    if (!output) return true;

    wasm.synth_process(synthPtr, output.length);
    const bufPtr = wasm.synth_get_buffer_ptr(synthPtr) >>> 0;
    const wasmBuf = new Float32Array(wasm.memory.buffer, bufPtr, output.length);
    output.set(wasmBuf);

    return true;
  }
}

registerProcessor('synth-processor', SynthProcessor);
