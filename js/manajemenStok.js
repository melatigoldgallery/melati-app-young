// Import Firebase modules
import { firestore } from "./configFirebase.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// === Konstanta dan Mapping ===
const mainCategories = ["KALUNG", "LIONTIN", "ANTING", "CINCIN", "HALA", "GELANG", "GIWANG"];
const subCategories = ["Stok Brankas", "Belum Posting", "Display", "Rusak", "Batu Lepas", "Manual", "Admin"];
const summaryCategories = ["brankas", "posting", "barang-display", "barang-rusak", "batu-lepas", "manual", "admin"];

// Jenis perhiasan khusus untuk HALA
const halaJewelryTypes = ["KA", "LA", "AN", "CA", "SA", "GA"];
const halaJewelryMapping = {
  "KA": "Kalung",
  "LA": "Liontin", 
  "AN": "Anting",
  "CA": "Cincin",
  "SA": "Giwang",
  "GA": "Gelang"
};
const categoryMapping = {
  "Stok Brankas": "brankas",
  "Belum Posting": "posting",
  Display: "barang-display",
  Rusak: "barang-rusak",
  "Batu Lepas": "batu-lepas",
  Manual: "manual",
  Admin: "admin",
};

// Mapping terbalik untuk display nama kategori
const reverseCategoryMapping = {
  brankas: "Stok Brankas",
  posting: "Belum Posting",
  "barang-display": "Display",
  "barang-rusak": "Rusak",
  "batu-lepas": "Batu Lepas",
  manual: "Manual",
  admin: "Admin",
};
const mainCategoryToId = {
  KALUNG: "kalung-table-body",
  LIONTIN: "liontin-table-body",
  ANTING: "anting-table-body",
  CINCIN: "cincin-table-body",
  HALA: "hala-table-body",
  GELANG: "gelang-table-body",
  GIWANG: "giwang-table-body",
};
const statusCardId = {
  KALUNG: "label-jenis-KALUNG",
  LIONTIN: "label-jenis-LIONTIN",
  ANTING: "label-jenis-ANTING",
  CINCIN: "label-jenis-CINCIN",
  HALA: "label-jenis-HALA",
  GELANG: "label-jenis-GELANG",
  GIWANG: "label-jenis-GIWANG",
};
const totalCardId = {
  KALUNG: "total-kalung",
  LIONTIN: "total-liontin",
  ANTING: "total-anting",
  CINCIN: "total-cincin",
  HALA: "total-hala",
  GELANG: "total-gelang",
  GIWANG: "total-giwang",
};

// === Cache Management ===
let stockData = {};
const CACHE_KEY = "stockDataCache";
const CACHE_TTL = 5 * 60 * 1000; // 5 menit
const stockCache = new Map();
const stockCacheMeta = new Map();

