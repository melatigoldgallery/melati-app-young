// Import Firebase modules
import { firestore } from "./configFirebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Define stock categories and item types
const mainCategories = ["KALUNG", "LIONTIN", "ANTING", "CINCIN", "HALA", "GELANG", "GIWANG"];
const subCategories = ["Stok Brankas", "Belum Posting", "Display", "Rusak", "Batu Lepas", "Manual", "Admin"];
const categories = [
  "brankas",
  "admin",
  "barang-rusak",
  "posting",
  "batu-lepas",
  "barang-display",
  "manual",
  "stok-komputer",
];
const summaryCategories = ["brankas", "admin", "posting", "barang-rusak", "batu-lepas", "manual", "barang-display"];

// Cache management variables - Improved caching system
let stockData = {};
const CACHE_KEY = "stockDataCache";
const CACHE_TTL_STANDARD = 5 * 60 * 1000; // 5 minutes for standard data
const CACHE_TTL_REALTIME = 30 * 1000; // 30 seconds for real-time updates
const MAX_HISTORY_RECORDS = 10;

// Cache management with Map for better performance
const stockCache = new Map();
const stockCacheMeta = new Map();

// Initialize cache from localStorage
function initializeCache() {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      stockData = parsedData.data || {};

      // Load cache metadata
      if (parsedData.meta) {
        Object.entries(parsedData.meta).forEach(([key, timestamp]) => {
          stockCacheMeta.set(key, timestamp);
        });
      }

      // Load cache data into Map
      Object.entries(stockData).forEach(([category, data]) => {
        stockCache.set(category, data);
      });
    }
  } catch (error) {
    console.error("Error initializing cache:", error);
    localStorage.removeItem(CACHE_KEY);
    stockCache.clear();
    stockCacheMeta.clear();
  }
}

