from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import base64
import os
import json
import urllib.request
import urllib.error

# Initialize the client with an inline API key (note: hardcoding secrets is insecure)
api_key = "AIzaSyC8I0OcJhYoXEqHnOEHE7q8N7b0sRBZdiI"
client = genai.Client(api_key=api_key)

contents = (
    'THAILAND HIGHSCHOOL GIRL individual, showcasing only the upper half of their body. '
    'The subject should be facing directly towards the camera '
)

def generate_with_imagen4(prompt_text: str, api_key_value: str, candidate_count: int = 1):
    url = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4:generateContent"
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
    with urllib.request.urlopen(req) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Unexpected status: {resp.status}")
        return json.loads(resp.read().decode("utf-8"))


# Ensure output directory exists
output_dir = os.path.join(os.path.dirname(__file__), "generated_images")
os.makedirs(output_dir, exist_ok=True)

saved_any = False
try:
    imagen4_json = generate_with_imagen4(contents, api_key, candidate_count=1)
    image_index = 1
    for cand in imagen4_json.get("candidates", []):
        parts = cand.get("content", {}).get("parts", [])
        for part in parts:
            inline_data = part.get("inline_data") or part.get("inlineData")
            if inline_data and inline_data.get("data"):
                raw = base64.b64decode(inline_data["data"])  # REST returns base64
                image = Image.open(BytesIO(raw))
                out_path = os.path.join(output_dir, f"imagen4_output_{image_index}.png")
                image.save(out_path)
                image_index += 1
                saved_any = True
except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, KeyError, ValueError):
    saved_any = False

if not saved_any:
    # Fallback to Gemini image generation (previously working)
    response = client.models.generate_content(
        model="gemini-2.0-flash-preview-image-generation",
        contents=contents,
        config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]) ,
    )

    image_index = 1
    for part in response.candidates[0].content.parts:
        if getattr(part, "text", None):
            print(part.text)
        elif getattr(part, "inline_data", None) is not None and getattr(part.inline_data, "data", None) is not None:
            image = Image.open(BytesIO(part.inline_data.data))
            out_path = os.path.join(output_dir, f"gemini_image_output_{image_index}.png")
            image.save(out_path)
            image_index += 1