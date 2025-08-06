// Import Firebase instances dari configFirebase.js
import { database, firestore } from './configFirebase.js';
import { ref, onValue, set } from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js';

// Global Variables
let currentQueueNumber = 0;
let isProcessing = false;

// DOM Elements
const queueValueElement = document.getElementById('queueValue');
const takeQueueBtn = document.getElementById('takeQueueBtn');
let successModal;
const modalQueueNumber = document.getElementById('modalQueueNumber');
const printSpinner = document.getElementById('printSpinner');
const printStatus = document.getElementById('printStatus');

// Gold Prices Management
const goldPricesManager = {
    // Load prices from Firestore
    async loadPrices() {
        try {
            const docRef = doc(firestore, 'settings', 'goldPrices');
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const prices = docSnap.data();
                this.updatePriceDisplay(prices);
                return prices;
            } else {
                // Set default prices if not exists
                const defaultPrices = {
                    '8k': 875000,
                    '9k': 975000,
                    '16k': 1425000,
                    '17k': 1550000,
                    '18k': 1600000,
                    lastUpdated: new Date().toISOString()
                };
                await this.savePrices(defaultPrices);
                this.updatePriceDisplay(defaultPrices);
                return defaultPrices;
            }
        } catch (error) {
            console.error('Error loading gold prices:', error);
            showError('Gagal memuat harga emas');
        }
    },

    // Save prices to Firestore
    async savePrices(prices) {
        try {
            const docRef = doc(firestore, 'settings', 'goldPrices');
            await setDoc(docRef, {
                ...prices,
                lastUpdated: new Date().toISOString()
            });
            console.log('Gold prices saved successfully');
            return true;
        } catch (error) {
            console.error('Error saving gold prices:', error);
            throw error;
        }
    },

    // Update price display on page
    updatePriceDisplay(prices) {
        const priceElements = {
            '8k': document.getElementById('price8k'),
            '9k': document.getElementById('price9k'),
            '16k': document.getElementById('price16k'),
            '17k': document.getElementById('price17k'),
            '18k': document.getElementById('price18k')
        };

        Object.keys(priceElements).forEach(karat => {
            if (priceElements[karat] && prices[karat]) {
                priceElements[karat].textContent = `Rp ${prices[karat].toLocaleString('id-ID')}`;
            }
        });
    },

    // Format number for display
    formatPrice(price) {
        return new Intl.NumberFormat('id-ID').format(price);
    }
};