// Update cache in localStorage
function updateCache() {
  try {
    const cacheData = {
      timestamp: Date.now(),
      data: stockData,
      meta: Object.fromEntries(stockCacheMeta),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error("Error updating cache:", error);
    // If localStorage is full, clear old cache
    if (error.name === "QuotaExceededError") {
      localStorage.removeItem(CACHE_KEY);
      console.log("Cache cleared due to storage quota exceeded");
    }
  }
}

// Check if cache is valid for a specific category
function isCacheValid(category) {
  const timestamp = stockCacheMeta.get(category);
  if (!timestamp) return false;

  const now = Date.now();
  const age = now - timestamp;

  // Use shorter TTL for categories that change frequently
  const ttl = ["brankas", "admin"].includes(category) ? CACHE_TTL_REALTIME : CACHE_TTL_STANDARD;

  return age < ttl;
}

// Update cache timestamp for specific category
function updateCacheTimestamp(category) {
  stockCacheMeta.set(category, Date.now());
  updateCache();
}

// Check if any cache needs update
function shouldUpdateCache() {
  return categories.some((category) => !isCacheValid(category));
}

// Function to clean and limit history
function cleanAndLimitHistory(data) {
  Object.keys(data).forEach((category) => {
    Object.keys(data[category]).forEach((type) => {
      if (data[category][type].history && Array.isArray(data[category][type].history)) {
        // HANYA SORT DAN LIMIT JUMLAH
        let filteredHistory = data[category][type].history;

        filteredHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (filteredHistory.length > MAX_HISTORY_RECORDS) {
          filteredHistory = filteredHistory.slice(0, MAX_HISTORY_RECORDS);
        }

        data[category][type].history = filteredHistory;
      }
    });
  });

  return data;
}

// Function to add history entry with automatic cleanup
function addHistoryEntry(item, historyEntry) {
  if (!item.history) {
    item.history = [];
  }

  item.history.unshift(historyEntry);
  item.history.sort((a, b) => new Date(b.date) - new Date(a.date));

  // HANYA BATASI BERDASARKAN JUMLAH RECORD (HAPUS PEMBATASAN WAKTU)
  if (item.history.length > MAX_HISTORY_RECORDS) {
    item.history = item.history.slice(0, MAX_HISTORY_RECORDS);
  }

  return item.history;
}

// Improved fetch function with better cache management
async function fetchStockData(forceRefresh = false) {
  try {
    // Check if we need to refresh any category
    const needsRefresh = forceRefresh || shouldUpdateCache();

    if (!needsRefresh && Object.keys(stockData).length > 0) {
      console.log("Using cached stock data");
      return stockData;
    }

    console.log("Fetching fresh stock data from Firestore");

    // Fetch only categories that need refresh or all if forced
    const categoriesToFetch = forceRefresh ? categories : categories.filter((category) => !isCacheValid(category));

    if (categoriesToFetch.length === 0) {
      return stockData;
    }

    // Fetch data for specific categories
    const fetchPromises = categoriesToFetch.map(async (category) => {
      const categoryRef = doc(firestore, "stocks", category);
      const categoryDoc = await getDoc(categoryRef);

      if (categoryDoc.exists()) {
        const categoryData = categoryDoc.data();
        stockData[category] = categoryData;
        stockCache.set(category, categoryData);
        updateCacheTimestamp(category);
        return { category, data: categoryData };
      } else {
        // Initialize if doesn't exist
        const initialData = {};
        itemTypes.forEach((type) => {
          initialData[type] = {
            quantity: 0,
            lastUpdated: null,
            history: [],
          };
        });

        await setDoc(categoryRef, initialData);
        stockData[category] = initialData;
        stockCache.set(category, initialData);
        updateCacheTimestamp(category);
        return { category, data: initialData };
      }
    });

    await Promise.all(fetchPromises);

    // Clean and limit history entries
    stockData = cleanAndLimitHistory(stockData);

    // Update cache
    updateCache();

    return stockData;
  } catch (error) {
    console.error("Error fetching stock data:", error);

    // Fallback to cache if available
    if (Object.keys(stockData).length > 0) {
      console.log("Using cached data as fallback");
      return stockData;
    }

    throw error;
  }
}

// Initialize Firestore with default data structure
async function initializeFirestoreData() {
  try {
    const initPromises = categories.map(async (category) => {
      const categoryData = {};

      itemTypes.forEach((type) => {
        categoryData[type] = {
          quantity: 0,
          lastUpdated: null,
          history: [],
        };
      });

      await setDoc(doc(firestore, "stocks", category), categoryData);
      stockData[category] = categoryData;
      stockCache.set(category, categoryData);
      updateCacheTimestamp(category);
    });

    await Promise.all(initPromises);
    updateCache();
  } catch (error) {
    console.error("Error initializing Firestore data:", error);
  }
}

// Optimized save function - only update specific item
async function saveData(category, type) {
  try {
    const categoryRef = doc(firestore, "stocks", category);

    // Update only the specific item type
    const updateData = {};
    updateData[type] = stockData[category][type];

    await updateDoc(categoryRef, updateData);

    // Update cache timestamp for this category
    updateCacheTimestamp(category);

    console.log(`Successfully saved ${type} in ${category}`);
  } catch (error) {
    console.error("Error saving data to Firestore:", error);

    // Try to create document if it doesn't exist
    try {
      await setDoc(categoryRef, stockData[category]);
      updateCacheTimestamp(category);
    } catch (createError) {
      console.error("Error creating document:", createError);
      alert("Terjadi kesalahan saat menyimpan data. Silakan coba lagi.");
    }
  }
}

// Function to format date
function formatDate(date) {
  if (!date) return "-";

  const d = new Date(date);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

// Mapping subcategories to internal category keys
const categoryMapping = {
  "Stok Brankas": "brankas",
  "Belum Posting": "posting",
  Display: "barang-display",
  Rusak: "barang-rusak",
  "Batu Lepas": "batu-lepas",
  Manual: "manual",
  Admin: "admin",
};

/**
 * Helper function to convert subcategory to category key
 * @param {string} subCategory - The subcategory to convert
 * @returns {string} The corresponding category key
 */
function getCategoryKey(subCategory) {
  return categoryMapping[subCategory] || "";
}

/**
 * Helper function to determine badge color based on quantity
 * @param {number} quantity - The stock quantity
 * @returns {string} The Bootstrap badge class
 */
function getQuantityBadgeClass(quantity) {
  if (quantity === 0) return "bg-danger";
  if (quantity <= 5) return "bg-warning";
  if (quantity >= 20) return "bg-success";
  return "bg-primary";
}

/**
 * Creates a table structure for a category
 * @param {string} mainCategory - The main category name
 * @returns {HTMLElement} The created table container
 */
function createCategoryTable(mainCategory) {
  const container = document.createElement("div");
  container.innerHTML = `
        <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="mb-0">${mainCategory}</h3>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Jenis</th>
                                <th class="text-center">Jumlah</th>
                                <th class="text-center">Terakhir Update</th>
                                <th class="text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="${mainCategory.toLowerCase()}-table-body">
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
  return container;
}

/**
 * Creates a table row for a stock item
 * @param {string} mainCategory - The main category name
 * @param {string} subCategory - The subcategory name
 * @param {Object} stockItem - The stock item data
 * @returns {HTMLElement} The created table row
 */
function createStockRow(mainCategory, subCategory, stockItem) {
  const quantity = stockItem?.quantity || 0;
  const lastUpdated = stockItem?.lastUpdated || null;
  const categoryKey = getCategoryKey(subCategory);
  const quantityBadge = getQuantityBadgeClass(quantity);

  const tr = document.createElement("tr");
  tr.innerHTML = `
        <td class="text-left">${subCategory}</td>
        <td class="text-center"><span class="badge ${quantityBadge}">${quantity}</span></td>
        <td class="text-center">${lastUpdated ? formatDate(lastUpdated) : "-"}</td>
        <td class="text-center">
            <button class="btn btn-sm btn-primary" onclick="editStock('${mainCategory}', '${categoryKey}', ${quantity})">
                <i class="fas fa-edit"></i>
            </button>
        </td>
    `;
  return tr;
}

/**
 * Populates the stock tables with data from all categories
 */
// Initialize and populate tabs
document.addEventListener("DOMContentLoaded", () => {
  const tabContainer = document.getElementById("stockTabs");
  const tabContentContainer = document.getElementById("stockTabContent");

  // Clear existing content
  tabContainer.innerHTML = "";
  tabContentContainer.innerHTML = "";

  // Create tabs and content for each category
  mainCategories.forEach((category, index) => {
    // Create tab
    const tab = document.createElement("li");
    tab.className = "nav-item";
    tab.setAttribute("role", "presentation");
    tab.innerHTML = `
            <button class="nav-link ${index === 0 ? "active" : ""}"
                    id="${category.toLowerCase()}-tab"
                    data-bs-toggle="tab"
                    data-bs-target="#${category.toLowerCase()}-content"
                    type="button"
                    role="tab">
                <i class="fas fa-gem me-2"></i>${category}
            </button>
        `;
    tabContainer.appendChild(tab);

    // Create content pane
    const pane = document.createElement("div");
    pane.className = `tab-pane fade ${index === 0 ? "show active" : ""}`;
    pane.id = `${category.toLowerCase()}-content`;
    pane.setAttribute("role", "tabpanel");
    pane.innerHTML = `
            <div class="card mb-4">
                <div class="card-header">
                    <h3 class="mb-0">${category}</h3>
                </div>
                <div class="card-body">
                    <div class="table-container">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Jenis</th>
                                    <th class="text-center">Jumlah</th>
                                    <th class="text-center">Terakhir Update</th>
                                    <th class="text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody id="${category.toLowerCase()}-table-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    tabContentContainer.appendChild(pane);
  });
});

