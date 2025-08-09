from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import base64
import os
import json
import urllib.request
import urllib.error
from typing import List, Optional

# Initialize the client with an inline API key (note: hardcoding secrets is insecure)
api_key = "AIzaSyC8I0OcJhYoXEqHnOEHE7q8N7b0sRBZdiI"
client = genai.Client(api_key=api_key)

def log(message: str) -> None:
    print(f"[image-gen] {message}")

contents = (
    'THAILAND HIGHSCHOOL GIRL individual, showcasing only the upper half of their body. '
    'The subject should be facing directly towards the camera '
)

def generate_with_model_rest(model_name: str, prompt_text: str, api_key_value: str, candidate_count: int = 1):
    # Try v1beta then v1
    for api_version in ["v1beta", "v1"]:
        url = f"https://generativelanguage.googleapis.com/{api_version}/{model_name}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {"candidateCount": candidate_count},
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-goog-api-key": api_key_value,
            },
            method="POST",
        )
        log(f"Calling REST {api_version} → {model_name}:generateContent ...")
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Unexpected status: {resp.status}")
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode("utf-8", errors="ignore")
            except Exception:
                body = "<no body>"
            log(f"HTTPError on {api_version}: {e.code} {e.reason}. Body: {body[:400]}")
            # Try next version
        except Exception as e:
            log(f"REST call failed on {api_version}: {e}")
            # Try next version
    # If both fail, raise
    raise RuntimeError("All REST versions failed for generateContent")


def model_suffix(model_name: str) -> str:
    return model_name.split('/', 1)[1] if model_name.startswith('models/') else model_name


def try_images_api(model_id: str, prompt_text: str) -> bool:
    try:
        log(f"Attempting Images API (client.images.generate) with model: {model_id} ...")
        # Avoid config for maximum compatibility
        resp = client.images.generate(model=model_id, prompt=prompt_text)
        images = getattr(resp, 'images', None) or getattr(resp, 'generated_images', None) or []
        if not images:
            log("Images API returned no images.")
            return False
        image_index = 1
        for img in images:
            raw: Optional[bytes] = None
            if hasattr(img, 'data') and img.data:
                raw = img.data if isinstance(img.data, (bytes, bytearray)) else base64.b64decode(img.data)
            elif hasattr(img, 'image') and getattr(img.image, 'image_bytes', None):
                raw = base64.b64decode(img.image.image_bytes)
            elif isinstance(img, dict):
                d = img
                if 'data' in d and isinstance(d['data'], str):
                    raw = base64.b64decode(d['data'])
            if raw:
                image = Image.open(BytesIO(raw))
                out_path = os.path.join(output_dir, f"images_api_output_{image_index}.png")
                image.save(out_path)
                log(f"Saved (Images API): {out_path}")
                image_index += 1
        return image_index > 1
    except Exception as e:
        log(f"Images API call failed for model {model_id}: {e}")
        return False


