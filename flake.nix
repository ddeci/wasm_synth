{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, rust-overlay, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          targets = [ "wasm32-unknown-unknown" ];
        };
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            rustToolchain
            pkgs.wasm-pack
            pkgs.wasm-bindgen-cli
            pkgs.miniserve
          ];

          shellHook = ''
            echo "wasm_synth dev shell"
            echo "Build: wasm-pack build --target web"
            echo "Serve: miniserve www/ --index index.html --header 'Cross-Origin-Opener-Policy: same-origin' --header 'Cross-Origin-Embedder-Policy: require-corp' -p 8080"
          '';
        };
      });
}
