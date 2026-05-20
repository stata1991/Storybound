"""
Day 6 refactor: convert generate_flux_illustrations from @app.function to
@app.cls (FluxGenerator class) with @modal.enter() / @modal.method().

Run:  python3 scripts/refactor_flux.py
Then: python3 -c "import ast; ast.parse(open('modal/flux_pipeline.py').read()); print('Syntax OK')"
Then delete this script.
"""

import re

INPUT = "modal/flux_pipeline.py"

with open(INPUT) as f:
    src = f.read()
    lines = src.splitlines(keepends=True)

# ── Boundaries (0-indexed) ──
# Line 676 = @app.function( decorator  → index 675
# Line 1195 = return {"status": "error", ...} → index 1194 (inclusive)
FUNC_START = 675   # first line of @app.function decorator
FUNC_END   = 1195  # first line AFTER the function (exclusive)

header = lines[:FUNC_START]
func_lines = lines[FUNC_START:FUNC_END]
footer = lines[FUNC_END:]

func = "".join(func_lines)

# ═══════════════════════════════════════════════════════════════════════
# STEP 1: Remove old decorator + function def, replace with @modal.method
# ═══════════════════════════════════════════════════════════════════════

old_decorator_and_def = (
    '@app.function(\n'
    '    image=flux_image,\n'
    '    gpu="L40S",\n'
    '    timeout=1800,\n'
    '    volumes={"/lora-weights": lora_volume},\n'
    '    secrets=[modal.Secret.from_name("storybound-secrets")],\n'
    '    memory=32768,\n'
    ')\n'
    'def generate_flux_illustrations(body: dict) -> dict:\n'
)
new_method_def = (
    '    @modal.method()\n'
    '    def generate(self, body: dict) -> dict:\n'
)
assert old_decorator_and_def in func, "Could not find old decorator+def"
func = func.replace(old_decorator_and_def, new_method_def, 1)

# ═══════════════════════════════════════════════════════════════════════
# STEP 2: Remove FluxPipeline and FaceAnalysis imports (moved to @enter)
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    "\n    from diffusers import FluxPipeline\n"
    "    from insightface.app import FaceAnalysis\n",
    "\n",
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 3: Add import time as _time at top of generate() body
#         (currently it's imported inside the if block at line 796)
#         Move it to just after the existing imports block
# ═══════════════════════════════════════════════════════════════════════

# The _time import is currently at "    import time as _time\n" inside the
# if face_model_id block. We'll add it to the top-level imports and remove
# from inside the block.

# Remove the inner import
func = func.replace(
    "            import time as _time\n",
    "",
    1
)