// Populate tables with data
export async function populateTables() {
  try {
    await fetchStockData();

    for (const mainCategory of mainCategories) {
      const tableBody = document.getElementById(`${mainCategory.toLowerCase()}-table-body`);
      if (!tableBody) {
        console.warn(`Table body not found for ${mainCategory}`);
        continue;
      }

      tableBody.innerHTML = "";
      const fragment = document.createDocumentFragment();

      for (const subCategory of subCategories) {
        const categoryKey = getCategoryKey(subCategory);
        const stockItem = stockData[categoryKey]?.[mainCategory];
        const row = createStockRow(mainCategory, subCategory, stockItem);
        fragment.appendChild(row);
      }

      tableBody.appendChild(fragment);
    }
  } catch (error) {
    console.error("Error populating tables:", error);
    showToast("error", "Gagal memuat data stok");
  }
}

// Function to update summary totals
function updateSummaryTotals() {
  itemTypes.forEach((type) => {
    let summaryTotal = 0;
    let computerStock = 0;

    // Calculate total from summary categories
    summaryCategories.forEach((category) => {
      if (stockData[category] && stockData[category][type]) {
        summaryTotal += parseInt(stockData[category][type].quantity) || 0;
      }
    });

    // Get computer stock
    if (stockData["stok-komputer"] && stockData["stok-komputer"][type]) {
      computerStock = parseInt(stockData["stok-komputer"][type].quantity) || 0;
    }

    // Get DOM elements
    const totalElement = document.getElementById(`total-${type.toLowerCase()}`);
    const statusElement = document.getElementById(`label-jenis-${type}`);

    // Update display elements if they exist
    if (totalElement) {
      // Calculate difference
      const difference = summaryTotal - computerStock;

      // Update total display with actual number
      if (totalElement) {
        totalElement.textContent = summaryTotal;
        if (difference === 0) {
          totalElement.className = "number text-success";
        } else if (difference < 0) {
          totalElement.className = "number text-danger";
        } else {
          totalElement.className = "number text-warning";
        }
      }

      // Update status label with comparison result
      if (statusElement) {
        if (difference === 0) {
          statusElement.textContent = "Klop";
          statusElement.className = "text-success";
        } else if (difference < 0) {
          statusElement.textContent = `Minus ${Math.abs(difference)}`;
          statusElement.className = "text-danger";
        } else {
          statusElement.textContent = `Plus ${difference}`;
          statusElement.className = "text-warning";
        }
      }
    }
  });
}

// Function to show history in modal
function showHistory(category, type) {
  const historyTitle = document.getElementById("history-title");
  const historyTableBody = document.getElementById("history-table-body");

  historyTitle.textContent = `${type} (${category.toUpperCase()})`;
  historyTableBody.innerHTML = "";

  const history = stockData[category][type].history;

  if (!history || history.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5" class="text-center">Tidak ada riwayat</td>';
    historyTableBody.appendChild(row);
  } else {
    const sortedHistory = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedHistory.forEach((record, index) => {
      const row = document.createElement("tr");

      // Determine badge style based on action
      const actionBadge =
        record.action === "Tambah"
          ? '<span class="badge bg-success"><i class="fas fa-plus me-1"></i>Tambah</span>'
          : '<span class="badge bg-danger"><i class="fas fa-minus me-1"></i>Kurang</span>';

      row.innerHTML = `
                <td>${formatDate(record.date)}</td>
                <td>${actionBadge}</td>
                <td><span class="badge bg-primary">${record.quantity}</span></td>
                <td>${record.action === "Tambah" ? record.adder : record.reducer}</td>
                <td>${record.action === "Tambah" ? record.receiver : record.notes}</td>
            `;
      historyTableBody.appendChild(row);
    });

    if (history.length >= MAX_HISTORY_RECORDS) {
      const infoRow = document.createElement("tr");
      infoRow.innerHTML = `
                <td colspan="5" class="text-center text-muted small">
                    <i class="fas fa-info-circle me-1"></i>
                    Menampilkan ${MAX_HISTORY_RECORDS} riwayat terbaru
                </td>
            `;
      historyTableBody.appendChild(infoRow);
    }
  }

  const historyModal = new bootstrap.Modal(document.getElementById("historyModal"));
  historyModal.show();
}

