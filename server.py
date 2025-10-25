import torch
from torchvision import transforms
from flask import Flask, request, jsonify, send_from_directory, send_file
from PIL import Image
import io
import numpy as np
import timm
from flask_cors import CORS
import gdown
import os

# === Model setup ===
classes = [
    'Acne', 'Benign_tumors', 'Eczema', 'Infestations_Bites', 'Lichen',
    'Psoriasis', 'Seborrh_Keratoses', 'Vitiligo', 'Warts'
]

symptom_weights = {
    "itching": np.array([0.1, 0.0, 0.3, 0.2, 0.3, 0.1, 0.0, 0.0, 0.0]),
    "bleeding": np.array([0.0, 0.2, 0.0, 0.2, 0.1, 0.3, 0.2, 0.0, 0.0]),
    "scaly_skin": np.array([0.0, 0.0, 0.2, 0.0, 0.2, 0.4, 0.1, 0.0, 0.0]),
    "white_patches": np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]),
    "sudden_onset": np.array([0.1, 0.2, 0.0, 0.3, 0.1, 0.1, 0.0, 0.0, 0.2]),
}

# === Device setup ===
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# === Download model from Google Drive ===
model_path = "models/skindisease.pth"

# === Load model architecture + weights ===
print("Loading model...")
model = timm.create_model("efficientnet_b3", pretrained=False, num_classes=len(classes))
model.load_state_dict(torch.load(model_path, map_location=device))
model = model.to(device)
model.eval()
print("Model loaded successfully!")

# === Image transforms ===
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

# === Flask setup ===
app = Flask(__name__)
CORS(app)

# Serve CSS files
@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('css', filename)

# Serve JS files
@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('js', filename)

# Serve specific HTML pages
@app.route('/')
def serve_home():
    return send_file('home.html')

@app.route('/index.html')
def serve_index():
    return send_file('index.html')

@app.route('/diagnosis.html')
def serve_diagnosis():
    return send_file('diagnosis.html')

@app.route('/history.html')
def serve_history():
    return send_file('history.html')

@app.route("/predict", methods=["POST"])
def predict():
    try:
        if 'image' not in request.files:
            return jsonify({"success": False, "error": "No image file provided"})

        file = request.files["image"]
        if file.filename == '':
            return jsonify({"success": False, "error": "No image selected"})

        # Read and process image
        image_bytes = file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_tensor = transform(image).unsqueeze(0).to(device)

        # Process symptoms
        symptoms = request.form
        symptom_vector = (
            symptom_weights["itching"] * int(symptoms.get("itching", 0)) +
            symptom_weights["bleeding"] * int(symptoms.get("bleeding", 0)) +
            symptom_weights["scaly_skin"] * int(symptoms.get("scaly_skin", 0)) +
            symptom_weights["white_patches"] * int(symptoms.get("white_patches", 0)) +
            symptom_weights["sudden_onset"] * int(symptoms.get("sudden_onset", 0))
        )

        # Model prediction
        with torch.no_grad():
            outputs = model(img_tensor)
            probs = torch.nn.functional.softmax(outputs, dim=1).cpu().numpy()[0]

        # Adjust probabilities with symptoms
        adjusted_probs = probs + 0.2 * symptom_vector
        adjusted_probs = np.maximum(adjusted_probs, 0)  # Ensure no negative probabilities
        adjusted_probs /= adjusted_probs.sum()

        # Format predictions
        predictions = [
            {"name": classes[i], "prob": round(float(adjusted_probs[i]), 4)}
            for i in range(len(classes))
        ]

        sorted_preds = sorted(predictions, key=lambda x: x["prob"], reverse=True)
        return jsonify({"success": True, "predictions": sorted_preds[:5]})

    except Exception as e:
        print("Error:", e)
        return jsonify({"success": False, "error": str(e)})

# Serve any other static files
@app.route('/<path:filename>')
def serve_static(filename):
    if os.path.exists(filename):
        return send_from_directory('.', filename)
    else:
        return send_file('home.html')  # Fallback

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7860))
    app.run(host='0.0.0.0', port=port)