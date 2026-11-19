import json
import os
import sys
from pathlib import Path

import ctranslate2
import sentencepiece

model = Path(os.environ.get("BOOTSTRAP_TRANSLATION_MODEL", ".cache/models/en_ar"))
tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(model / "sentencepiece.model"))
translator = ctranslate2.Translator(
    str(model / "model"), device="cpu", inter_threads=3, intra_threads=2, compute_type="int8"
)

for line in sys.stdin:
    batch = json.loads(line)
    encoded = tokenizer.encode(batch, out_type=str)
    translated = translator.translate_batch(
        encoded, beam_size=2, max_batch_size=32, max_input_length=420,
        max_decoding_length=420, repetition_penalty=1.12
    )
    output = [tokenizer.decode(row.hypotheses[0]).strip() for row in translated]
    print(json.dumps(output, ensure_ascii=False), flush=True)