// Function to add stock
async function addStock(category, type, quantity, adder, receiver) {
  try {
    // Ensure we have the latest data
    await fetchStockData();

    if (!stockData[category] || !stockData[category][type]) {
      alert("Kategori atau jenis barang tidak ditemukan.");
      return;
    }

    const item = stockData[category][type];

    // Update quantity
    item.quantity += parseInt(quantity);
    item.lastUpdated = new Date().toISOString();

    // Add to history using the new function
    const historyEntry = {
      date: item.lastUpdated,
      action: "Tambah",
      quantity: quantity,
      adder: adder,
      receiver: receiver,
    };

    addHistoryEntry(item, historyEntry);

    // Update cache
    stockCache.set(category, stockData[category]);

    // Save to Firestore
    await saveData(category, type);

    // Update UI
    populateTables();
  } catch (error) {
    console.error("Error adding stock:", error);
    alert("Terjadi kesalahan saat menambah stok. Silakan coba lagi.");
  }
}

// Function to reduce stock
async function reduceStock(category, type, quantity, reducer, notes) {
  try {
    // Ensure we have the latest data
    await fetchStockData();

    if (!stockData[category] || !stockData[category][type]) {
      alert("Kategori atau jenis barang tidak ditemukan.");
      return false;
    }

    const item = stockData[category][type];

    // Check if there's enough stock
    if (item.quantity < quantity) {
      alert(`Stok ${type} tidak mencukupi. Stok saat ini: ${item.quantity}`);
      return false;
    }

    // Update quantity
    item.quantity -= parseInt(quantity);
    item.lastUpdated = new Date().toISOString();

    // Add to history using the new function
    const historyEntry = {
      date: item.lastUpdated,
      action: "Kurang",
      quantity: quantity,
      reducer: reducer,
      notes: notes,
    };

    addHistoryEntry(item, historyEntry);

    // Update cache
    stockCache.set(category, stockData[category]);

    // Save to Firestore
    await saveData(category, type);

    // Update UI
    populateTables();
    return true;
  } catch (error) {
    console.error("Error reducing stock:", error);
    alert("Terjadi kesalahan saat mengurangi stok. Silakan coba lagi.");
    return false;
  }
}

// Setup real-time listener with improved cache invalidation
function setupRealtimeListener() {
  const stocksRef = collection(firestore, "stocks");

  const unsubscribe = onSnapshot(
    stocksRef,
    (snapshot) => {
      let hasChanges = false;

      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const categoryId = change.doc.id;
          const categoryData = change.doc.data();

          // Only update if we have this category in our cache
          if (stockData[categoryId]) {
            stockData[categoryId] = categoryData;
            stockCache.set(categoryId, categoryData);
            updateCacheTimestamp(categoryId);
            hasChanges = true;
          }
        }
      });

      // If we detected changes, update the UI
      if (hasChanges) {
        console.log("Real-time update detected, refreshing UI");
        updateSummaryTotals();

        // Only update tables if we're on the stock management page
        const tableContainer = document.querySelector(".table-container");
        if (tableContainer) {
          populateTables();
        }
      }
    },
    (error) => {
      console.error("Error in real-time listener:", error);
    }
  );

  // Store the unsubscribe function to clean up when needed
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });
}

// Force refresh function
async function forceRefreshData() {
  try {
    console.log("Force refreshing stock data...");

    // Clear cache
    stockCache.clear();
    stockCacheMeta.clear();
    localStorage.removeItem(CACHE_KEY);

    // Fetch fresh data
    await fetchStockData(true);

    // Update UI
    await populateTables();

    alert("Data stok berhasil diperbarui dari server.");
  } catch (error) {
    console.error("Error force refreshing data:", error);
    alert("Terjadi kesalahan saat memperbarui data. Silakan coba lagi.");
  }
}

// Event listeners for add stock forms
document.getElementById("simpan-tambah-brankas")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-brankas-tambah").value;
  const quantity = document.getElementById("jumlah-brankas-tambah").value;
  const adder = document.getElementById("penambah-brankas").value;
  const receiver = document.getElementById("penerima-brankas").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  addStock("brankas", type, quantity, adder, receiver);

  // Reset form and close modal
  document.getElementById("tambahStokBrankasForm").reset();
  bootstrap.Modal.getInstance(document.getElementById("tambahStokBrankasModal")).hide();
});

document.getElementById("simpan-tambah-admin")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-admin-tambah").value;
  const quantity = document.getElementById("jumlah-admin-tambah").value;
  const adder = document.getElementById("penambah-admin").value;
  const receiver = document.getElementById("penerima-admin").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  addStock("admin", type, quantity, adder, receiver);

  // Reset form and close modal
  document.getElementById("tambahStokAdminForm").reset();
  bootstrap.Modal.getInstance(document.getElementById("tambahStokAdminModal")).hide();
});

document.getElementById("simpan-tambah-rusak")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-rusak-tambah").value;
  const quantity = document.getElementById("jumlah-rusak-tambah").value;
  const adder = document.getElementById("penambah-rusak").value;
  const receiver = document.getElementById("penerima-rusak").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  addStock("barang-rusak", type, quantity, adder, receiver);

  // Reset form and close modal
  document.getElementById("tambahStokBarangRusakForm").reset();
  bootstrap.Modal.getInstance(document.getElementById("tambahStokBarangRusakModal")).hide();
});

