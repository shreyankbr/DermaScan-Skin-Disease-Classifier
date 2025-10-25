import { generateGradCAM, initGradCAM } from './gradcam.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB8B1ZKOK6T0JIehHCrXB8oi_NGOWs2VHk",
    authDomain: "skin-disease-3cbf9.firebaseapp.com",
    projectId: "skin-disease-3cbf9",
    storageBucket: "skin-disease-3cbf9.appspot.com",
    messagingSenderId: "117215400065",
    appId: "1:117215400065:web:4975b24971af7a37fc3d80"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', function () {
    const uploadArea = document.getElementById('upload-area');
    const imageUpload = document.getElementById('image-upload');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const removeImageBtn = document.getElementById('remove-image');
    const diagnoseBtn = document.getElementById('diagnose-btn');
    const resultsSection = document.getElementById('results-section');
    const originalImage = document.getElementById('original-image');
    const gradcamImage = document.getElementById('gradcam-image');
    const topDiagnosis = document.getElementById('top-diagnosis');
    const otherDiagnoses = document.getElementById('other-diagnoses');
    const recommendations = document.getElementById('recommendations');
    const loadingModal = document.getElementById('loading-modal');
    const generateReportBtn = document.getElementById('generate-report');
    const newDiagnosisBtn = document.getElementById('new-diagnosis');
    const logoutBtn = document.getElementById('logout-btn');
    const historyBtn = document.getElementById('history-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const cameraModal = document.getElementById('camera-modal');
    const cameraFeed = document.getElementById('camera-feed');
    const captureBtn = document.getElementById('capture-btn');
    const closeCamera = document.querySelector('.close-camera');
    const cancelCameraBtn = document.getElementById('cancel-camera-btn');
    const trialBadge = document.getElementById('trial-badge');
    let stream = null;

    // Check auth state and show/hide trial badge and history button
    auth.onAuthStateChanged((user) => {
        if (!user) {
            // Trial mode - user not logged in
            if (trialBadge) trialBadge.style.display = 'flex';
            if (historyBtn) historyBtn.style.display = 'none';
        } else {
            // User logged in - full version
            if (trialBadge) trialBadge.style.display = 'none';
            if (historyBtn) historyBtn.style.display = 'flex';
        }
    });

    // Initialize GradCAM
    initGradCAM();

    // Event Listeners
    uploadArea.addEventListener('click', () => imageUpload.click());
    imageUpload.addEventListener('change', handleImageUpload);
    removeImageBtn.addEventListener('click', resetImageUpload);
    diagnoseBtn.addEventListener('click', startDiagnosis);
    generateReportBtn.addEventListener('click', generatePDFReport);
    newDiagnosisBtn.addEventListener('click', resetDiagnosis);

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            window.location.href = 'history.html';
        });
    }

    cameraBtn.addEventListener('click', startCamera);
    uploadBtn.addEventListener('click', () => imageUpload.click());
    closeCamera.addEventListener('click', stopCamera);
    captureBtn.addEventListener('click', capturePhoto);
    cancelCameraBtn.addEventListener('click', stopCamera);

    // Drag and Drop Handlers
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            imageUpload.files = e.dataTransfer.files;
            handleImageUpload({ target: imageUpload });
        }
    });

    // Functions
    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (file && file.type.match('image.*')) {
            // Check file size (10MB limit)
            if (file.size > 10 * 1024 * 1024) {
                alert("File size too large. Please upload an image smaller than 10MB.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                previewImage.src = e.target.result;
                originalImage.src = e.target.result;
                previewContainer.style.display = 'block';
                uploadArea.style.display = 'none';
                diagnoseBtn.disabled = false;
            };
            reader.readAsDataURL(file);
        } else {
            alert("Please upload a valid image file (JPG, PNG, or WEBP).");
        }
    }

    async function startDiagnosis() {
        // Set loading state
        diagnoseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        diagnoseBtn.disabled = true;

        const symptoms = {
            itching: document.getElementById('itching').checked,
            bleeding: document.getElementById('bleeding').checked,
            scaly_skin: document.getElementById('scaly_skin').checked,
            white_patches: document.getElementById('white_patches').checked,
            sudden_onset: document.getElementById('sudden_onset').checked
        };

        const file = imageUpload.files[0];
        if (!file) {
            alert("Please upload an image.");
            resetAnalyzeButton();
            return;
        }

        loadingModal.style.display = 'flex';
        let analysisSuccess = false;

        try {
            const formData = new FormData();
            formData.append("image", file);
            Object.entries(symptoms).forEach(([key, value]) => {
                formData.append(key, value ? '1' : '0');
            });

            const response = await fetch("/predict", {
                method: "POST",
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const result = await response.json();
            if (!result.success) throw new Error(result.error || "API error");

            const predictions = {};
            result.predictions.forEach(pred => {
                predictions[pred.name] = pred.prob;
            });

            await displayResults(predictions);
            analysisSuccess = true;

            // Save to history if user is logged in
            const user = auth.currentUser;
            if (user) {
                await saveToHistory(user.uid, file, symptoms, predictions);
            }

        } catch (error) {
            console.error("Diagnosis failed:", error);
            showToast("Diagnosis failed. Please try again.", 'error');
        } finally {
            loadingModal.style.display = 'none';
            if (!analysisSuccess) {
                resetAnalyzeButton();
            }
        }
    }

    async function saveToHistory(userId, file, symptoms, results) {
        try {
            // Convert image to base64 for storage
            const imageBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });

            await db.collection('users').doc(userId).collection('diagnoses').add({
                date: new Date(),
                imageUrl: imageBase64,
                symptoms: symptoms,
                results: results
            });
        } catch (error) {
            console.error("Error saving to history:", error);
        }
    }

    function resetAnalyzeButton() {
        diagnoseBtn.innerHTML = '<i class="fas fa-search"></i> Analyze Image';
        diagnoseBtn.disabled = false;
    }

    async function displayResults(results) {
        try {
            resetAnalyzeButton();

            const resultsArray = Object.entries(results)
                .map(([name, prob]) => ({ name, prob }))
                .sort((a, b) => b.prob - a.prob);

            const topResult = resultsArray[0];
            const topProbPercent = (topResult.prob * 100).toFixed(1);

            // Update top diagnosis
            topDiagnosis.querySelector('.diagnosis-name').textContent = topResult.name;
            topDiagnosis.querySelector('.diagnosis-probability').textContent = `${topProbPercent}%`;
            topDiagnosis.querySelector('.confidence-bar').style.width = `${topProbPercent}%`;

            // Generate GradCAM visualization
            try {
                await generateGradCAM(previewImage, gradcamImage, topResult.name);
            } catch (gradcamError) {
                console.error("GradCAM generation failed:", gradcamError);
                gradcamImage.src = previewImage.src;
            }

            // Process other diagnoses
            otherDiagnoses.innerHTML = '';
            for (let i = 1; i < Math.min(4, resultsArray.length); i++) {
                const result = resultsArray[i];
                const probPercent = (result.prob * 100).toFixed(1);

                const diagnosisItem = document.createElement('div');
                diagnosisItem.className = 'diagnosis-item';
                diagnosisItem.innerHTML = `
                    <div class="diagnosis-name">${result.name}&nbsp;</div>
                    <div class="diagnosis-probability">${probPercent}</div>
                    <div class="confidence-meter">
                        <div class="confidence-bar" style="width: ${probPercent}%"></div>
                    </div>
                `;
                otherDiagnoses.appendChild(diagnosisItem);
            }

            // Show recommendations
            displayRecommendations(topResult.name);

            // Display results section
            resultsSection.style.display = 'block';
            setTimeout(() => {
                resultsSection.scrollIntoView({ behavior: 'smooth' });
            }, 100);

            // Show success notification
            showToast(`Diagnosis complete! Found ${topResult.name} with ${topProbPercent}% confidence`, 'success');

        } catch (error) {
            console.error("Error displaying results:", error);
            showToast("Error displaying results. Please try again.", 'error');
            resetAnalyzeButton();
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            ${message}
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (document.body.contains(toast)) {
                        document.body.removeChild(toast);
                    }
                }, 300);
            }, 3000);
        }, 100);
    }

    function displayRecommendations(diagnosis) {
        const recommendationMap = {
            'Acne': [
                'Cleanse gently twice daily with non-comedogenic products',
                'Use oil-free, non-comedogenic moisturizers and sunscreen',
                'Avoid picking or squeezing lesions to prevent scarring',
                'Consider over-the-counter treatments with benzoyl peroxide or salicylic acid',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Eczema': [
                'Apply thick, fragrance-free moisturizers immediately after bathing',
                'Use mild, soap-free cleansers and avoid hot water',
                'Identify and avoid personal triggers like certain fabrics or allergens',
                'Apply cool compresses to relieve itching',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Psoriasis': [
                'Moisturize regularly with thick creams or ointments',
                'Get controlled sunlight exposure (avoid sunburn)',
                'Use medicated shampoos for scalp involvement',
                'Avoid alcohol and smoking which can worsen symptoms',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Vitiligo': [
                'Use broad-spectrum sunscreen on all exposed skin',
                'Consider cosmetic cover-ups or camouflage products',
                'Protect affected skin from trauma and friction',
                'Join support groups for emotional support and coping strategies',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Benign_tumors': [
                'Monitor for changes in size, color, or texture',
                'Protect from sun exposure with sunscreen and protective clothing',
                'Avoid irritation or trauma to the area',
                'Document growth patterns with photos for tracking',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Infestations_Bites': [
                'Keep the area clean and avoid scratching',
                'Use cool compresses and anti-itch creams',
                'Identify and eliminate the source if possible',
                'Wash bedding and clothing in hot water',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Lichen': [
                'Use gentle, fragrance-free skincare products',
                'Apply cool compresses to relieve itching',
                'Avoid scratching or rubbing affected areas',
                'Wear loose, breathable clothing',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Seborrh_Keratoses': [
                'No treatment needed unless for cosmetic reasons or irritation',
                'Avoid picking or scratching the lesions',
                'Protect skin from excessive sun exposure',
                'Monitor for any changes in appearance',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'Warts': [
                'Avoid picking or scratching to prevent spread',
                'Keep the area clean and dry',
                'Don\'t share personal items like towels or razors',
                'Consider over-the-counter salicylic acid treatments',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ],
            'default': [
                'Keep the affected area clean and dry',
                'Avoid scratching or irritating the area',
                'Monitor for changes in size, color, or symptoms',
                'Use gentle, fragrance-free skincare products',
                'Consult a dermatologist for accurate diagnosis and treatment'
            ]
        };

        const recs = recommendationMap[diagnosis] || recommendationMap['default'];
        recommendations.innerHTML = `
        <h4>Recommended Care Instructions</h4>
        <ul>
            ${recs.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    `;
    }

    async function generatePDFReport() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        try {
            let patientName = 'Patient';

            // Document setup
            doc.setProperties({
                title: 'DermaScan Diagnosis Report',
                subject: 'Skin Disease Diagnosis Results',
                author: 'DermaScan AI'
            });

            // Header
            doc.setFontSize(20);
            doc.setTextColor(33, 150, 243);
            doc.setFont('helvetica', 'bold');
            doc.text('DERMASCAN AI DIAGNOSIS REPORT', 105, 20, { align: 'center' });

            // Patient Info
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text('Patient Information:', 15, 45);
            doc.setFont('helvetica', 'normal');
            doc.text(`Name: ${patientName}`, 15, 55);
            doc.text(`Report Date: ${new Date().toLocaleDateString()}`, 15, 65);

            // Diagnosis Results
            doc.setFontSize(16);
            doc.setTextColor(33, 150, 243);
            doc.setFont('helvetica', 'bold');
            doc.text('Diagnosis Results', 15, 85);

            const topDiag = topDiagnosis.querySelector('.diagnosis-name').textContent.trim();
            const topProb = topDiagnosis.querySelector('.diagnosis-probability').textContent.trim();

            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text('Primary Diagnosis:', 20, 100);
            doc.setFont('helvetica', 'normal');
            doc.text(`${topDiag} (${topProb} confidence)`, 20, 110);

            // Other diagnoses
            doc.setFont('helvetica', 'bold');
            doc.text('Differential Diagnoses:', 20, 125);
            doc.setFont('helvetica', 'normal');
            const otherItems = otherDiagnoses.querySelectorAll('.diagnosis-item');
            let yPos = 135;
            otherItems.forEach((item) => {
                const name = item.querySelector('.diagnosis-name').textContent.trim();
                const prob = item.querySelector('.diagnosis-probability').textContent.trim();
                doc.text(`• ${name}: ${prob}`, 25, yPos);
                yPos += 7;
            });

            // Recommendations Section
            yPos += 10;
            doc.setFontSize(16);
            doc.setTextColor(33, 150, 243);
            doc.setFont('helvetica', 'bold');
            doc.text('Medical Recommendations & Care Instructions', 15, yPos);

            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            const recItems = recommendations.querySelectorAll('li');
            yPos += 10;

            // Split recommendations into two columns if there are many
            const midPoint = Math.ceil(recItems.length / 2);
            const leftColumn = Array.from(recItems).slice(0, midPoint);
            const rightColumn = Array.from(recItems).slice(midPoint);

            // Left column
            let currentY = yPos;
            leftColumn.forEach((item) => {
                const text = item.textContent.trim();
                const lines = doc.splitTextToSize(`• ${text}`, 80);
                lines.forEach(line => {
                    if (currentY < 270) {
                        doc.text(line, 20, currentY);
                        currentY += 5;
                    }
                });
                currentY += 2;
            });

            // Right column
            currentY = yPos;
            rightColumn.forEach((item) => {
                const text = item.textContent.trim();
                const lines = doc.splitTextToSize(`• ${text}`, 80);
                lines.forEach(line => {
                    if (currentY < 270) {
                        doc.text(line, 110, currentY);
                        currentY += 5;
                    }
                });
                currentY += 2;
            });

            // Footer
            const finalY = Math.max(currentY, yPos + 60);
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('This AI-generated report is for informational purposes only and should not replace professional medical advice.', 105, finalY, { align: 'center' });
            doc.text('Always consult with a qualified healthcare provider for proper diagnosis and treatment.', 105, finalY + 4, { align: 'center' });

            // Save PDF
            const fileName = `DermaScan_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);

            showToast('✅ Report downloaded successfully!', 'success');
        } catch (error) {
            console.error("Error generating PDF:", error);
            showToast("Error generating report. Please try again.", 'error');
        }
    }

    // Camera functions
    async function startCamera() {
        try {
            cameraModal.style.display = 'block';
            document.body.style.overflow = 'hidden';

            cameraFeed.srcObject = null;
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
            cameraFeed.srcObject = stream;
            document.addEventListener('keydown', handleEscapeKey);
        } catch (err) {
            console.error("Camera error:", err);
            alert("Camera access denied. Please check permissions.");
            stopCamera();
        }
    }

    function stopCamera() {
        document.removeEventListener('keydown', handleEscapeKey);
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        cameraModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        cameraFeed.srcObject = null;
    }

    function handleEscapeKey(e) {
        if (e.key === 'Escape') {
            stopCamera();
        }
    }

    function capturePhoto() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = cameraFeed.videoWidth;
        canvas.height = cameraFeed.videoHeight;
        context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            imageUpload.files = dataTransfer.files;

            previewImage.src = URL.createObjectURL(blob);
            originalImage.src = URL.createObjectURL(blob);
            previewContainer.style.display = 'block';
            uploadArea.style.display = 'none';
            diagnoseBtn.disabled = false;

            stopCamera();
        }, 'image/jpeg', 0.9);
    }

    function resetDiagnosis() {
        diagnoseBtn.innerHTML = '<i class="fas fa-search"></i> Analyze Image';
        diagnoseBtn.disabled = false;
        previewContainer.style.display = 'none';
        uploadArea.style.display = 'flex';
        imageUpload.value = '';
        resultsSection.style.display = 'none';
        document.querySelectorAll('.symptom-checkbox input').forEach(cb => cb.checked = false);
        gradcamImage.src = '';
    }

    function resetImageUpload() {
        previewContainer.style.display = 'none';
        uploadArea.style.display = 'flex';
        diagnoseBtn.disabled = true;
        imageUpload.value = '';
    }

    function logoutUser() {
        auth.signOut().then(() => {
            window.location.href = 'home.html';
        }).catch((error) => {
            console.error('Logout error:', error);
            window.location.href = 'home.html';
        });
    }
});