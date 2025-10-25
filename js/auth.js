// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// DOM elements
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');

// Toggle between login and signup forms
if (showSignup) {
    showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    });
}

if (showLogin) {
    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.style.display = 'none';
        loginForm.style.display = 'block';
    });
}

// Login function
if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (loginError) loginError.textContent = '';

        // Validate inputs
        if (!email || !password) {
            if (loginError) loginError.textContent = 'Please enter both email and password';
            return;
        }

        // Show loading state
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
        loginBtn.disabled = true;

        // Firebase login
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                return db.collection('users').doc(userCredential.user.uid).set({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            })
            .then(() => {
                window.location.href = 'diagnosis.html';
            })
            .catch((error) => {
                if (loginError) {
                    loginError.textContent = 'Invalid email or password. Please try again.';
                }
                // Reset button state
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                loginBtn.disabled = false;
            });
    });
}

// Signup function
if (signupBtn) {
    signupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        if (signupError) signupError.textContent = '';

        if (password !== confirmPassword) {
            if (signupError) signupError.textContent = 'Passwords do not match';
            return;
        }

        if (!name) {
            if (signupError) signupError.textContent = 'Please enter your full name';
            return;
        }

        if (!email || !password) {
            if (signupError) signupError.textContent = 'Please fill all fields';
            return;
        }

        // Show loading state
        signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
        signupBtn.disabled = true;

        // Firebase signup
        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;

                // Update Firebase Auth displayName
                return user.updateProfile({ displayName: name }).then(() => {
                    // Save user profile to Firestore
                    return db.collection('users').doc(user.uid).set({
                        name: name,
                        email: email,
                        userId: user.uid,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                });
            })
            .then(() => {
                window.location.href = 'diagnosis.html';
            })
            .catch((error) => {
                if (signupError) {
                    signupError.textContent = error.message || 'Account creation failed. Please try again.';
                }
                // Reset button state
                signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
                signupBtn.disabled = false;
            });
    });
}

// Redirect if already logged in
auth.onAuthStateChanged((user) => {
    if (user) {
        if (window.location.pathname.includes('index.html')) {
            window.location.href = 'diagnosis.html';
        }
    } else {
        // If user logs out and is on a protected page, redirect to home
        if (window.location.pathname.includes('diagnosis.html') || 
            window.location.pathname.includes('history.html')) {
            window.location.href = 'home.html';
        }
    }
});

// Logout function
function logoutUser() {
    auth.signOut().then(() => {
        window.location.href = 'home.html';
    }).catch((error) => {
        console.error('Logout error:', error);
        window.location.href = 'home.html';
    });
}