document.getElementById("simpan-tambah-posting")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-posting-tambah").value;
  const quantity = document.getElementById("jumlah-posting-tambah").value;
  const adder = document.getElementById("penambah-posting").value;
  const receiver = document.getElementById("penerima-posting").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  addStock("posting", type, quantity, adder, receiver);

  // Reset form and close modal
  document.getElementById("tambahStokPostingForm").reset();
  bootstrap.Modal.getInstance(document.getElementById("tambahStokPostingModal")).hide();
});

// Event listener untuk tambah stok batu lepas
document.getElementById("simpan-tambah-batu")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-batu-tambah").value;
  const quantity = document.getElementById("jumlah-batu-tambah").value;
  const adder = document.getElementById("penambah-batu").value;
  const receiver = document.getElementById("penerima-batu").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  addStock("batu-lepas", type, quantity, adder, receiver);

  // Reset form and close modal
  document.getElementById("tambahStokBatuLepasForm").reset();
  bootstrap.Modal.getInstance(document.getElementById("tambahStokBatuLepasModal")).hide();
});

// Event listeners for reduce stock forms
document.getElementById("simpan-kurang-brankas")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-brankas-kurang").value;
  const quantity = document.getElementById("jumlah-brankas-kurang").value;
  const reducer = document.getElementById("pengurang-brankas").value;
  const notes = document.getElementById("keterangan-brankas").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  reduceStock("brankas", type, quantity, reducer, notes).then((success) => {
    if (success) {
      // Reset form and close modal
      document.getElementById("kurangiStokBrankasForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangiStokBrankasModal")).hide();
    }
  });
});

document.getElementById("simpan-kurang-admin")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-admin-kurang").value;
  const quantity = document.getElementById("jumlah-admin-kurang").value;
  const reducer = document.getElementById("pengurang-admin").value;
  const notes = document.getElementById("keterangan-admin").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  reduceStock("admin", type, quantity, reducer, notes).then((success) => {
    if (success) {
      // Reset form and close modal
      document.getElementById("kurangiStokAdminForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangiStokAdminModal")).hide();
    }
  });
});

document.getElementById("simpan-kurang-rusak")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-rusak-kurang").value;
  const quantity = document.getElementById("jumlah-rusak-kurang").value;
  const reducer = document.getElementById("pengurang-rusak").value;
  const notes = document.getElementById("keterangan-rusak").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  reduceStock("barang-rusak", type, quantity, reducer, notes).then((success) => {
    if (success) {
      // Reset form and close modal
      document.getElementById("kurangiStokBarangRusakForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangiStokBarangRusakModal")).hide();
    }
  });
});

document.getElementById("simpan-kurang-posting")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-posting-kurang").value;
  const quantity = document.getElementById("jumlah-posting-kurang").value;
  const reducer = document.getElementById("pengurang-posting").value;
  const notes = document.getElementById("keterangan-posting").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  reduceStock("posting", type, quantity, reducer, notes).then((success) => {
    if (success) {
      // Reset form and close modal
      document.getElementById("kurangiStokPostingForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangiStokPostingModal")).hide();
    }
  });
});

// Add event listener for Batu Lepas reduce stock
document.getElementById("simpan-kurang-batu")?.addEventListener("click", function () {
  const type = document.getElementById("jenis-barang-batu-kurang").value;
  const quantity = document.getElementById("jumlah-batu-kurang").value;
  const reducer = document.getElementById("pengurang-batu").value;
  const notes = document.getElementById("keterangan-batu").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  reduceStock("batu-lepas", type, quantity, reducer, notes).then((success) => {
    if (success) {
      // Reset form and close modal
      document.getElementById("kurangiStokBatuLepasForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangiStokBatuLepasModal")).hide();
    }
  });
});

document.getElementById("simpan-tambah-display")?.addEventListener("click", async function () {
  const type = document.getElementById("jenis-barang-display-tambah").value;
  const quantity = document.getElementById("jumlah-display-tambah").value;
  const adder = document.getElementById("penambah-display").value;
  const receiver = document.getElementById("penerima-display").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  try {
    await addStock("barang-display", type, quantity, adder, receiver);
    const form = document.getElementById("tambahStokDisplayForm");
    const modal = document.getElementById("tambahStokDisplayModal");
    if (form) form.reset();
    if (modal) {
      const modalInstance = bootstrap.Modal.getInstance(modal);
      if (modalInstance) modalInstance.hide();
      else new bootstrap.Modal(modal).hide();
    }
  } catch (error) {
    console.error("Error adding display stock:", error);
    alert("Terjadi kesalahan saat menambah stok display");
  }
});

document.getElementById("simpan-kurang-display")?.addEventListener("click", async function () {
  const type = document.getElementById("jenis-barang-display-kurang").value;
  const quantity = document.getElementById("jumlah-display-kurang").value;
  const reducer = document.getElementById("pengurang-display").value;
  const notes = document.getElementById("keterangan-display").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  try {
    const success = await reduceStock("barang-display", type, quantity, reducer, notes);
    if (success) {
      const form = document.getElementById("kurangiStokDisplayForm");
      const modal = document.getElementById("kurangiStokDisplayModal");
      if (form) form.reset();
      if (modal) {
        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) modalInstance.hide();
        else new bootstrap.Modal(modal).hide();
      }
    }
  } catch (error) {
    console.error("Error reducing display stock:", error);
    alert("Terjadi kesalahan saat mengurangi stok display");
  }
});