// Edit Price Modal Management
const editPriceModal = {
    modal: null,
    
    init() {
        // Wait for Bootstrap to be loaded
        if (typeof bootstrap !== 'undefined') {
            this.modal = new bootstrap.Modal(document.getElementById('editPriceModal'));
            this.bindEvents();
        } else {
            // Retry after a short delay
            setTimeout(() => this.init(), 100);
        }
    },

    bindEvents() {
        // Edit button click
        const editBtn = document.getElementById('editPriceBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.openModal();
            });
        }

        // Save button click
        const saveBtn = document.getElementById('savePricesBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.savePrices();
            });
        }
    },

    async openModal() {
        try {
            // Load current prices and populate form
            const prices = await goldPricesManager.loadPrices();
            
            document.getElementById('editPrice8k').value = prices['8k'] || 875000;
            document.getElementById('editPrice9k').value = prices['9k'] || 975000;
            document.getElementById('editPrice16k').value = prices['16k'] || 1425000;
            document.getElementById('editPrice17k').value = prices['17k'] || 1550000;
            document.getElementById('editPrice18k').value = prices['18k'] || 1600000;
            
            this.modal.show();
        } catch (error) {
            console.error('Error opening edit modal:', error);
            showError('Gagal membuka form edit harga');
        }
    },

    async savePrices() {
        try {
            const saveBtn = document.getElementById('savePricesBtn');
            const originalText = saveBtn.innerHTML;
            
            // Show loading
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Menyimpan...';
            
            // Get form values
            const prices = {
                '8k': parseInt(document.getElementById('editPrice8k').value),
                '9k': parseInt(document.getElementById('editPrice9k').value),
                '16k': parseInt(document.getElementById('editPrice16k').value),
                '17k': parseInt(document.getElementById('editPrice17k').value),
                '18k': parseInt(document.getElementById('editPrice18k').value)
            };

            // Validate prices
            const isValid = Object.values(prices).every(price => price > 0);
            if (!isValid) {
                throw new Error('Semua harga harus lebih dari 0');
            }

            // Save to Firestore
            await goldPricesManager.savePrices(prices);
            
            // Update display
            goldPricesManager.updatePriceDisplay(prices);
            
            // Show success
            this.showSuccessMessage();
            this.modal.hide();
            
        } catch (error) {
            console.error('Error saving prices:', error);
            showError(error.message || 'Gagal menyimpan harga emas');
        } finally {
            // Reset button
            const saveBtn = document.getElementById('savePricesBtn');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>Simpan Harga';
        }
    },

    showSuccessMessage() {
        // Create success toast
        const toast = document.createElement('div');
        toast.className = 'toast-success';
        toast.innerHTML = `
            <i class="fas fa-check-circle me-2"></i>
            Harga emas berhasil diperbarui!
        `;
        
        // Add styles
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-weight: 600;
        `;
        
        document.body.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }
};

// Initialize the application
function initializeApp() {
    // Listen for queue number changes
    listenToQueueUpdates();
    
    // Add event listener to take queue button
    if (takeQueueBtn) {
        takeQueueBtn.addEventListener('click', handleTakeQueue);
    }
    
    // Load initial queue number
    loadCurrentQueueNumber();
}

// Load Current Queue Number from Firebase
function loadCurrentQueueNumber() {
    const currentRef = ref(database, 'queue/current');
    onValue(currentRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.number) {
            currentQueueNumber = data.number;
        } else {
            // Initialize queue if not exists
            currentQueueNumber = 0;
            set(currentRef, {
                number: 0,
                lastUpdated: Date.now()
            }).catch(error => {
                console.error('Error initializing queue:', error);
            });
        }
        updateQueueDisplay();
    }, (error) => {
        console.error('Error loading queue number:', error);
        showError('Gagal memuat nomor antrian. Silakan refresh halaman.');
    });
}

// Listen to Queue Updates
function listenToQueueUpdates() {
    const currentRef = ref(database, 'queue/current');
    onValue(currentRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.number !== undefined) {
            currentQueueNumber = data.number;
            updateQueueDisplay();
        }
    });
}

// Update Queue Display
function updateQueueDisplay() {
    const nextNumber = currentQueueNumber + 1;
    const formattedNumber = String(nextNumber).padStart(3, '0');
    if (queueValueElement) {
        queueValueElement.textContent = formattedNumber;
    }
}

// Handle Take Queue Button Click
async function handleTakeQueue() {
    if (isProcessing) return;
    
    try {
        isProcessing = true;
        takeQueueBtn.disabled = true;
        takeQueueBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Memproses...';
        
        // Get next queue number
        const nextQueueNumber = currentQueueNumber + 1;
        const queueData = {
            number: nextQueueNumber,
            takenAt: Date.now(),
            status: 'waiting',
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('id-ID')
        };
        
        // Update Firebase
        await Promise.all([
            set(ref(database, 'queue/current'), {
                number: nextQueueNumber,
                lastUpdated: Date.now()
            }),
            set(ref(database, `queue/history/${nextQueueNumber}`), queueData)
        ]);
        
        // Show success modal
        const formattedNumber = `A${String(nextQueueNumber).padStart(3, '0')}`;
        if (modalQueueNumber) {
            modalQueueNumber.textContent = formattedNumber;
        }
        
        // Initialize modal if not done yet
        if (!successModal) {
            successModal = new bootstrap.Modal(document.getElementById('successModal'));
        }
        successModal.show();
        
        // Start printing process
        setTimeout(() => {
            printReceipt(formattedNumber);
        }, 1000);
        
        // Update current queue number
        currentQueueNumber = nextQueueNumber;
        updateQueueDisplay();
        
    } catch (error) {
        console.error('Error taking queue:', error);
        showError('Gagal mengambil nomor antrian. Silakan coba lagi.');
    } finally {
        // Reset button after a delay
        setTimeout(() => {
            isProcessing = false;
            if (takeQueueBtn) {
                takeQueueBtn.disabled = false;
                takeQueueBtn.innerHTML = '<i class="fas fa-hand-pointer me-2"></i>Ambil Antrian';
            }
        }, 3000);
    }
}

// Print Receipt Function
function printReceipt(queueNumber) {
    try {
        // Update receipt template
        const receiptNumber = document.getElementById('receiptNumber');
        if (receiptNumber) {
            receiptNumber.textContent = queueNumber;
        }
        
        const now = new Date();
        const receiptDate = document.getElementById('receiptDate');
        const receiptTime = document.getElementById('receiptTime');
        
        if (receiptDate) {
            receiptDate.textContent = now.toLocaleDateString('id-ID');
        }
        if (receiptTime) {
            receiptTime.textContent = now.toLocaleTimeString('id-ID');
        }
        
        // Update print status
        if (printStatus) {
            printStatus.textContent = 'Mencetak struk antrian...';
        }
        
        // Simulate printing delay
        setTimeout(() => {
            // For thermal printer, you might need to use a specific library
            // For now, we'll use window.print() which works for regular printers
            window.print();
            
            // Update print status
            if (printSpinner) {
                printSpinner.style.display = 'none';
            }
            if (printStatus) {
                printStatus.innerHTML = '<i class="fas fa-check-circle text-success me-1"></i>Struk berhasil dicetak!';
            }
            
            // Auto close modal after 3 seconds
            setTimeout(() => {
                if (successModal) {
                    successModal.hide();
                }
                // Reset print status for next use
                setTimeout(() => {
                    if (printSpinner) {
                        printSpinner.style.display = 'inline-block';
                    }
                    if (printStatus) {
                        printStatus.textContent = 'Mencetak struk antrian...';
                    }
                }, 500);
            }, 3000);
            
        }, 2000);
        
    } catch (error) {
        console.error('Error printing receipt:', error);
        if (printSpinner) {
            printSpinner.style.display = 'none';
        }
        if (printStatus) {
            printStatus.innerHTML = '<i class="fas fa-exclamation-circle text-warning me-1"></i>Gagal mencetak. Silakan ambil nomor manual.';
        }
    }
}

// Show Error Message
function showError(message) {
    // Create a simple error toast or alert
    const errorAlert = document.createElement('div');
    errorAlert.className = 'alert alert-danger alert-dismissible fade show position-fixed';
    errorAlert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
    errorAlert.innerHTML = `
        <strong>Error:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(errorAlert);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (errorAlert.parentNode) {
            errorAlert.remove();
        }
    }, 5000);
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    // Initialize existing functionality
    initializeApp();
    
    // Initialize new features with delay to ensure all elements are loaded
    setTimeout(() => {
        editPriceModal.init();
        goldPricesManager.loadPrices();
    }, 500);
});

// Handle window beforeunload
window.addEventListener('beforeunload', function() {
    console.log('Page unloading...');
});

// Export for debugging
window.goldPricesManager = goldPricesManager;
window.editPriceModal = editPriceModal;