/**
 * Staff Helper - Mengelola daftar nama staff untuk dropdown
 * @file staffHelper.js
 *
 * STRATEGI CACHING (Optimized untuk mengurangi Firestore reads):
 * - Cache valid 24 jam di localStorage
 * - Cache hanya di-refresh ketika ada perubahan data (via event "salesDataUpdated")
 * - Fallback ke data hardcoded jika Firestore tidak tersedia
 *
 * Dengan strategi ini, Firestore reads sangat minimal:
 * - 1x read saat pertama kali load halaman (per hari)
 * - 1x read ketika ada perubahan data (add/edit/delete dari kelolaSales)
 */

// Import Firebase (akan di-load secara dynamic)
let firestore = null;
let collection = null;
let getDocs = null;
let query = null;
let where = null;
let orderBy = null;

// Initialize Firebase imports
async function initFirebase() {
  if (firestore) return; // Already initialized

  try {
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js");
    const configModule = await import("./configFirebase.js");

    firestore = configModule.firestore;
    collection = firestoreModule.collection;
    getDocs = firestoreModule.getDocs;
    query = firestoreModule.query;
    where = firestoreModule.where;
    orderBy = firestoreModule.orderBy;
  } catch (error) {
    console.warn("Firebase not available, using fallback data:", error);
  }
}

// Daftar nama staff (fallback data - sorted alphabetically)
const STAFF_NAMES_FALLBACK = [
  "ADE INDRA",
  "ADITYA",
  "AGUN",
  "AGUSTINI",
  "ALICIA",
  "ALIM",
  "ANDARI",
  "ARISKA",
  "ASTRY",
  "AYU A.",
  "AYU J",
  "AYU P.",
  "CANDRA",
  "DEBBY",
  "DENY",
  "DESI",
  "DEWI",
  "DIAH",
  "DWIK",
  "ECI",
  "EMI",
  "FARINA",
  "FENDI",
  "FIRA",
  "FITRI",
  "GEK YUNI",
  "GUNG ANIK",
  "HANDY",
  "HAPPY",
  "IKA",
  "KRISNA",
  "LIA",
  "LINDA",
  "MANIK",
  "MARTA",
  "MAY",
  "MAYA",
  "MELIA",
  "MIZZI",
  "NADIA",
  "NANTA",
  "NOVITA",
  "NUEL",
  "PIPIT",
  "PUSPA",
  "RABEL",
  "RACHA",
  "RACHEL",
  "RAMA",
  "RATNA",
  "REYKE",
  "RIZKY",
  "RUSTIA",
  "SANTI",
  "SARAS",
  "SARI",
  "SARI KM",
  "SATYA",
  "SRI",
  "TALIA",
  "TIARA",
  "TRIADI",
  "TU ADE",
  "TYAS",
  "VANA",
  "VEREN",
  "WIDI",
  "WIDIA",
  "WIGUNA",
  "WIRA",
  "WULAN",
  "YOGA",
  "YOHAN",
  "YULI",
];

// Cache untuk data sales dari Firestore
let STAFF_NAMES_CACHE = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 jam

/**
 * Load staff names from Firestore
 */