// Event listeners untuk Manual
document.getElementById("simpan-tambah-manual")?.addEventListener("click", async function () {
  const type = document.getElementById("jenis-barang-manual-tambah").value;
  const quantity = document.getElementById("jumlah-manual-tambah").value;
  const adder = document.getElementById("penambah-manual").value;
  const receiver = document.getElementById("penerima-manual").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  try {
    await addStock("manual", type, quantity, adder, receiver);
    const form = document.getElementById("tambahStokManualForm");
    const modal = document.getElementById("tambahStokManualModal");
    if (form) form.reset();
    if (modal) {
      const modalInstance = bootstrap.Modal.getInstance(modal);
      if (modalInstance) modalInstance.hide();
      else new bootstrap.Modal(modal).hide();
    }
  } catch (error) {
    console.error("Error adding manual stock:", error);
    alert("Terjadi kesalahan saat menambah stok manual");
  }
});

document.getElementById("simpan-kurang-manual")?.addEventListener("click", async function () {
  const type = document.getElementById("jenis-barang-manual-kurang").value;
  const quantity = document.getElementById("jumlah-manual-kurang").value;
  const reducer = document.getElementById("pengurang-manual").value;
  const notes = document.getElementById("keterangan-manual").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  try {
    const success = await reduceStock("manual", type, quantity, reducer, notes);
    if (success) {
      const form = document.getElementById("kurangiStokManualForm");
      const modal = document.getElementById("kurangiStokManualModal");
      if (form) form.reset();
      if (modal) {
        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) modalInstance.hide();
        else new bootstrap.Modal(modal).hide();
      }
    }
  } catch (error) {
    console.error("Error reducing manual stock:", error);
    alert("Terjadi kesalahan saat mengurangi stok manual");
  }
});

// Event listeners untuk Stok Komputer
document.getElementById("simpan-tambah-komputer")?.addEventListener("click", async function () {
  const type = document.getElementById("jenis-barang-komputer-tambah").value;
  const quantity = document.getElementById("jumlah-komputer-tambah").value;
  const adder = document.getElementById("penambah-komputer").value;
  const receiver = document.getElementById("penerima-komputer").value;

  if (!type || !quantity || !adder || !receiver) {
    alert("Semua field harus diisi!");
    return;
  }

  try {
    await addStock("stok-komputer", type, quantity, adder, receiver);
    const form = document.getElementById("tambahStokKomputerForm");
    const modal = document.getElementById("tambahStokKomputerModal");
    if (form) form.reset();
    if (modal) {
      const modalInstance = bootstrap.Modal.getInstance(modal);
      if (modalInstance) modalInstance.hide();
      else new bootstrap.Modal(modal).hide();
    }
  } catch (error) {
    console.error("Error adding computer stock:", error);
    alert("Terjadi kesalahan saat menambah stok komputer");
  }
});

document.getElementById("simpan-kurang-komputer")?.addEventListener("click", async function () {
  const type = document.getElementById("jenis-barang-komputer-kurang").value;
  const quantity = document.getElementById("jumlah-komputer-kurang").value;
  const reducer = document.getElementById("pengurang-komputer").value;
  const notes = document.getElementById("keterangan-komputer").value;

  if (!type || !quantity || !reducer || !notes) {
    alert("Semua field harus diisi!");
    return;
  }

  try {
    const success = await reduceStock("stok-komputer", type, quantity, reducer, notes);
    if (success) {
      const form = document.getElementById("kurangiStokKomputerForm");
      const modal = document.getElementById("kurangiStokKomputerModal");
      if (form) form.reset();
      if (modal) {
        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) modalInstance.hide();
        else new bootstrap.Modal(modal).hide();
      }
    }
  } catch (error) {
    console.error("Error reducing computer stock:", error);
    alert("Terjadi kesalahan saat mengurangi stok komputer");
  }
});

// Function to handle logout
function handleLogout() {
  // Clear session or perform logout actions
  window.location.href = "index.html";
}

// Handle "Lainnya" option for batu lepas
document.getElementById("jenis-batu-tambah")?.addEventListener("change", function () {
  const lainnyaContainer = document.getElementById("jenis-batu-lainnya-container");
  if (this.value === "LAINNYA") {
    lainnyaContainer.style.display = "block";
  } else {
    lainnyaContainer.style.display = "none";
  }
});

// Populate batu lepas dropdown for reduce stock
async function populateBatuLepasDropdown() {
  const dropdown = document.getElementById("jenis-batu-kurang");
  if (!dropdown) return;

  // Clear existing options except the first one
  while (dropdown.options.length > 1) {
    dropdown.remove(1);
  }

  // Ensure we have the latest data
  await fetchStockData();

  if (stockData["batu-lepas"]) {
    // Get all stone types with quantity > 0
    const stoneTypes = Object.keys(stockData["batu-lepas"]).filter(
      (type) => stockData["batu-lepas"][type].quantity > 0
    );

    // Add options to dropdown
    stoneTypes.forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = `${type} (${stockData["batu-lepas"][type].quantity})`;
      dropdown.appendChild(option);
    });
  }
}