# Add _time import after "import tempfile" (last top-level import)
func = func.replace(
    "    import tempfile\n",
    "    import tempfile\n    import time as _time\n",
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 4: Add warm-reuse timing + container_start timing
# ═══════════════════════════════════════════════════════════════════════

# Insert timing block right after the imports, before "face_model_id = body.get"
func = func.replace(
    '\n    face_model_id = body.get("face_model_id")\n',
    '\n'
    '    self._call_count += 1\n'
    '    _t0 = _time.perf_counter()\n'
    '    _cum = lambda: _time.perf_counter() - _t0\n'
    '\n'
    '    if self._call_count > 1:\n'
    '        print(f"[TIMING] phase=container_warm_reuse "\n'
    '              f"elapsed={_t0 - self._enter_time:.1f}s")\n'
    '\n'
    '    print(f"[TIMING] phase=container_start elapsed=0.0s cumulative=0.0s")\n'
    '\n'
    '    face_model_id = body.get("face_model_id")\n',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 5: Remove FLUX pipeline load block (moved to @enter)
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    '            # Load FLUX pipeline\n'
    '            print("Loading FLUX.1-dev...")\n'
    '            pipe = FluxPipeline.from_pretrained(\n'
    '                f"{MODEL_CACHE}/flux",\n'
    '                torch_dtype=torch.bfloat16,\n'
    '            )\n'
    '\n'
    '            # Load LoRA state dict manually\n',
    '            # Load LoRA state dict manually\n',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 6: pipe → self.pipe for LoRA loading
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    "                pipe.load_lora_weights(",
    "                self.pipe.load_lora_weights(",
    1
)
func = func.replace(
    "                pipe.fuse_lora(lora_scale=0.85)",
    "                self.pipe.fuse_lora(lora_scale=0.85)",
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 7: Add lora_load timing after "FLUX LoRA loaded and fused"
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    '                print("FLUX LoRA loaded and fused")\n',
    '                print("FLUX LoRA loaded and fused")\n'
    '                print(f"[TIMING] phase=lora_load elapsed={_time.perf_counter()-_t0:.1f}s cumulative={_cum():.1f}s")\n',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 8: Remove enable_model_cpu_offload (moved to @enter)
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    '\n'
    '            # Enable CPU offloading — lets diffusers manage VRAM on A10G\n'
    '            pipe.enable_model_cpu_offload()\n',
    '',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 9: Remove FaceAnalysis init block (moved to @enter)
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    '            # Init InsightFace for reranking + forehead cleanup\n'
    '            rank_app = None\n'
    '            if face_embedding is not None:\n'
    '                rank_app = FaceAnalysis(\n'
    '                    name="buffalo_l",\n'
    '                    providers=["CUDAExecutionProvider",\n'
    '                               "CPUExecutionProvider"]\n'
    '                )\n'
    '                rank_app.prepare(ctx_id=0, det_size=(640, 640))\n'
    '\n'
    '            print',
    '            print',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 10: Replace all pipe( calls with self.pipe( for generation
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    "            cover_candidates = pipe(",
    "            cover_candidates = self.pipe(",
    1
)
func = func.replace(
    "                candidates = pipe(",
    "                candidates = self.pipe(",
    1
)
func = func.replace(
    "                        candidates_retry = pipe(",
    "                        candidates_retry = self.pipe(",
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 11: Replace all rank_app with self.rank_app
# ═══════════════════════════════════════════════════════════════════════

# Use regex to avoid matching "self.rank_app" → "self.self.rank_app"
func = re.sub(r'(?<!self\.)rank_app', 'self.rank_app', func)

# ═══════════════════════════════════════════════════════════════════════
# STEP 12: Add cover_generation timing
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    '            # ── Generate scenes with reranking ──\n',
    '            print(f"[TIMING] phase=cover_generation elapsed={_time.perf_counter()-_t0:.1f}s cumulative={_cum():.1f}s")\n'
    '\n'
    '            # ── Generate scenes with reranking ──\n',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 13: Add scene_i_generation timing (with retried flag)
# ═══════════════════════════════════════════════════════════════════════

# After the forehead cleanup block for each scene, before scene_images.append
func = func.replace(
    '                scene_images.append(best_image)\n',
    '                _retried = best_score < 0.2 if (self.rank_app is not None and face_embedding is not None) else False\n'
    '                print(f"[TIMING] phase=scene_{i}_generation retried={_retried} elapsed={_time.perf_counter()-_t0:.1f}s cumulative={_cum():.1f}s")\n'
    '\n'
    '                scene_images.append(best_image)\n',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 14: Add upload_loop timing
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    '            print(f"All {len(all_images)} illustrations uploaded")\n',
    '            print(f"All {len(all_images)} illustrations uploaded")\n'
    '            print(f"[TIMING] phase=upload_loop count={len(all_images)} elapsed={_time.perf_counter()-_t0:.1f}s cumulative={_cum():.1f}s")\n',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 15: Add container_total timing before return
# ═══════════════════════════════════════════════════════════════════════

func = func.replace(
    '            return {"status": "complete",\n'
    '                    "count": len(all_images)}\n',
    '            print(f"[TIMING] phase=container_total elapsed={_time.perf_counter()-_t0:.1f}s cumulative={_cum():.1f}s")\n'
    '\n'
    '            return {"status": "complete",\n'
    '                    "count": len(all_images)}\n',
    1
)

# ═══════════════════════════════════════════════════════════════════════
# STEP 16: Add try/finally wrapper for LoRA cleanup
#
# The try starts right after "lora_dir = Path(tmp)", wrapping the
# download onward. The finally goes before the closing of the with block.
# ═══════════════════════════════════════════════════════════════════════

# Add _lora_loaded flag + try: after lora_dir = Path(tmp)
func = func.replace(
    '            lora_dir = Path(tmp)\n'
    '            # Download LoRA files from Supabase with retry\n',
    '            lora_dir = Path(tmp)\n'
    '            _lora_loaded = False\n'
    '            try:\n'
    '                # Download LoRA files from Supabase with retry\n',
    1
)

# Set _lora_loaded = True after fuse completes
func = func.replace(
    '                self.pipe.fuse_lora(lora_scale=0.85)\n'
    '                print("FLUX LoRA loaded and fused")\n',
    '                self.pipe.fuse_lora(lora_scale=0.85)\n'
    '                _lora_loaded = True\n'
    '                print("FLUX LoRA loaded and fused")\n',
    1
)

# Now we need to:
# 1. Indent everything inside the try by 4 more spaces
# 2. Add the finally block before the closing of the with block

# Find the try: marker and process
try_marker = '            _lora_loaded = False\n            try:\n'
parts = func.split(try_marker, 1)
assert len(parts) == 2, f"try marker split: expected 2, got {len(parts)}"

before_try = parts[0]
after_try = parts[1]

# The error return line is outside the with/if blocks
error_return = '\n    return {"status": "error", "message": "No face_model_id provided"}\n'
idx = after_try.rfind(error_return)
assert idx != -1, "Could not find error return"

try_body = after_try[:idx]
after_with = after_try[idx:]

# Indent try body by 4 spaces
indented_lines = []
for line in try_body.split('\n'):
    if line.strip() == '':
        indented_lines.append('')
    else:
        indented_lines.append('    ' + line)
indented_try_body = '\n'.join(indented_lines)

# Add finally block
finally_block = (
    '\n'
    '            finally:\n'
    '                if _lora_loaded:\n'
    '                    _t_cleanup_start = _time.perf_counter()\n'
    '                    self.pipe.unfuse_lora()\n'
    '                    self.pipe.unload_lora_weights()\n'
    '                    gc.collect()\n'
    '                    torch.cuda.empty_cache()\n'
    '                    print(f"[TIMING] phase=lora_cleanup "\n'
    '                          f"elapsed={_time.perf_counter()-_t_cleanup_start:.1f}s "\n'
    '                          f"cumulative={_cum():.1f}s")\n'
    '                print("LoRA cleanup complete — base model restored")\n'
)

func = before_try + try_marker + indented_try_body + finally_block + after_with

# ═══════════════════════════════════════════════════════════════════════
# STEP 17: Re-indent entire function body by 4 spaces (class nesting)
# ═══════════════════════════════════════════════════════════════════════

# The method def is at "    @modal.method()\n    def generate(self, ...)\n"
# Everything after the def line needs +4 spaces for class body
method_sig = '    @modal.method()\n    def generate(self, body: dict) -> dict:\n'
parts = func.split(method_sig, 1)
assert len(parts) == 2, f"method sig split: expected 2, got {len(parts)}"

before_method = parts[0]  # empty string (decorator was at start)
method_body = parts[1]

# Add 4 spaces to every non-empty line in the body
body_lines = method_body.split('\n')
indented_body = []
for line in body_lines:
    if line.strip() == '':
        indented_body.append('')
    else:
        indented_body.append('    ' + line)
method_body_indented = '\n'.join(indented_body)

func = before_method + method_sig + method_body_indented

# ═══════════════════════════════════════════════════════════════════════
# STEP 18: Add @modal.enter() + class skeleton before @modal.method()
# ═══════════════════════════════════════════════════════════════════════

enter_block = '''@app.cls(
    image=flux_image,
    gpu="L40S",
    timeout=1800,
    volumes={"/lora-weights": lora_volume},
    secrets=[modal.Secret.from_name("storybound-secrets")],
    memory=32768,
    scaledown_window=300,
    concurrency_limit=1,
)
class FluxGenerator:
    """
    FLUX.1-dev illustration generator with persistent model loading.

    @modal.enter() loads the base model and FaceAnalysis once per container.
    @modal.method() generate() handles per-child LoRA loading and generation.
    """

    @modal.enter()
    def startup(self):
        """Runs ONCE when container starts. Not per invocation."""
        import time as _time
        import torch
        from diffusers import FluxPipeline
        from insightface.app import FaceAnalysis

        _t_enter = _time.perf_counter()

        print("Loading FLUX.1-dev...")
        self.pipe = FluxPipeline.from_pretrained(
            f"{MODEL_CACHE}/flux",
            torch_dtype=torch.bfloat16,
        )
        self.pipe.enable_model_cpu_offload()

        self.rank_app = FaceAnalysis(
            name="buffalo_l",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        self.rank_app.prepare(ctx_id=0, det_size=(640, 640))

        self._enter_time = _time.perf_counter()
        self._call_count = 0
        print(f"[TIMING] phase=container_enter elapsed={self._enter_time - _t_enter:.1f}s")

'''

full_class = enter_block + func

# ═══════════════════════════════════════════════════════════════════════
# STEP 19: Assemble the full file
# ═══════════════════════════════════════════════════════════════════════

result = "".join(header) + full_class + "".join(footer)

# ═══════════════════════════════════════════════════════════════════════
# STEP 20: Update HTTP wrapper to use FluxGenerator().generate.spawn()
# ═══════════════════════════════════════════════════════════════════════

result = result.replace(
    "    generate_flux_illustrations.spawn(flux_payload)",
    "    FluxGenerator().generate.spawn(flux_payload)",
    1
)

# ═══════════════════════════════════════════════════════════════════════
# Write
# ═══════════════════════════════════════════════════════════════════════

with open(INPUT, 'w') as f:
    f.write(result)

print("Refactor complete.")
print("Verify: python3 -c \"import ast; ast.parse(open('modal/flux_pipeline.py').read()); print('Syntax OK')\"")