def list_available_models(api_key_value: str) -> List[str]:
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    req = urllib.request.Request(
        url,
        headers={
            "Content-Type": "application/json",
            "X-goog-api-key": api_key_value,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status != 200:
                return []
            data = json.loads(resp.read().decode("utf-8"))
            model_entries = data.get("models", [])
            names = []
            for entry in model_entries:
                name = entry.get("name") or entry.get("baseModelId") or ""
                if isinstance(name, str) and name:
                    names.append(name)
            return names
    except Exception:
        return []


# Ensure output directory exists
output_dir = os.path.join(os.path.dirname(__file__), "generated_images")
os.makedirs(output_dir, exist_ok=True)
log(f"Output directory: {output_dir}")

# Debug: list models and indicate if imagen-4 is available for this API key
models = list_available_models(api_key)
imagen4_model: Optional[str] = None
imagen3_model: Optional[str] = None
if models:
    imagen_like = [m for m in models if "imagen" in m.lower()]
    log(f"Models available (count={len(models)}). Imagen-related: {imagen_like or 'none'}")
    imagen4_model = next((m for m in imagen_like if "imagen-4" in m.lower()), None)
    imagen3_model = next((m for m in imagen_like if "imagen-3" in m.lower()), None)
    log(f"Selected Imagen 4 model: {imagen4_model or 'not found'}")
    log(f"Selected Imagen 3 model: {imagen3_model or 'not found'}")
else:
    log("Could not list models for this key (permission or network issue). Proceeding...")

saved_any = False
if imagen4_model:
    try:
        log(f"Attempting Imagen 4 via REST ({imagen4_model}:generateContent)...")
        imagen4_json = generate_with_model_rest(imagen4_model, contents, api_key, candidate_count=1)
        cands = imagen4_json.get("candidates", [])
        log(f"Imagen 4 response candidates: {len(cands)}")
        image_index = 1
        for cand in cands:
            content_obj = cand.get("content") or {}
            parts = content_obj.get("parts", []) if isinstance(content_obj, dict) else []
            for part in parts:
                inline_data = part.get("inline_data") or part.get("inlineData")
                if inline_data and inline_data.get("data"):
                    raw = base64.b64decode(inline_data["data"])  # REST returns base64
                    image = Image.open(BytesIO(raw))
                    out_path = os.path.join(output_dir, f"imagen4_output_{image_index}.png")
                    image.save(out_path)
                    log(f"Saved (Imagen 4): {out_path}")
                    image_index += 1
                    saved_any = True
        if not saved_any:
            # Try Python client's images API as a different surface
            saved_any = try_images_api(model_suffix(imagen4_model), contents)
        if saved_any:
            log("Generation successful using Imagen 4.")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = "<no body>"
        log(f"Imagen 4 HTTPError {e.code}: {e.reason}. Body: {body[:500]}")
    except (urllib.error.URLError, RuntimeError, KeyError, ValueError) as e:
        log(f"Imagen 4 call failed: {e}")

if not saved_any and imagen3_model:
    try:
        log(f"Attempting Imagen 3 via REST ({imagen3_model}:generateContent)...")
        imagen3_json = generate_with_model_rest(imagen3_model, contents, api_key, candidate_count=1)
        cands = imagen3_json.get("candidates", [])
        log(f"Imagen 3 response candidates: {len(cands)}")
        image_index = 1
        for cand in cands:
            content_obj = cand.get("content") or {}
            parts = content_obj.get("parts", []) if isinstance(content_obj, dict) else []
            for part in parts:
                inline_data = part.get("inline_data") or part.get("inlineData")
                if inline_data and inline_data.get("data"):
                    raw = base64.b64decode(inline_data["data"])  # REST returns base64
                    image = Image.open(BytesIO(raw))
                    out_path = os.path.join(output_dir, f"imagen3_output_{image_index}.png")
                    image.save(out_path)
                    log(f"Saved (Imagen 3): {out_path}")
                    image_index += 1
                    saved_any = True
        if not saved_any:
            saved_any = try_images_api(model_suffix(imagen3_model), contents)
        if saved_any:
            log("Generation successful using Imagen 3.")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = "<no body>"
        log(f"Imagen 3 HTTPError {e.code}: {e.reason}. Body: {body[:500]}")
    except (urllib.error.URLError, RuntimeError, KeyError, ValueError) as e:
        log(f"Imagen 3 call failed: {e}")

if not saved_any:
    # Fallback to Gemini image generation (previously working)
    log("Falling back to Gemini model: gemini-2.0-flash-preview-image-generation (IMAGE+TEXT)...")
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash-preview-image-generation",
            contents=contents,
            config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]) ,
        )

        image_index = 1
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            log("No candidates returned by Gemini.")
        else:
            for cand in candidates:
                content_obj = getattr(cand, "content", None)
                parts = getattr(content_obj, "parts", None) if content_obj is not None else None
                if not parts:
                    continue
                for part in parts:
                    if getattr(part, "text", None):
                        print(part.text)
                    elif getattr(part, "inline_data", None) is not None and getattr(part.inline_data, "data", None) is not None:
                        image = Image.open(BytesIO(part.inline_data.data))
                        out_path = os.path.join(output_dir, f"gemini_image_output_{image_index}.png")
                        image.save(out_path)
                        log(f"Saved (Gemini): {out_path}")
                        image_index += 1
    except Exception as e:
        log(f"Gemini fallback failed: {e}")
log("Done.")