// Schedule daily cleanup of old history with improved logic
function scheduleHistoryCleanup() {
  const lastCleanup = localStorage.getItem("lastHistoryCleanup");
  const today = new Date().toDateString();

  if (lastCleanup !== today) {
    console.log("Running scheduled history cleanup");

    if (Object.keys(stockData).length > 0) {
      cleanAndLimitHistory(stockData);

      // Update Firestore with cleaned data (batch update for efficiency)
      updateFirestoreWithCleanedData();

      // Mark as completed for today
      localStorage.setItem("lastHistoryCleanup", today);

      console.log(`History cleanup completed. Limited to ${MAX_HISTORY_RECORDS} records per item.`);
    }
  }
}

// Update Firestore with cleaned data - improved batch processing
async function updateFirestoreWithCleanedData() {
  try {
    if (Object.keys(stockData).length === 0) return;

    // Update each category with better error handling
    const updatePromises = Object.keys(stockData).map(async (category) => {
      try {
        const categoryRef = doc(firestore, "stocks", category);
        await updateDoc(categoryRef, stockData[category]);
        updateCacheTimestamp(category);
      } catch (error) {
        console.error(`Error updating category ${category}:`, error);
      }
    });

    await Promise.all(updatePromises);
    console.log("Cleaned and limited history entries in Firestore");
  } catch (error) {
    console.error("Error updating Firestore with cleaned data:", error);
  }
}

// Clear cache function
function clearStockCache() {
  stockCache.clear();
  stockCacheMeta.clear();
  localStorage.removeItem(CACHE_KEY);
  stockData = {};
  console.log("Stock cache cleared");
}