async function loadSalesFromFirestore() {
  // Check if needs refresh (force reload after CRUD operations)
  const needsRefresh = localStorage.getItem("salesStaffNeedsRefresh");
  if (needsRefresh === "true") {
    localStorage.removeItem("salesStaffNeedsRefresh");
    localStorage.removeItem("salesStaffCache");
    localStorage.removeItem("salesStaffCacheTimestamp");
    STAFF_NAMES_CACHE = null;
  }

  // Check cache first
  const cachedData = localStorage.getItem("salesStaffCache");
  const cacheTimestamp = localStorage.getItem("salesStaffCacheTimestamp");

  if (cachedData && cacheTimestamp) {
    const age = Date.now() - parseInt(cacheTimestamp);
    if (age < CACHE_DURATION) {
      STAFF_NAMES_CACHE = JSON.parse(cachedData);
      return STAFF_NAMES_CACHE;
    }
  }

  // Initialize Firebase if needed
  await initFirebase();

  if (!firestore) {
    // Firebase not available, use fallback
    STAFF_NAMES_CACHE = [...STAFF_NAMES_FALLBACK];
    return STAFF_NAMES_CACHE;
  }

  try {
    // Query active sales from Firestore
    const q = query(collection(firestore, "salesStaff"), where("status", "==", "active"), orderBy("nama", "asc"));

    const querySnapshot = await getDocs(q);
    const salesNames = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.nama) {
        salesNames.push(data.nama);
      }
    });

    // If no data from Firestore, use fallback
    if (salesNames.length === 0) {
      STAFF_NAMES_CACHE = [...STAFF_NAMES_FALLBACK];
    } else {
      STAFF_NAMES_CACHE = salesNames;
    }

    // Cache the data
    localStorage.setItem("salesStaffCache", JSON.stringify(STAFF_NAMES_CACHE));
    localStorage.setItem("salesStaffCacheTimestamp", Date.now().toString());

    return STAFF_NAMES_CACHE;
  } catch (error) {
    console.error("Error loading sales from Firestore:", error);
    // Use fallback on error
    STAFF_NAMES_CACHE = [...STAFF_NAMES_FALLBACK];
    return STAFF_NAMES_CACHE;
  }
}

/**
 * Get staff names (from cache or Firestore)
 */
async function getStaffNames() {
  if (STAFF_NAMES_CACHE) {
    return STAFF_NAMES_CACHE;
  }
  return await loadSalesFromFirestore();
}

/**
 * Populate select element dengan daftar nama staff
 * @param {string|HTMLSelectElement} selectElementOrId - ID atau elemen select
 */
async function populateStaffDropdown(selectElementOrId) {
  const selectElement =
    typeof selectElementOrId === "string" ? document.getElementById(selectElementOrId) : selectElementOrId;

  if (!selectElement) {
    // Silently return if element doesn't exist (expected on pages that don't use all dropdowns)
    return;
  }

  // Get staff names from Firestore or cache
  const staffNames = await getStaffNames();

  // Clear existing options (except placeholder if exists)
  selectElement.innerHTML = "";

  // Add placeholder option
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "-- Pilih Nama Staff --";
  selectElement.appendChild(placeholderOption);

  // Add staff names
  staffNames.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    selectElement.appendChild(option);
  });
}

/**
 * Initialize semua staff dropdown pada halaman
 */
async function initializeAllStaffDropdowns() {
  // Daftar ID dropdown yang perlu diisi
  const staffDropdownIds = [
    "updateKomputerWarnaNama",
    "updateKomputerNama",
    "penambahStok",
    "penambahStokKalungBulk",
    "pengurangStokKalungBulk",
    "petugasUpdateStokKalungBulk",
    "penambahStokHalaBulk",
    "pengurangStokHalaBulk",
    "penambahStokLiontinBulk",
    "pengurangStokLiontinBulk",
    "petugasUpdateStokLiontinBulk",
    "petugasUpdateStokHalaBulk",
    "pengurangStok",
    "updateStokPetugas",
    "sales", // Added for penjualanAksesoris.html
  ];

  // Load staff names first
  await loadSalesFromFirestore();

  // Populate all dropdowns
  for (const id of staffDropdownIds) {
    await populateStaffDropdown(id);
  }
}

/**
 * Refresh all dropdowns (called when sales data updated)
 */
async function refreshAllStaffDropdowns() {
  // Clear cache
  STAFF_NAMES_CACHE = null;
  localStorage.removeItem("salesStaffCache");
  localStorage.removeItem("salesStaffCacheTimestamp");
  localStorage.setItem("salesStaffNeedsRefresh", "true");

  // Reload and repopulate
  await initializeAllStaffDropdowns();
}

// Listen for sales data updates
window.addEventListener("salesDataUpdated", () => {
  refreshAllStaffDropdowns();
});

// Auto-initialize saat DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAllStaffDropdowns);
} else {
  initializeAllStaffDropdowns();
}

// Export untuk digunakan di file lain jika diperlukan
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STAFF_NAMES_FALLBACK,
    populateStaffDropdown,
    initializeAllStaffDropdowns,
    refreshAllStaffDropdowns,
    getStaffNames,
    loadSalesFromFirestore,
  };
}