function initializeCache() {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      stockData = parsedData.data || {};
      if (parsedData.meta) {
        Object.entries(parsedData.meta).forEach(([key, timestamp]) => {
          stockCacheMeta.set(key, timestamp);
        });
      }
      Object.entries(stockData).forEach(([category, data]) => {
        stockCache.set(category, data);
      });
    }
  } catch {
    localStorage.removeItem(CACHE_KEY);
    stockCache.clear();
    stockCacheMeta.clear();
  }
}
function updateCache() {
  try {
    const cacheData = {
      timestamp: Date.now(),
      data: stockData,
      meta: Object.fromEntries(stockCacheMeta),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}
function isCacheValid(category) {
  const timestamp = stockCacheMeta.get(category);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL;
}

// === Firestore Fetch/Save ===
async function fetchStockData(forceRefresh = false) {
  const categories = [
    "brankas",
    "posting",
    "barang-display",
    "barang-rusak",
    "batu-lepas",
    "manual",
    "admin",
    "stok-komputer",
  ];
  try {
    if (!forceRefresh && Object.keys(stockData).length > 0 && categories.every(isCacheValid)) {
      return stockData;
    }
    const fetchPromises = categories.map(async (category) => {
      const categoryRef = doc(firestore, "stocks", category);
      const categoryDoc = await getDoc(categoryRef);
      let categoryData = {};
      if (categoryDoc.exists()) {
        categoryData = categoryDoc.data();
      } else {
        // Inisialisasi kosong per mainCategories
        mainCategories.forEach((mc) => {
          categoryData[mc] = {
            quantity: 0,
            lastUpdated: null,
            history: [],
          };
        });
        await setDoc(categoryRef, categoryData);
      }
      
      // Inisialisasi khusus untuk HALA di semua kategori
      if (categoryData.HALA) {
        initializeHalaStructure(categoryData, "HALA");
        // Update quantity total untuk HALA
        categoryData.HALA.quantity = calculateHalaTotal(categoryData, "HALA");
      }
      
      stockData[category] = categoryData;
      stockCache.set(category, categoryData);
      stockCacheMeta.set(category, Date.now());
      return { category, data: categoryData };
    });
    await Promise.all(fetchPromises);
    updateCache();
    return stockData;
  } catch (error) {
    console.error("Error fetching stock data:", error);
    if (Object.keys(stockData).length > 0) {
      return stockData;
    }
    throw error;
  }
}
async function saveData(category, type) {
  try {
    const categoryRef = doc(firestore, "stocks", category);
    const updateData = {};
    updateData[type] = stockData[category][type];
    await updateDoc(categoryRef, updateData);
    stockCacheMeta.set(category, Date.now());
    updateCache();
  } catch (error) {
    // Try create
    try {
      await setDoc(doc(firestore, "stocks", category), stockData[category]);
      stockCacheMeta.set(category, Date.now());
      updateCache();
    } catch (e) {
      alert("Gagal simpan data stok. Silakan coba lagi.");
    }
  }
}

// === Helper ===
function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}
function getCategoryKey(subCategory) {
  return categoryMapping[subCategory] || "";
}

// === Fungsi khusus untuk HALA ===
function initializeHalaStructure(categoryData, mainCat) {
  if (!categoryData[mainCat]) {
    categoryData[mainCat] = {
      quantity: 0,
      lastUpdated: null,
      history: [],
      details: {}
    };
  }
  
  // Inisialisasi detail untuk setiap jenis perhiasan jika belum ada
  if (!categoryData[mainCat].details) {
    categoryData[mainCat].details = {};
  }
  
  halaJewelryTypes.forEach(type => {
    if (!categoryData[mainCat].details[type]) {
      categoryData[mainCat].details[type] = 0;
    }
  });
  
  return categoryData[mainCat];
}

function calculateHalaTotal(categoryData, mainCat) {
  if (!categoryData[mainCat] || !categoryData[mainCat].details) {
    return 0;
  }
  
  let total = 0;
  halaJewelryTypes.forEach(type => {
    total += parseInt(categoryData[mainCat].details[type] || 0);
  });
  
  return total;
}

// --- Tambahan fungsi untuk populate stok komputer
function populateStokKomputerTable() {
  const tbody = document.getElementById("stok-komputer-table-body");
  if (!tbody || !stockData["stok-komputer"]) return;
  tbody.innerHTML = "";
  mainCategories.forEach((mainCat, idx) => {
    const item = stockData["stok-komputer"][mainCat] || { quantity: 0, lastUpdated: null };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${mainCat}</td>
      <td class="text-center">${item.quantity}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-primary edit-komputer-btn" data-main="${mainCat}"><i class="fas fa-edit"></i> Update</button>
      </td>
      <td class="text-center text-muted small">${formatDate(item.lastUpdated)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// === Populate Table (FIXED) ===
export async function populateTables() {
  try {
    // CSS pelindung (disuntik sekali)
    injectDropdownFixCssOnce();

    // Tampilkan skeleton/loading khusus tabel
    showTableLoading();

    // Ambil data stok (gunakan cache jika valid)
    await fetchStockData();

    // Render setiap main category
    mainCategories.forEach((mainCat) => {
      const tbody = document.getElementById(mainCategoryToId[mainCat]);
      if (!tbody) return;

      // pastikan kontainer tabel tidak memotong dropdown
      tbody.style.overflow = "visible";

      tbody.innerHTML = "";

      subCategories.forEach((subCat, idx) => {
        const categoryKey = getCategoryKey(subCat);
        const stockItem =
          stockData[categoryKey] && stockData[categoryKey][mainCat]
            ? stockData[categoryKey][mainCat]
            : { quantity: 0, lastUpdated: null, history: [] };

        // Kondisi untuk menampilkan tombol Update
        const showUpdateButton = subCat === "Display" || subCat === "Manual" || subCat === "Admin";

        const tr = document.createElement("tr");

        // Kolom aksi
        const actionColumn = showUpdateButton
          ? `
            <td class="text-center">
              <button class="btn btn-success btn-sm update-stock-btn"
                      data-main="${mainCat}"
                      data-category="${categoryKey}"
                      data-subcategory="${subCat}">
                <i class="fas fa-edit"></i> Update
              </button>
            </td>
          `
          : `
            <td class="text-center">
              <div class="dropdown position-relative">
                <button class="btn btn-secondary btn-sm dropdown-toggle" type="button"
                        data-bs-toggle="dropdown"
                        data-bs-display="static"
                        data-bs-boundary="viewport">
                  <i class="fas fa-cog"></i> Aksi
                </button>
                <ul class="dropdown-menu shadow" style="z-index: 2000;">
                  <li>
                    <a class="dropdown-item add-stock-btn" href="#"
                       data-main="${mainCat}" data-category="${categoryKey}">
                       <i class="fas fa-plus"></i> Tambah
                    </a>
                  </li>
                  <li>
                    <a class="dropdown-item reduce-stock-btn" href="#"
                       data-main="${mainCat}" data-category="${categoryKey}">
                       <i class="fas fa-minus"></i> Kurangi
                    </a>
                  </li>
                </ul>
              </div>
            </td>
          `;

        tr.innerHTML = `
          <td class="fw-bold">${idx + 1}</td>
          <td class="fw-medium jenis-column">${subCat} ${mainCat === "HALA" ? `<button class="btn btn-outline-primary btn-sm detail-hala-btn btn-hala" data-main="${mainCat}" data-category="${categoryKey}" title="Detail HALA"><i class="fas fa-eye"></i></button>` : ''}</td>
          <td class="text-center">
            <span class="badge bg-primary fs-6 px-3 py-2">${stockItem.quantity}</span>
          </td>
          ${actionColumn}
          <td class="text-center">
            <button class="btn btn-info btn-sm show-history-btn"
                    data-main="${mainCat}"
                    data-category="${categoryKey}"
                    title="Lihat Riwayat">
              <i class="fas fa-history"></i>
            </button>
          </td>
          <td class="text-center text-muted small">${formatDate(stockItem.lastUpdated)}</td>
        `;

        // Animasi masuk: opacity saja (tanpa transform → tidak bikin stacking context)
        tr.style.opacity = "0";
        tr.style.transition = "opacity .25s ease";
        tbody.appendChild(tr);
        requestAnimationFrame(() => {
          tr.style.opacity = "1";
        });
      });
    });

    // Tabel stok komputer & ringkasan
    populateStokKomputerTable();
    updateSummaryTotals();

    // Listener sekali untuk mengangkat z-index baris yang dropdown-nya dibuka
    if (!populateTables._dropdownRowElevatorBound) {
      document.body.addEventListener("shown.bs.dropdown", (ev) => {
        const row = ev.target.closest("tr");
        if (row) {
          row.style.position = "relative";
          row.style.zIndex = "3000"; // di atas baris lain & card
        }
      });
      document.body.addEventListener("hidden.bs.dropdown", (ev) => {
        const row = ev.target.closest("tr");
        if (row) {
          row.style.zIndex = "";
          row.style.position = "";
        }
      });
      populateTables._dropdownRowElevatorBound = true;
    }

    // Sembunyikan loading + notifikasi
    hideTableLoading();
    showSuccessNotification("Data berhasil dimuat");
  } catch (error) {
    console.error("Error populating tables (fixed):", error);
    hideTableLoading();
    showErrorMessage("Gagal memuat data tabel");
  }

  // ---- helper local: inject CSS sekali ---
  function injectDropdownFixCssOnce() {
    if (document.getElementById("dropdown-fix-css")) return;
    const style = document.createElement("style");
    style.id = "dropdown-fix-css";
    style.textContent = `
      /* cegah menu terpotong / ketiban */
      .table, .table-container, .tab-pane, .card, .card-body, .content-wrapper {
        overflow: visible !important;
      }
      .table .dropdown { position: relative; }
      .table .dropdown-menu { z-index: 2000 !important; }
    `;
    document.head.appendChild(style);
  }
}

function showTableLoading() {
  mainCategories.forEach(mainCat => {
    const tbody = document.getElementById(mainCategoryToId[mainCat]);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4">
            <div class="loading-spinner mx-auto mb-2"></div>
            <small class="text-muted">Memuat data...</small>
          </td>
        </tr>
      `;
    }
  });
}

function hideTableLoading() {
  // Tables will be populated by populateTables function
}

function showSuccessNotification(message) {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'toast-notification success';
  toast.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `;
  
  // Add toast styles if not exists
  if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        font-weight: 500;
      }
      .toast-notification.success {
        border-left: 4px solid #28a745;
        color: #28a745;
      }
      .toast-notification.error {
        border-left: 4px solid #dc3545;
        color: #dc3545;
      }
      .toast-notification.show {
        transform: translateX(0);
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Hide toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Handler edit komputer
let komputerEditMainCat = "";

document.body.addEventListener("click", function (e) {
  if (e.target.classList.contains("edit-komputer-btn")) {
    komputerEditMainCat = e.target.dataset.main;
    document.getElementById("updateKomputerJumlah").value =
      stockData["stok-komputer"][komputerEditMainCat]?.quantity || 0;
    document.getElementById("updateKomputerJenis").value = komputerEditMainCat;
    $("#modalUpdateKomputer").modal("show");
  }
});

document.getElementById("formUpdateKomputer").onsubmit = async function (e) {
  e.preventDefault();
  const jumlah = document.getElementById("updateKomputerJumlah").value;
  const jenis = document.getElementById("updateKomputerJenis").value;
  if (!jumlah || !jenis) {
    alert("Semua field harus diisi.");
    return;
  }
  await updateStokKomputer(jenis, jumlah);
  $("#modalUpdateKomputer").modal("hide");
};

async function updateStokKomputer(jenis, jumlah) {
  await fetchStockData();
  if (!stockData["stok-komputer"]) return;
  if (!stockData["stok-komputer"][jenis]) {
    stockData["stok-komputer"][jenis] = { quantity: 0, lastUpdated: null, history: [] };
  }
  stockData["stok-komputer"][jenis].quantity = parseInt(jumlah);
  stockData["stok-komputer"][jenis].lastUpdated = new Date().toISOString();
  await saveData("stok-komputer", jenis);
  await populateTables();
}

// === Update Stok Display/Manual ===
async function updateStokDisplayManual(category, mainCat, newQuantity, petugas) {
  await fetchStockData();
  if (!stockData[category] || !stockData[category][mainCat]) {
    // Inisialisasi jika belum ada
    if (!stockData[category]) stockData[category] = {};
    stockData[category][mainCat] = { quantity: 0, lastUpdated: null, history: [] };
  }

  const item = stockData[category][mainCat];
  const oldQuantity = item.quantity;
  const newQty = parseInt(newQuantity);

  // Update quantity
  item.quantity = newQty;
  item.lastUpdated = new Date().toISOString();

  // Determine action type
  let actionType, quantityDiff;
  if (newQty > oldQuantity) {
    actionType = "Update (Tambah)";
    quantityDiff = newQty - oldQuantity;
  } else if (newQty < oldQuantity) {
    actionType = "Update (Kurangi)";
    quantityDiff = oldQuantity - newQty;
  } else {
    actionType = "Update (Tetap)";
    quantityDiff = 0;
  }

  // Add to history
  item.history.unshift({
    date: item.lastUpdated,
    action: actionType,
    quantity: quantityDiff,
    oldQuantity: oldQuantity,
    newQuantity: newQty,
    petugas
  });

  // Keep only last 10 records
  if (item.history.length > 10) item.history = item.history.slice(0, 10);

  await saveData(category, mainCat);
  await populateTables();
}

// === Update Status Ringkasan ===
function updateSummaryTotals() {
  mainCategories.forEach((mainCat) => {
    let total = 0;
    summaryCategories.forEach((cat) => {
      if (stockData[cat] && stockData[cat][mainCat]) total += parseInt(stockData[cat][mainCat].quantity) || 0;
    });
    let komputer = 0;
    if (stockData["stok-komputer"] && stockData["stok-komputer"][mainCat])
      komputer = parseInt(stockData["stok-komputer"][mainCat].quantity) || 0;
    
    // Update DOM
    const totalEl = document.getElementById(totalCardId[mainCat]);
    const statusEl = document.getElementById(statusCardId[mainCat]);
    
    if (totalEl) {
      // Add animated number counting effect
      animateNumberChange(totalEl, total);
      
      // Add status badge and styling
      if (total === komputer) {
        totalEl.className = "number text-success";
        if (statusEl) {
          statusEl.innerHTML = `<i class="fas fa-check-circle me-1"></i>Sesuai Sistem (klop)`;
          statusEl.className = "text-dark fw-bold";
        }
      } else if (total < komputer) {
        totalEl.className = "number text-danger";
        if (statusEl) {
          statusEl.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>Kurang ${komputer - total}`;
          statusEl.className = "text-dark fw-bold";
        }
      } else {
        totalEl.className = "number text-primary";
        if (statusEl) {
          statusEl.innerHTML = `<i class="fas fa-arrow-up me-1"></i>Lebih ${total - komputer}`;
          statusEl.className = "text-dark fw-bold";
        }
      }
    }
  });
}

function animateNumberChange(element, newValue) {
  element.textContent = newValue; // langsung update angka tanpa animasi
}

// === Add/Reduce Stock Universal Handler ===
async function addStock(category, mainCat, quantity, adder) {
  await fetchStockData();
  if (!stockData[category] || !stockData[category][mainCat]) return;
  const item = stockData[category][mainCat];
  item.quantity += parseInt(quantity);
  item.lastUpdated = new Date().toISOString();
  item.history.unshift({
    date: item.lastUpdated,
    action: "Tambah",
    quantity: parseInt(quantity),
    adder,
  });
  if (item.history.length > 10) item.history = item.history.slice(0, 10);
  await saveData(category, mainCat);
  await populateTables();
}
async function reduceStock(category, mainCat, quantity, pengurang, keterangan) {
  await fetchStockData();
  if (!stockData[category] || !stockData[category][mainCat]) return false;
  const item = stockData[category][mainCat];
  if (item.quantity < quantity) {
    alert("Stok tidak cukup.");
    return false;
  }
  item.quantity -= parseInt(quantity);
  item.lastUpdated = new Date().toISOString();
  item.history.unshift({
    date: item.lastUpdated,
    action: "Kurangi",
    quantity: parseInt(quantity),
    pengurang,
    keterangan,
  });
  if (item.history.length > 10) item.history = item.history.slice(0, 10);
  await saveData(category, mainCat);
  await populateTables();
  return true;
}

// === Fungsi untuk menampilkan detail HALA ===
function showHalaDetail(category, mainCat) {
  const modal = new bootstrap.Modal(document.getElementById("modalDetailHala"));
  const tbody = document.getElementById("hala-detail-table-body");
  const totalEl = document.getElementById("hala-detail-total");
  
  tbody.innerHTML = "";
  
  if (!stockData[category] || !stockData[category][mainCat] || !stockData[category][mainCat].details) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Tidak ada data detail</td></tr>`;
    totalEl.textContent = "0";
    return modal.show();
  }
  
  const details = stockData[category][mainCat].details;
  let total = 0;
  
  halaJewelryTypes.forEach((type, index) => {
    const quantity = parseInt(details[type] || 0);
    total += quantity;
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${halaJewelryMapping[type]}</td>
      <td><span class="badge bg-primary">${type}</span></td>
      <td class="text-center"><strong>${quantity}</strong></td>
    `;
    tbody.appendChild(tr);
  });
  
  totalEl.textContent = total;
  
  // Update modal title dengan kategori
  document.getElementById("modalDetailHalaLabel").textContent = `Detail Stok ${mainCat} - ${reverseCategoryMapping[category]}`;
  
  modal.show();
}

// === Fungsi untuk menambah/kurangi stok HALA ===
async function addStockHala(category, mainCat, jewelryType, quantity, adder) {
  try {
    await fetchStockData();
    
    // Pastikan struktur category ada
    if (!stockData[category]) {
      stockData[category] = {};
    }
    
    // Inisialisasi struktur HALA jika belum ada
    if (!stockData[category][mainCat]) {
      stockData[category][mainCat] = {
        quantity: 0,
        lastUpdated: null,
        history: [],
        details: {}
      };
    }
    
    const item = stockData[category][mainCat];
    
    // Pastikan details ada dan semua jenis perhiasan diinisialisasi
    if (!item.details) {
      item.details = {};
    }
    
    // Inisialisasi semua jenis perhiasan jika belum ada
    halaJewelryTypes.forEach(type => {
      if (!item.details[type]) {
        item.details[type] = 0;
      }
    });
    
    // Tambah stok untuk jenis perhiasan spesifik
    item.details[jewelryType] += parseInt(quantity);
  
  // Update total quantity
  item.quantity = calculateHalaTotal(stockData[category], mainCat);
  item.lastUpdated = new Date().toISOString();
  
  // Tambah history
  item.history.unshift({
    date: item.lastUpdated,
    action: "Tambah",
    quantity: parseInt(quantity),
    jewelryType: jewelryType,
    jewelryName: halaJewelryMapping[jewelryType],
    adder,
  });
  
  if (item.history.length > 10) item.history = item.history.slice(0, 10);
  
  await saveData(category, mainCat);
  await populateTables();
  } catch (error) {
    console.error("Error in addStockHala:", error);
    alert("Terjadi kesalahan saat menambah stok HALA. Silakan coba lagi.");
    throw error;
  }
}

async function reduceStockHala(category, mainCat, jewelryType, quantity, pengurang, keterangan) {
  try {
    await fetchStockData();
  
  // Pastikan struktur category ada
  if (!stockData[category]) {
    stockData[category] = {};
  }
  
  // Inisialisasi struktur HALA jika belum ada
  if (!stockData[category][mainCat]) {
    initializeHalaStructure(stockData[category], mainCat);
  }
  
  const item = stockData[category][mainCat];
  
  // Pastikan details ada
  if (!item.details) {
    item.details = {};
    halaJewelryTypes.forEach(type => {
      item.details[type] = 0;
    });
  }
  
  const currentJewelryStock = parseInt(item.details[jewelryType] || 0);
  
  if (currentJewelryStock < quantity) {
    alert(`Stok ${halaJewelryMapping[jewelryType]} (${jewelryType}) tidak cukup. Stok saat ini: ${currentJewelryStock}`);
    return false;
  }
  
  // Kurangi stok untuk jenis perhiasan spesifik
  item.details[jewelryType] -= parseInt(quantity);
  
  // Update total quantity
  item.quantity = calculateHalaTotal(stockData[category], mainCat);
  item.lastUpdated = new Date().toISOString();
  
  // Tambah history
  item.history.unshift({
    date: item.lastUpdated,
    action: "Kurangi",
    quantity: parseInt(quantity),
    jewelryType: jewelryType,
    jewelryName: halaJewelryMapping[jewelryType],
    pengurang,
    keterangan,
  });
  
  if (item.history.length > 10) item.history = item.history.slice(0, 10);
  
  await saveData(category, mainCat);
  await populateTables();
  return true;
  } catch (error) {
    console.error("Error in reduceStockHala:", error);
    alert("Terjadi kesalahan saat mengurangi stok HALA. Silakan coba lagi.");
    return false;
  }
}

document.body.addEventListener("click", function (e) {
  if (e.target.classList.contains("show-history-btn") || e.target.closest(".show-history-btn")) {
    // Mendukung klik icon di dalam button
    const btn = e.target.classList.contains("show-history-btn") ? e.target : e.target.closest(".show-history-btn");
    const mainCat = btn.dataset.main;
    const categoryKey = btn.dataset.category;
    showHistoryModal(categoryKey, mainCat);
  }
});

function showHistoryModal(category, mainCat) {
  const modal = new bootstrap.Modal(document.getElementById("modalRiwayat"));
  const titleEl = document.getElementById("riwayat-title");
  const tbody = document.getElementById("riwayat-table-body");
  const info = document.getElementById("riwayat-info");
  titleEl.textContent = `(${mainCat} - ${category})`;
  tbody.innerHTML = "";
  info.textContent = "";

  if (
    !stockData[category] ||
    !stockData[category][mainCat] ||
    !stockData[category][mainCat].history ||
    stockData[category][mainCat].history.length === 0
  ) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Tidak ada riwayat</td></tr>`;
    return modal.show();
  }

  const history = stockData[category][mainCat].history.slice(0, 10);
  history.forEach((record, i) => {
    const tr = document.createElement("tr");

    // Determine action badge color and text
    let actionBadge;
    if (record.action === "Tambah") {
      actionBadge = '<span class="badge bg-success">Tambah</span>';
    } else if (record.action === "Kurangi") {
      actionBadge = '<span class="badge bg-danger">Kurangi</span>';
    } else if (record.action.includes("Update")) {
      if (record.action.includes("Tambah")) {
        actionBadge = '<span class="badge bg-info">Update (+)</span>';
      } else if (record.action.includes("Kurangi")) {
        actionBadge = '<span class="badge bg-warning">Update (-)</span>';
      } else {
        actionBadge = '<span class="badge bg-secondary">Update</span>';
      }
    } else {
      actionBadge = `<span class="badge bg-primary">${record.action}</span>`;
    }

    // Handle quantity display for update actions
    let quantityDisplay;
    if (record.oldQuantity !== undefined && record.newQuantity !== undefined) {
      quantityDisplay = `<small>${record.oldQuantity} → ${record.newQuantity}</small><br><span class="badge bg-primary">${record.quantity}</span>`;
    } else {
      quantityDisplay = `<span class="badge bg-primary">${record.quantity}</span>`;
    }
    
    // Tambahan info untuk HALA
    let jewelryInfo = "";
    if (record.jewelryType && record.jewelryName) {
      jewelryInfo = `<br><small class="text-muted">${record.jewelryName} (${record.jewelryType})</small>`;
    }

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${formatDate(record.date)}</td>
      <td>${actionBadge}${jewelryInfo}</td>
      <td>${quantityDisplay}</td>
      <td>${record.adder || record.pengurang || record.petugas || "-"}</td>
      <td>${record.keterangan || record.receiver || "-"}</td>
    `;
    tbody.appendChild(tr);
  });

  if (stockData[category][mainCat].history.length > 10) {
    info.textContent = "Menampilkan 10 riwayat terbaru. Riwayat lama dihapus otomatis.";
  }
  modal.show();
}

// === Event Delegation Untuk Tombol Tambah/Kurangi di Tabel ===
let currentMainCat = "";
let currentCategory = "";

document.body.addEventListener("click", function (e) {
  // Tambah stok HALA (khusus)
  if (e.target.classList.contains("add-stock-btn") && e.target.dataset.main === "HALA") {
    e.preventDefault();
    currentMainCat = e.target.dataset.main;
    currentCategory = e.target.dataset.category;

    // Reset form HALA
    document.getElementById("formTambahStokHala").reset();

    // Set jenis barang otomatis berdasarkan kategori
    const jenisDisplay = `${currentMainCat} - ${reverseCategoryMapping[currentCategory] || currentCategory}`;
    document.getElementById("jenisTambahHalaDisplay").value = jenisDisplay;
    document.getElementById("jenisTambahHala").value = currentCategory;

    // Update modal title
    document.getElementById("modalTambahStokHalaLabel").textContent = `Tambah Stok ${jenisDisplay}`;

    $("#modalTambahStokHala").modal("show");
    return;
  }
  
  // Kurangi stok HALA (khusus)
  if (e.target.classList.contains("reduce-stock-btn") && e.target.dataset.main === "HALA") {
    e.preventDefault();
    currentMainCat = e.target.dataset.main;
    currentCategory = e.target.dataset.category;

    // Reset form HALA
    document.getElementById("formKurangiStokHala").reset();

    // Set jenis barang otomatis berdasarkan kategori
    const jenisDisplay = `${currentMainCat} - ${reverseCategoryMapping[currentCategory] || currentCategory}`;
    document.getElementById("jenisKurangiHalaDisplay").value = jenisDisplay;
    document.getElementById("jenisKurangiHala").value = currentCategory;

    // Update modal title
    document.getElementById("modalKurangiStokHalaLabel").textContent = `Kurangi Stok ${jenisDisplay}`;

    $("#modalKurangiStokHala").modal("show");
    return;
  }
  
  // Detail HALA
  if (e.target.classList.contains("detail-hala-btn") || e.target.closest(".detail-hala-btn")) {
    e.preventDefault();
    const btn = e.target.classList.contains("detail-hala-btn") ? e.target : e.target.closest(".detail-hala-btn");
    const mainCat = btn.dataset.main;
    const categoryKey = btn.dataset.category;
    showHalaDetail(categoryKey, mainCat);
    return;
  }
  
  // Tambah stok (umum, bukan HALA)
  if (e.target.classList.contains("add-stock-btn")) {
    e.preventDefault();
    currentMainCat = e.target.dataset.main;
    currentCategory = e.target.dataset.category;

    // Reset form
    document.getElementById("formTambahStok").reset();

    // Set jenis barang otomatis berdasarkan kategori
    const jenisDisplay = `${currentMainCat} - ${reverseCategoryMapping[currentCategory] || currentCategory}`;
    document.getElementById("jenisTambahDisplay").value = jenisDisplay;
    document.getElementById("jenisTambah").value = currentCategory;

    // Update modal title
    document.getElementById("modalTambahStokLabel").textContent = `Tambah Stok ${jenisDisplay}`;

    $("#modalTambahStok").modal("show");
  }
  // Kurangi stok (umum, bukan HALA)
  if (e.target.classList.contains("reduce-stock-btn")) {
    e.preventDefault();
    currentMainCat = e.target.dataset.main;
    currentCategory = e.target.dataset.category;

    // Reset form
    document.getElementById("formKurangiStok").reset();

    // Set jenis barang otomatis berdasarkan kategori
    const jenisDisplay = `${currentMainCat} - ${reverseCategoryMapping[currentCategory] || currentCategory}`;
    document.getElementById("jenisKurangiDisplay").value = jenisDisplay;
    document.getElementById("jenisKurangi").value = currentCategory;

    // Update modal title
    document.getElementById("modalKurangiStokLabel").textContent = `Kurangi Stok ${jenisDisplay}`;

    $("#modalKurangiStok").modal("show");
  }
  // Update stok Display/Manual
  if (e.target.classList.contains("update-stock-btn") || e.target.closest(".update-stock-btn")) {
    e.preventDefault();
    const btn = e.target.classList.contains("update-stock-btn") ? e.target : e.target.closest(".update-stock-btn");
    const mainCat = btn.dataset.main;
    const categoryKey = btn.dataset.category;
    const subCategory = btn.dataset.subcategory;

    // Populate modal with current data
    const stockItem =
      stockData[categoryKey] && stockData[categoryKey][mainCat] ? stockData[categoryKey][mainCat] : { quantity: 0 };

    document.getElementById("updateStokMainCat").value = mainCat;
    document.getElementById("updateStokCategory").value = categoryKey;
    document.getElementById("updateStokJenis").value = `${mainCat} - ${subCategory}`;
    document.getElementById("updateStokJumlah").value = stockItem.quantity;
    document.getElementById("updateStokPetugas").value = "";

    $("#modalUpdateStok").modal("show");
  }
});

// === Handler Submit Modal Tambah/Kurang ===
document.getElementById("formTambahStok").onsubmit = async function (e) {
  e.preventDefault();
  const jumlah = document.getElementById("jumlahTambah").value;
  const penambah = document.getElementById("penambahStok").value;
  if (!jumlah || !penambah || !currentCategory || !currentMainCat) {
    alert("Semua field harus diisi.");
    return;
  }
  await addStock(currentCategory, currentMainCat, jumlah, penambah);
  $("#modalTambahStok").modal("hide");
};

document.getElementById("formKurangiStok").onsubmit = async function (e) {
  e.preventDefault();
  const jumlah = document.getElementById("jumlahKurangi").value;
  const pengurang = document.getElementById("pengurangStok").value;
  const keterangan = document.getElementById("keteranganKurangi").value;
  if (!jumlah || !pengurang || !currentCategory || !currentMainCat) {
    alert("Semua field harus diisi.");
    return;
  }
  await reduceStock(currentCategory, currentMainCat, jumlah, pengurang, keterangan);
  $("#modalKurangiStok").modal("hide");
};

// === Handler Submit Modal HALA ===
document.getElementById("formTambahStokHala").onsubmit = async function (e) {
  e.preventDefault();
  
  const submitBtn = this.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  try {
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    
    const jumlah = document.getElementById("jumlahTambahHala").value;
    const penambah = document.getElementById("penambahStokHala").value;
    const jewelryType = document.getElementById("jenisPerhiasanTambah").value;
    
    if (!jumlah || !penambah || !currentCategory || !currentMainCat || !jewelryType) {
      throw new Error("Semua field harus diisi.");
    }
    
    await addStockHala(currentCategory, currentMainCat, jewelryType, jumlah, penambah);
    
    // Success feedback
    showSuccessNotification(`Berhasil menambah ${jumlah} stok ${halaJewelryMapping[jewelryType]} (${jewelryType})`);
    
    $("#modalTambahStokHala").modal("hide");
  } catch (error) {
    console.error("Error submitting tambah stok HALA:", error);
    showErrorNotification(error.message || "Gagal menambah stok HALA");
  } finally {
    // Reset button state
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

document.getElementById("formKurangiStokHala").onsubmit = async function (e) {
  e.preventDefault();
  
  const submitBtn = this.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  try {
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    
    const jumlah = document.getElementById("jumlahKurangiHala").value;
    const pengurang = document.getElementById("pengurangStokHala").value;
    const keterangan = document.getElementById("keteranganKurangiHala").value;
    const jewelryType = document.getElementById("jenisPerhiasanKurangi").value;
    
    if (!jumlah || !pengurang || !currentCategory || !currentMainCat || !jewelryType) {
      throw new Error("Semua field harus diisi.");
    }
    
    const success = await reduceStockHala(currentCategory, currentMainCat, jewelryType, jumlah, pengurang);
    
    if (success) {
      // Success feedback
      showSuccessNotification(`Berhasil mengurangi ${jumlah} stok ${halaJewelryMapping[jewelryType]} (${jewelryType})`);
      $("#modalKurangiStokHala").modal("hide");
    }
  } catch (error) {
    console.error("Error submitting kurangi stok HALA:", error);
    showErrorNotification(error.message || "Gagal mengurangi stok HALA");
  } finally {
    // Reset button state
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};

function showErrorNotification(message) {
  // Create error toast notification
  const toast = document.createElement('div');
  toast.className = 'toast-notification error';
  toast.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Hide toast after 4 seconds (longer for errors)
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// === Handler Submit Modal Update Stok Display/Manual ===
document.getElementById("formUpdateStok").onsubmit = async function (e) {
  e.preventDefault();
  const mainCat = document.getElementById("updateStokMainCat").value;
  const category = document.getElementById("updateStokCategory").value;
  const jumlah = document.getElementById("updateStokJumlah").value;
  const petugas = document.getElementById("updateStokPetugas").value;

  if (!mainCat || !category || jumlah === "" || !petugas) {
    alert("Semua field yang wajib harus diisi.");
    return;
  }

  await updateStokDisplayManual(category, mainCat, jumlah, petugas);
  $("#modalUpdateStok").modal("hide");
};

// === Real-time listener (optional) ===
function setupRealtimeListener() {
  const stocksRef = collection(firestore, "stocks");
  return onSnapshot(stocksRef, (snapshot) => {
    let updated = false;
    snapshot.docChanges().forEach((change) => {
      const cat = change.doc.id;
      if (stockData[cat]) {
        stockData[cat] = change.doc.data();
        stockCache.set(cat, stockData[cat]);
        stockCacheMeta.set(cat, Date.now());
        updated = true;
      }
    });
    if (updated) {
      populateTables();
    }
  });
}

// === INIT ===
document.addEventListener("DOMContentLoaded", async function () {
  // Show loading state
  showLoadingState();
  
  try {
    initializeCache();
    await populateTables();
    setupRealtimeListener();
    
    // Initialize tooltips and smooth transitions
    initializeUIEnhancements();
    
    // Hide loading state
    hideLoadingState();
  } catch (error) {
    console.error("Error initializing:", error);
    hideLoadingState();
    showErrorMessage("Gagal memuat data. Silakan refresh halaman.");
  }
});

// === UI Enhancement Functions ===
function showLoadingState() {
  // Add loading overlay to main content
  const mainContent = document.querySelector('.content-wrapper');
  if (mainContent && !mainContent.querySelector('.loading-overlay')) {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
    mainContent.style.position = 'relative';
    mainContent.appendChild(loadingOverlay);
  }
}

function hideLoadingState() {
  const loadingOverlay = document.querySelector('.loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.remove();
  }
}

function showErrorMessage(message) {
  // You can integrate with SweetAlert2 or show a toast notification
  alert(message);
}

function initializeUIEnhancements() {
  // Add smooth transitions when switching tabs
  const tabLinks = document.querySelectorAll('.nav-link');
  tabLinks.forEach(link => {
    link.addEventListener('click', function() {
      // Add loading state for tab content
      const targetId = this.getAttribute('data-bs-target');
      if (targetId) {
        const targetTab = document.querySelector(targetId);
        if (targetTab) {
          targetTab.style.opacity = '0.7';
          setTimeout(() => {
            targetTab.style.opacity = '1';
          }, 200);
        }
      }
    });
  });

  // Add hover effects for buttons
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(button => {
    button.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
    });
    
    button.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
    });
  });
}
  
  // Reset on hide
  document.addEventListener('hide.bs.dropdown', function(event) {
    const dropdownMenu = event.target.nextElementSibling;
    if (dropdownMenu && dropdownMenu.classList.contains('dropdown-menu')) {
      // Reset styles
      dropdownMenu.style.position = '';
      dropdownMenu.style.left = '';
      dropdownMenu.style.top = '';
      dropdownMenu.style.minWidth = '';
    }
  });
  
  // Handle window resize
  window.addEventListener('resize', function() {
    const openDropdowns = document.querySelectorAll('.dropdown-menu.show');
    openDropdowns.forEach(menu => {
      const toggle = menu.previousElementSibling;
      if (toggle) {
        const rect = toggle.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 5) + 'px';
      }
    });
  });