// Initialize when page loads
// Add event listeners for the new tabs
function setupNewTabEventListeners() {
  // Display Stock Add
  document.getElementById("simpan-tambah-display")?.addEventListener("click", function () {
    const type = document.getElementById("jenis-barang-display-tambah").value;
    const quantity = document.getElementById("jumlah-display-tambah").value;
    const adder = document.getElementById("penambah-display").value;
    const receiver = document.getElementById("penerima-display").value;

    if (!type || !quantity || !adder || !receiver) {
      alert("Semua field harus diisi");
      return;
    }

    addStock("barang-display", type, quantity, adder, receiver).then(() => {
      document.getElementById("tambahStokDisplayForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("tambahStokDisplayModal")).hide();
    });
  });

  // Display Stock Reduce
  document.getElementById("simpan-kurang-display")?.addEventListener("click", function () {
    const type = document.getElementById("jenis-barang-display-kurang").value;
    const quantity = document.getElementById("jumlah-display-kurang").value;
    const reducer = document.getElementById("pengurang-display").value;
    const notes = document.getElementById("keterangan-display").value;

    if (!type || !quantity || !reducer || !notes) {
      alert("Semua field harus diisi");
      return;
    }

    reduceStock("barang-display", type, quantity, reducer, notes).then(() => {
      document.getElementById("kurangStokDisplayForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangStokDisplayModal")).hide();
    });
  });

  // Manual Stock Add
  document.getElementById("simpan-tambah-manual")?.addEventListener("click", function () {
    const type = document.getElementById("jenis-barang-manual-tambah").value;
    const quantity = document.getElementById("jumlah-manual-tambah").value;
    const adder = document.getElementById("penambah-manual").value;
    const receiver = document.getElementById("penerima-manual").value;

    if (!type || !quantity || !adder || !receiver) {
      alert("Semua field harus diisi");
      return;
    }

    addStock("manual", type, quantity, adder, receiver).then(() => {
      document.getElementById("tambahStokManualForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("tambahStokManualModal")).hide();
    });
  });

  // Manual Stock Reduce
  document.getElementById("simpan-kurang-manual")?.addEventListener("click", function () {
    const type = document.getElementById("jenis-barang-manual-kurang").value;
    const quantity = document.getElementById("jumlah-manual-kurang").value;
    const reducer = document.getElementById("pengurang-manual").value;
    const notes = document.getElementById("keterangan-manual").value;

    if (!type || !quantity || !reducer || !notes) {
      alert("Semua field harus diisi");
      return;
    }

    reduceStock("manual", type, quantity, reducer, notes).then(() => {
      document.getElementById("kurangStokManualForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangStokManualModal")).hide();
    });
  });

  // Computer Stock Add
  document.getElementById("simpan-tambah-komputer")?.addEventListener("click", function () {
    const type = document.getElementById("jenis-barang-komputer-tambah").value;
    const quantity = document.getElementById("jumlah-komputer-tambah").value;
    const adder = document.getElementById("penambah-komputer").value;
    const receiver = document.getElementById("penerima-komputer").value;

    if (!type || !quantity || !adder || !receiver) {
      alert("Semua field harus diisi");
      return;
    }

    addStock("stok-komputer", type, quantity, adder, receiver).then(() => {
      document.getElementById("tambahStokKomputerForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("tambahStokKomputerModal")).hide();
    });
  });

  // Computer Stock Reduce
  document.getElementById("simpan-kurang-komputer")?.addEventListener("click", function () {
    const type = document.getElementById("jenis-barang-komputer-kurang").value;
    const quantity = document.getElementById("jumlah-komputer-kurang").value;
    const reducer = document.getElementById("pengurang-komputer").value;
    const notes = document.getElementById("keterangan-komputer").value;

    if (!type || !quantity || !reducer || !notes) {
      alert("Semua field harus diisi");
      return;
    }

    reduceStock("stok-komputer", type, quantity, reducer, notes).then(() => {
      document.getElementById("kurangStokKomputerForm").reset();
      bootstrap.Modal.getInstance(document.getElementById("kurangStokKomputerModal")).hide();
    });
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  // Initialize event listeners for new tabs
  setupNewTabEventListeners();
  try {
    // Initialize cache from localStorage
    initializeCache();

    // Show loading indicator
    const loadingIndicator = document.createElement("div");
    loadingIndicator.id = "stockLoadingIndicator";
    loadingIndicator.className = "text-center my-3";
    loadingIndicator.innerHTML = `
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Memuat data stok...</p>
        `;

    const mainContainer = document.querySelector(".container-fluid") || document.body;
    mainContainer.insertBefore(loadingIndicator, mainContainer.firstChild);

    // Populate tables with data (from cache or Firestore)
    await populateTables();

    // Populate batu lepas dropdown
    await populateBatuLepasDropdown();

    // Setup real-time listener for collaborative editing
    setupRealtimeListener();

    // Schedule cleanup of old history
    scheduleHistoryCleanup();

    // Remove loading indicator
    const indicator = document.getElementById("stockLoadingIndicator");
    if (indicator) {
      indicator.remove();
    }

    // Add event listener for refresh button if it exists
    const refreshBtn = document.getElementById("refresh-stock-data");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Memperbarui...';
        refreshBtn.disabled = true;

        try {
          await forceRefreshData();
        } finally {
          refreshBtn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Refresh Data';
          refreshBtn.disabled = false;
        }
      });
    } else {
      // Create refresh button if it doesn't exist
      const headerActions = document.querySelector(".card-header .d-flex");
      if (headerActions) {
        const refreshButton = document.createElement("button");
        refreshButton.id = "refresh-stock-data";
        refreshButton.className = "btn btn-outline-secondary ms-2";
        refreshButton.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Refresh Data';
        refreshButton.addEventListener("click", async () => {
          refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Memperbarui...';
          refreshButton.disabled = true;

          try {
            await forceRefreshData();
          } finally {
            refreshButton.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Refresh Data';
            refreshButton.disabled = false;
          }
        });
        headerActions.appendChild(refreshButton);
      }
    }

    // Add cache indicator
    const cacheIndicator = document.createElement("small");
    cacheIndicator.id = "stockCacheIndicator";
    cacheIndicator.className = "text-muted ms-2";
    cacheIndicator.style.display = "none";

    const headerTitle = document.querySelector(".card-header h5");
    if (headerTitle) {
      headerTitle.appendChild(cacheIndicator);
    }

    // Show cache status if using cached data
    const hasValidCache = categories.some((category) => isCacheValid(category));
    if (hasValidCache) {
      const oldestCacheTime = Math.min(
        ...categories.filter((category) => stockCacheMeta.has(category)).map((category) => stockCacheMeta.get(category))
      );

      if (oldestCacheTime) {
        const cacheTime = new Date(oldestCacheTime);
        const formattedTime = cacheTime.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });
        cacheIndicator.textContent = `(Cache: ${formattedTime})`;
        cacheIndicator.style.display = "inline";
      }
    }

    // Add info about history limits to the UI
    console.log(
      `Stock management initialized. History limited to ${MAX_HISTORY_RECORDS} records per item (no time restriction).`
    );
    console.log(`Cache TTL: ${CACHE_TTL_STANDARD / 1000}s standard, ${CACHE_TTL_REALTIME / 1000}s realtime`);
  } catch (error) {
    console.error("Error initializing stock management:", error);

    // Remove loading indicator
    const indicator = document.getElementById("stockLoadingIndicator");
    if (indicator) {
      indicator.remove();
    }

    // Show error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "alert alert-danger";
    errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle me-2"></i>
            Terjadi kesalahan saat memuat data stok. 
            <button class="btn btn-sm btn-outline-danger ms-2" onclick="location.reload()">
                <i class="fas fa-redo me-1"></i>Coba Lagi
            </button>
        `;

    const mainContainer = document.querySelector(".container-fluid") || document.body;
    mainContainer.insertBefore(errorDiv, mainContainer.firstChild);
  }
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  // Save current cache state
  updateCache();
});

// Periodic cache cleanup (every 30 minutes)
setInterval(() => {
  // Remove expired cache entries
  const now = Date.now();
  const expiredCategories = [];

  stockCacheMeta.forEach((timestamp, category) => {
    const age = now - timestamp;
    const ttl = ["brankas", "admin"].includes(category) ? CACHE_TTL_REALTIME : CACHE_TTL_STANDARD;

    if (age > ttl * 2) {
      // Remove if twice the TTL
      expiredCategories.push(category);
    }
  });

  expiredCategories.forEach((category) => {
    stockCache.delete(category);
    stockCacheMeta.delete(category);
    delete stockData[category];
  });

  if (expiredCategories.length > 0) {
    console.log(`Cleaned up expired cache for categories: ${expiredCategories.join(", ")}`);
    updateCache();
  }
}, 30 * 60 * 1000); // 30 minutes

// Export functions for testing or external use
export {
  fetchStockData,
  addStock,
  reduceStock,
  cleanAndLimitHistory,
  addHistoryEntry,
  forceRefreshData,
  clearStockCache,
  getCategoryKey,
};
