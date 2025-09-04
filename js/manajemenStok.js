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
// Tidak ada lagi kategori ekstra terpisah; semua dianggap utama dengan tab
const extraSummaryMainCategories = []; // dibiarkan kosong agar tidak double loop
const subCategories = [
  "Stok Brankas",
  "Belum Posting",
  "Display",
  "Rusak",
  "Batu Lepas",
  "Manual",
  "Admin",
  "DP",
  "Contoh Custom",
];
// Tambah 'contoh-custom' agar ikut dimuat & (opsional) dihitung dalam ringkasan
const summaryCategories = [
  "brankas",
  "posting",
  "barang-display",
  "barang-rusak",
  "batu-lepas",
  "manual",
  "admin",
  "DP",
  "contoh-custom",
];

// Jenis perhiasan khusus untuk HALA
const halaJewelryTypes = ["KA", "LA", "AN", "CA", "SA", "GA"];
const halaJewelryMapping = {
  KA: "Kalung",
  LA: "Liontin",
  AN: "Anting",
  CA: "Cincin",
  SA: "Giwang",
  GA: "Gelang",
};
const categoryMapping = {
  "Stok Brankas": "brankas",
  "Belum Posting": "posting",
  Display: "barang-display",
  Rusak: "barang-rusak",
  "Batu Lepas": "batu-lepas",
  Manual: "manual",
  Admin: "admin",
  DP: "DP",
  "Contoh Custom": "contoh-custom",
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
  DP: "DP",
  "contoh-custom": "Contoh Custom",
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
    "DP",
    "contoh-custom",
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

      // Inisialisasi khusus untuk HALA (kecuali untuk kategori 'stok-komputer')
      // Agar nilai HALA pada stok-komputer tidak di-reset menjadi 0
      if (category !== "stok-komputer" && categoryData.HALA) {
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
// Hapus nilai undefined secara rekursif (Firestore tidak menerima undefined)
function sanitizeForFirestore(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map((v) => sanitizeForFirestore(v));
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === undefined) return; // skip undefined field
      out[k] = sanitizeForFirestore(v);
    });
    return out;
  }
  return value;
}

async function saveData(category, type) {
  try {
    const categoryRef = doc(firestore, "stocks", category);
    const updateData = {};
    updateData[type] = sanitizeForFirestore(stockData[category][type]);
    // Gunakan merge agar aman untuk create/update dan tidak menimpa field lain
    await setDoc(categoryRef, updateData, { merge: true });
    stockCacheMeta.set(category, Date.now());
    updateCache();
  } catch (e) {
    console.error("Error saving data:", e);
    throw e;
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
      details: {},
    };
  }

  // Inisialisasi detail untuk setiap jenis perhiasan jika belum ada
  if (!categoryData[mainCat].details) {
    categoryData[mainCat].details = {};
  }

  halaJewelryTypes.forEach((type) => {
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
  halaJewelryTypes.forEach((type) => {
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

        const tr = document.createElement("tr");

        // Untuk HALA dan KENDARI: tampilkan tombol Update multi-jenis pada baris tertentu
        const halaUpdateSubcats = ["Display", "Rusak", "Batu Lepas", "Manual", "Admin", "DP", "Contoh Custom"];
        let actionColumn = "";
        if (mainCat === "HALA" && halaUpdateSubcats.includes(subCat)) {
          actionColumn = `
            <td class="text-center">
              <button class="btn btn-success btn-sm update-hala-btn"
                      data-main="${mainCat}"
                      data-category="${categoryKey}"
                      data-subcategory="${subCat}">
                <i class="fas fa-edit"></i> Update
              </button>
            </td>
          `;
        } else {
          // Kondisi untuk menampilkan tombol Update pada tab lain (sebelumnya)
          // Tambahkan pengecualian untuk KALUNG agar baris Rusak, Batu Lepas, Contoh Custom juga menjadi Update
          const halaLikeUpdateMains = ["KALUNG", "LIONTIN", "ANTING", "CINCIN", "GELANG", "GIWANG"];
          const showUpdateButton =
            (subCat === "Display" ||
              subCat === "Manual" ||
              subCat === "Admin" ||
              (halaLikeUpdateMains.includes(mainCat) &&
                (subCat === "Rusak" || subCat === "Batu Lepas" || subCat === "Contoh Custom" || subCat === "DP"))) &&
            mainCat !== "HALA";

          actionColumn = showUpdateButton
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
        }

        tr.innerHTML = `
          <td class="fw-bold">${idx + 1}</td>
          <td class="fw-medium jenis-column">${subCat} ${
          mainCat === "HALA"
            ? `<button class="btn btn-outline-primary btn-sm detail-hala-btn btn-hala" data-main="${mainCat}" data-category="${categoryKey}" title="Detail ${mainCat}"><i class="fas fa-eye"></i></button>
              `
            : ""
        }</td>
          <td class="text-center">
            <span class="badge bg-success fs-6 px-2 py-2">${stockItem.quantity}</span>
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
  mainCategories.forEach((mainCat) => {
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
  const toast = document.createElement("div");
  toast.className = "toast-notification success";
  toast.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `;

  // Add toast styles if not exists
  if (!document.querySelector("#toast-styles")) {
    const style = document.createElement("style");
    style.id = "toast-styles";
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
  setTimeout(() => toast.classList.add("show"), 100);

  // Hide toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Handler edit komputer
let komputerEditMainCat = "";

document.body.addEventListener("click", function (e) {
  if (e.target.classList.contains("edit-komputer-btn") || e.target.closest(".edit-komputer-btn")) {
    const btn = e.target.classList.contains("edit-komputer-btn") ? e.target : e.target.closest(".edit-komputer-btn");
    if (!btn) return;
    komputerEditMainCat = btn.dataset.main;
    document.getElementById("updateKomputerJumlah").value =
      stockData["stok-komputer"][komputerEditMainCat]?.quantity || 0;
    document.getElementById("updateKomputerJenis").value = komputerEditMainCat;
    // Show modal using Bootstrap 5 API
    const modalEl = document.getElementById("modalUpdateKomputer");
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
  // Tutup modal lebih dulu agar UI responsif (Bootstrap 5 API)
  const modalEl = document.getElementById("modalUpdateKomputer");
  const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modalInstance.hide();
  try {
    await updateStokKomputer(jenis, jumlah);
  } catch (err) {
    showErrorNotification("Gagal menyimpan stok komputer");
  }
};

async function updateStokKomputer(jenis, jumlah) {
  await fetchStockData();
  // Jangan keluar; inisialisasi struktur jika belum ada
  if (!stockData["stok-komputer"]) stockData["stok-komputer"] = {};
  if (!stockData["stok-komputer"][jenis]) {
    stockData["stok-komputer"][jenis] = { quantity: 0, lastUpdated: null, history: [] };
  }
  const parsed = parseInt(jumlah, 10);
  stockData["stok-komputer"][jenis].quantity = isNaN(parsed) ? 0 : parsed;
  stockData["stok-komputer"][jenis].lastUpdated = new Date().toISOString();
  await saveData("stok-komputer", jenis);
  // Refresh from server to ensure latest persisted data reflected immediately
  await fetchStockData(true);
  await populateTables();
}

// === Update Stok Display/Manual ===
async function updateStokDisplayManual(category, mainCat, newQuantity, petugas, keterangan = "") {
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

  // Add to history (hindari undefined untuk Firestore)
  const historyEntry = {
    date: item.lastUpdated,
    action: actionType,
    quantity: quantityDiff,
    oldQuantity: oldQuantity,
    newQuantity: newQty,
    petugas,
  };
  if (keterangan && keterangan.trim() !== "") {
    historyEntry.keterangan = keterangan.trim();
  }
  item.history.unshift(historyEntry);

  // Keep only last 10 records
  if (item.history.length > 10) item.history = item.history.slice(0, 10);

  await saveData(category, mainCat);
  await fetchStockData(true);
  await populateTables();
}

// === Update Status Ringkasan ===
function updateSummaryTotals() {
  const allSummary = [...mainCategories, ...extraSummaryMainCategories];
  allSummary.forEach((mainCat) => {
    let total = 0;
    summaryCategories.forEach((cat) => {
      if (stockData[cat] && stockData[cat][mainCat]) total += parseInt(stockData[cat][mainCat].quantity) || 0;
    });
    let komputer = 0;
    if (stockData["stok-komputer"] && stockData["stok-komputer"][mainCat]) {
      komputer = parseInt(stockData["stok-komputer"][mainCat].quantity) || 0;
    }

    const totalEl = document.getElementById(totalCardId[mainCat]);
    const statusEl = document.getElementById(statusCardId[mainCat]);
    if (!totalEl) return; // skip jika kartu tidak ada di DOM

    animateNumberChange(totalEl, total);

    if (total === komputer) {
      totalEl.className = "number text-success";
      if (statusEl) {
        statusEl.innerHTML = `<i class="fas fa-check-circle me-1"></i>klop`;
        statusEl.className = "text-dark fw-bold";
      }
    } else if (total < komputer) {
      totalEl.className = "number text-danger";
      if (statusEl) {
        statusEl.innerHTML = `<i class=\"fas fa-exclamation-triangle me-1\"></i>Kurang ${komputer - total}`;
        statusEl.className = "text-dark fw-bold";
      }
    } else {
      totalEl.className = "number text-primary";
      if (statusEl) {
        statusEl.innerHTML = `<i class=\"fas fa-arrow-up me-1\"></i>Lebih ${total - komputer}`;
        statusEl.className = "text-dark fw-bold";
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
  // Inisialisasi struktur jika belum ada (memungkinkan kategori baru seperti 'contoh-custom')
  if (!stockData[category]) {
    stockData[category] = {};
  }
  if (!stockData[category][mainCat]) {
    stockData[category][mainCat] = { quantity: 0, lastUpdated: null, history: [] };
  }
  const item = stockData[category][mainCat];
  item.quantity += parseInt(quantity) || 0;
  item.lastUpdated = new Date().toISOString();
  item.history.unshift({
    date: item.lastUpdated,
    action: "Tambah",
    quantity: parseInt(quantity) || 0,
    adder,
  });
  if (item.history.length > 10) item.history = item.history.slice(0, 10);
  await saveData(category, mainCat);
  await fetchStockData(true);
  await populateTables();
}
async function reduceStock(category, mainCat, quantity, pengurang, keterangan) {
  await fetchStockData();
  if (!stockData[category]) {
    alert("Kategori belum ada data.");
    return false;
  }
  if (!stockData[category][mainCat]) {
    alert("Belum ada stok untuk dikurangi.");
    return false;
  }
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
  document.getElementById(
    "modalDetailHalaLabel"
  ).textContent = `Detail Stok ${mainCat} - ${reverseCategoryMapping[category]}`;

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
        details: {},
      };
    }

    const item = stockData[category][mainCat];

    // Pastikan details ada dan semua jenis perhiasan diinisialisasi
    if (!item.details) {
      item.details = {};
    }

    // Inisialisasi semua jenis perhiasan jika belum ada
    halaJewelryTypes.forEach((type) => {
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
    await fetchStockData(true);
    await populateTables();
  } catch (error) {
    console.error("Error in addStockHala:", error);
    alert("Terjadi kesalahan saat menambah stok HALA. Silakan coba lagi.");
    throw error;
  }
}

// Bulk tambah stok HALA (satu entri history)
async function addStockHalaBulk(category, mainCat, items, adder) {
  try {
    await fetchStockData();
    if (!stockData[category]) stockData[category] = {};
    if (!stockData[category][mainCat]) {
      stockData[category][mainCat] = { quantity: 0, lastUpdated: null, history: [], details: {} };
    }
    const item = stockData[category][mainCat];
    if (!item.details) item.details = {};
    halaJewelryTypes.forEach((t) => {
      if (item.details[t] === undefined) item.details[t] = 0;
    });
    let totalAdded = 0;
    items.forEach(({ type, qty }) => {
      item.details[type] += qty;
      totalAdded += qty;
    });
    item.quantity = calculateHalaTotal(stockData[category], mainCat);
    item.lastUpdated = new Date().toISOString();
    item.history.unshift({
      date: item.lastUpdated,
      action: "Tambah",
      quantity: totalAdded,
      adder,
      items: items.map((it) => ({
        jewelryType: it.type,
        jewelryName: halaJewelryMapping[it.type],
        quantity: it.qty,
      })),
    });
    if (item.history.length > 10) item.history = item.history.slice(0, 10);
    await saveData(category, mainCat);
    await fetchStockData(true);
    await populateTables();
  } catch (e) {
    console.error("Error bulk add HALA", e);
    throw e;
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
      halaJewelryTypes.forEach((type) => {
        item.details[type] = 0;
      });
    }

    const currentJewelryStock = parseInt(item.details[jewelryType] || 0);

    if (currentJewelryStock < quantity) {
      alert(
        `Stok ${halaJewelryMapping[jewelryType]} (${jewelryType}) tidak cukup. Stok saat ini: ${currentJewelryStock}`
      );
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
    await fetchStockData(true);
    await populateTables();
    return true;
  } catch (error) {
    console.error("Error in reduceStockHala:", error);
    alert("Terjadi kesalahan saat mengurangi stok HALA. Silakan coba lagi.");
    return false;
  }
}

// Bulk reduce HALA (mirroring bulk add style: one history entry with items array)
async function reduceStockHalaBulk(category, mainCat, items, pengurang, keterangan) {
  try {
    await fetchStockData();
    if (!stockData[category]) stockData[category] = {};
    if (!stockData[category][mainCat]) {
      // initialize structure if missing
      initializeHalaStructure(stockData[category], mainCat);
    }
    const item = stockData[category][mainCat];
    if (!item.details) {
      item.details = {};
      halaJewelryTypes.forEach((t) => (item.details[t] = 0));
    }
    // Validate all first (no partial updates)
    const insufficient = [];
    items.forEach(({ type, qty }) => {
      const cur = parseInt(item.details[type] || 0);
      if (qty > cur) insufficient.push({ type, name: halaJewelryMapping[type], requested: qty, current: cur });
    });
    if (insufficient.length) {
      const msg = insufficient
        .map((it) => `${it.name} (${it.type}) diminta ${it.requested}, stok ${it.current}`)
        .join("; ");
      throw new Error("Stok tidak cukup: " + msg);
    }
    let totalReduced = 0;
    items.forEach(({ type, qty }) => {
      item.details[type] -= qty;
      totalReduced += qty;
    });
    item.quantity = calculateHalaTotal(stockData[category], mainCat);
    item.lastUpdated = new Date().toISOString();
    item.history.unshift({
      date: item.lastUpdated,
      action: "Kurangi",
      quantity: totalReduced,
      pengurang,
      keterangan,
      items: items.map((it) => ({
        jewelryType: it.type,
        jewelryName: halaJewelryMapping[it.type],
        quantity: it.qty,
      })),
    });
    if (item.history.length > 10) item.history = item.history.slice(0, 10);
    await saveData(category, mainCat);
    await populateTables();
    return true;
  } catch (e) {
    console.error("Error bulk reduce HALA", e);
    throw e;
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
    if (record.action === "Tambah" || record.action === "Tambah") {
      actionBadge = `<span class="badge bg-success">${record.action}</span>`;
    } else if (record.action === "Kurangi" || record.action === "Kurangi") {
      actionBadge = `<span class="badge bg-danger">${record.action}</span>`;
    } else if (record.action.includes("Update")) {
      if (record.action.includes("Tambah")) {
        actionBadge = '<span class="badge bg-success">Update (+)</span>';
      } else if (record.action.includes("Kurangi")) {
        actionBadge = '<span class="badge bg-danger">Update (-)</span>';
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

    // Tambahan info untuk HALA (single atau bulk)
    let jewelryInfo = "";
    if (record.items && Array.isArray(record.items)) {
      const list = record.items
        .map(
          (it) =>
            `<span class=\"badge bg-light text-dark border me-1 mb-1\">${it.jewelryName} (${it.jewelryType}): <strong>${it.quantity}</strong></span>`
        )
        .join(" ");
      jewelryInfo = `<br><div class=\"mt-1 d-flex flex-wrap\" style=\"gap:4px;\">${list}</div>`;
    } else if (record.jewelryType && record.jewelryName) {
      jewelryInfo = `<br><small class=\"text-muted\">${record.jewelryName} (${record.jewelryType})</small>`;
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

    // Reset form HALA bulk
    const bulkForm = document.getElementById("formTambahStokHalaBulk");
    if (bulkForm) bulkForm.reset();
    document.querySelectorAll(".hala-qty-input").forEach((inp) => {
      inp.value = "";
    });

    // Set jenis barang otomatis berdasarkan kategori
    const jenisDisplay = `${currentMainCat} - ${reverseCategoryMapping[currentCategory] || currentCategory}`;
    document.getElementById("jenisTambahHalaDisplay").value = jenisDisplay;
    document.getElementById("jenisTambahHala").value = currentCategory;

    // Update modal title
    document.getElementById("modalTambahStokHalaLabel").textContent = `Tambah Stok ${jenisDisplay}`;

    // Pastikan struktur details tersedia untuk HALA agar input bisa menampilkan stok kini jika diperlukan
    (async () => {
      try {
        await fetchStockData();
        if (!stockData[currentCategory]) stockData[currentCategory] = {};
        initializeHalaStructure(stockData[currentCategory], currentMainCat);
      } catch (err) {
        /* ignore */
      }
    })();

    $("#modalTambahStokHala").modal("show");
    return;
  }

  // Kurangi stok HALA (khusus) — juga untuk KENDARI pada kategori brankas/posting
  if (e.target.classList.contains("reduce-stock-btn") && e.target.dataset.main === "HALA") {
    e.preventDefault();
    currentMainCat = e.target.dataset.main;
    currentCategory = e.target.dataset.category;
    // Reset bulk reduce form
    const bulkReduceForm = document.getElementById("formKurangiStokHalaBulk");
    if (bulkReduceForm) bulkReduceForm.reset();
    document.querySelectorAll(".hala-reduce-qty-input").forEach((inp) => (inp.value = ""));
    // Populate current stock numbers for each type
    (async () => {
      try {
        await fetchStockData();
        const jenisDisplay = `${currentMainCat} - ${reverseCategoryMapping[currentCategory] || currentCategory}`;
        document.getElementById("jenisKurangiHalaDisplay").value = jenisDisplay;
        document.getElementById("jenisKurangiHala").value = currentCategory;
        document.getElementById("modalKurangiStokHalaLabel").textContent = `Kurangi Stok ${jenisDisplay}`;
        const item = stockData[currentCategory] && stockData[currentCategory][currentMainCat];
        // Ensure details exist before reading
        if (!item || !item.details) {
          // try initialize so spans show 0
          if (stockData[currentCategory]) initializeHalaStructure(stockData[currentCategory], currentMainCat);
        }
        halaJewelryTypes.forEach((t) => {
          const span = document.querySelector(`.current-stock[data-type="${t}"]`);
          if (span)
            span.textContent =
              stockData[currentCategory] &&
              stockData[currentCategory][currentMainCat] &&
              stockData[currentCategory][currentMainCat].details
                ? stockData[currentCategory][currentMainCat].details[t] || 0
                : 0;
        });
        $("#modalKurangiStokHala").modal("show");
      } catch (err) {
        showErrorNotification("Gagal memuat stok HALA.");
      }
    })();
    return;
  }

  // Detail HALA
  if (e.target.classList.contains("detail-hala-btn") || e.target.closest(".detail-hala-btn")) {
    e.preventDefault();
    const btn = e.target.classList.contains("detail-hala-btn") ? e.target : e.target.closest(".detail-hala-btn");
    const mainCat = btn.dataset.main;
    const categoryKey = btn.dataset.category;
    // Ensure HALA-like detail structure exists for KENDARI as well
    (async () => {
      try {
        await fetchStockData();
        if (!stockData[categoryKey]) stockData[categoryKey] = {};
        initializeHalaStructure(stockData[categoryKey], mainCat);
      } catch (err) {
        // ignore init errors, show modal may still handle missing data
      }
      showHalaDetail(categoryKey, mainCat);
    })();
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
    // Toggle visibility/requirement of Nama Staf based on subCategory
    const formUpdate = document.getElementById("formUpdateStok");
    const petugasInput = document.getElementById("updateStokPetugas");
    if (petugasInput) {
      // Categories where Nama Staf is NOT used for Update
      const noStaffSubcats = ["Display", "Rusak", "Batu Lepas", "Manual", "Admin", "DP", "Contoh Custom"];
      const requirePetugas = !noStaffSubcats.includes(subCategory);
      if (formUpdate) formUpdate.dataset.requirePetugas = requirePetugas ? "1" : "0";
      // Find a reasonable wrapper to hide (form-group/mb-3/form-floating) and fallback to parent
      const wrapper =
        petugasInput.closest(".mb-3") ||
        petugasInput.closest(".form-group") ||
        petugasInput.closest(".form-floating") ||
        petugasInput.parentElement;
      if (wrapper) wrapper.classList.toggle("d-none", !requirePetugas);
      petugasInput.required = requirePetugas;
      if (!requirePetugas) petugasInput.value = ""; // clear when not needed
    }
    // Always reset petugas value when opening
    if (document.getElementById("updateStokPetugas")) document.getElementById("updateStokPetugas").value = "";
    const ketFieldUpdate = document.querySelector("#modalUpdateStok #keteranganKurangi");
    if (ketFieldUpdate) ketFieldUpdate.value = "";

    // Use Bootstrap 5 API to show modal (replaces jQuery .modal('show'))
    const modalEl = document.getElementById("modalUpdateStok");
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
  $("#modalTambahStok").modal("hide");
  try {
    await addStock(currentCategory, currentMainCat, jumlah, penambah);
  } catch (err) {
    showErrorNotification("Gagal menambah stok");
  }
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
  $("#modalKurangiStok").modal("hide");
  try {
    await reduceStock(currentCategory, currentMainCat, jumlah, pengurang, keterangan);
  } catch (err) {
    showErrorNotification("Gagal mengurangi stok");
  }
};

// === Handler Submit Modal HALA (Bulk) ===
const formTambahStokHalaBulk = document.getElementById("formTambahStokHalaBulk");
if (formTambahStokHalaBulk) {
  formTambahStokHalaBulk.onsubmit = async function (e) {
    e.preventDefault();
    const submitBtn = document.getElementById("submitBulkHalaBtn");
    const originalText = submitBtn ? submitBtn.innerHTML : "";
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
      }
      const adder = document.getElementById("penambahStokHalaBulk").value.trim();
      if (!adder || !currentCategory || !currentMainCat) throw new Error("Data belum lengkap");
      const inputs = Array.from(document.querySelectorAll(".hala-qty-input"));
      const items = inputs
        .map((inp) => ({ type: inp.dataset.type, qty: parseInt(inp.value || "0") }))
        .filter((it) => it.qty > 0);
      if (items.length === 0) throw new Error("Isi minimal satu jumlah > 0");
      $("#modalTambahStokHala").modal("hide");
      await addStockHalaBulk(currentCategory, currentMainCat, items, adder);
      showSuccessNotification(
        `Berhasil menambah ${items.length} jenis (total ${items.reduce((a, b) => a + b.qty, 0)})`
      );
    } catch (err) {
      console.error("Bulk HALA error", err);
      showErrorNotification(err.message || "Gagal simpan bulk HALA");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  };
  const resetBtn = document.getElementById("resetBulkHalaBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      document.querySelectorAll(".hala-qty-input").forEach((i) => (i.value = ""));
    });
  }
}

const formBulkReduce = document.getElementById("formKurangiStokHalaBulk");
if (formBulkReduce) {
  formBulkReduce.onsubmit = async function (e) {
    e.preventDefault();
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
      const pengurang = document.getElementById("pengurangStokHalaBulk").value;
      const keterangan = document.getElementById("keteranganKurangiHalaBulk").value;
      if (!pengurang || !currentCategory || !currentMainCat) throw new Error("Data belum lengkap");
      const inputs = Array.from(document.querySelectorAll(".hala-reduce-qty-input"));
      const items = inputs
        .map((inp) => ({ type: inp.dataset.type, qty: parseInt(inp.value || "0") }))
        .filter((it) => it.qty > 0);
      if (items.length === 0) throw new Error("Isi minimal satu jumlah > 0");
      $("#modalKurangiStokHala").modal("hide");
      const success = await reduceStockHalaBulk(currentCategory, currentMainCat, items, pengurang, keterangan);
      if (success) {
        showSuccessNotification(
          `Berhasil mengurangi ${items.length} jenis (total ${items.reduce((a, b) => a + b.qty, 0)})`
        );
      }
    } catch (err) {
      console.error("Bulk reduce HALA error", err);
      showErrorNotification(err.message || "Gagal simpan bulk kurangi HALA");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  };
  const resetReduceBtn = document.getElementById("resetBulkKurangiHalaBtn");
  if (resetReduceBtn) {
    resetReduceBtn.addEventListener("click", () => {
      document.querySelectorAll(".hala-reduce-qty-input").forEach((i) => (i.value = ""));
    });
  }
}

function showErrorNotification(message) {
  // Create error toast notification
  const toast = document.createElement("div");
  toast.className = "toast-notification error";
  toast.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  // Show toast
  setTimeout(() => toast.classList.add("show"), 100);

  // Hide toast after 4 seconds (longer for errors)
  setTimeout(() => {
    toast.classList.remove("show");
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
  const keterangan = this.querySelector("#keteranganKurangi")?.value?.trim() || "";

  // Determine whether petugas is required for this submission
  const requirePetugasFlag = this.dataset.requirePetugas === "1";
  if (!mainCat || !category || jumlah === "" || (requirePetugasFlag && !petugas)) {
    alert("Semua field yang wajib harus diisi.");
    return;
  }

  // Close modal first for better UX and to ensure it always closes in BS5
  const modalEl = document.getElementById("modalUpdateStok");
  const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modalInstance.hide();

  await updateStokDisplayManual(category, mainCat, jumlah, petugas, keterangan);
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

// === Handler Update HALA (baris -> buka modal, isi nilai, submit untuk update multi jenis) ===
document.body.addEventListener("click", async function (e) {
  if (e.target.classList.contains("update-hala-btn") || e.target.closest(".update-hala-btn")) {
    const btn = e.target.classList.contains("update-hala-btn") ? e.target : e.target.closest(".update-hala-btn");
    currentMainCat = btn.dataset.main; // should be 'HALA'
    currentCategory = btn.dataset.category;

    // Ambil data saat ini dan isi input pada modal Update HALA
    try {
      await fetchStockData();
      const item =
        stockData[currentCategory] && stockData[currentCategory][currentMainCat]
          ? stockData[currentCategory][currentMainCat]
          : { details: {} };
      // Isi current-stock span dan input value pada modalUpdateStokHala
      halaJewelryTypes.forEach((t) => {
        const span = document.querySelector(`#modalUpdateStokHala .current-stock[data-type="${t}"]`);
        const input = document.querySelector(`#modalUpdateStokHala .hala-update-qty-input[data-type="${t}"]`);
        if (span) span.textContent = item.details && item.details[t] !== undefined ? item.details[t] : 0;
        if (input) input.value = item.details && item.details[t] !== undefined ? item.details[t] : "";
      });

      const jenisDisplay = `${currentMainCat} - ${reverseCategoryMapping[currentCategory] || currentCategory}`;
      document.getElementById("jenisUpdateHalaDisplay").value = jenisDisplay;
      document.getElementById("jenisUpdateHala").value = currentCategory;
      document.getElementById("modalUpdateStokHalaLabel").textContent = `Update Stok ${jenisDisplay}`;

      // Tampilkan/sembunyikan field Nama Staf khusus HALA:
      // - Wajib & tampil untuk 'brankas' dan 'posting'
      // - Disembunyikan untuk kategori lain (barang-display, barang-rusak, batu-lepas, manual, admin, DP, contoh-custom)
      const requirePetugas = currentCategory === "brankas" || currentCategory === "posting";
      const formEl = document.getElementById("formUpdateStokHalaBulk");
      if (formEl) formEl.dataset.requirePetugas = requirePetugas ? "1" : "0";
      const petugasInputHala = document.getElementById("petugasUpdateStokHalaBulk");
      if (petugasInputHala) {
        const wrapper =
          petugasInputHala.closest(".mb-3") ||
          petugasInputHala.closest(".form-group") ||
          petugasInputHala.closest(".form-floating") ||
          petugasInputHala.parentElement;
        if (wrapper) wrapper.classList.toggle("d-none", !requirePetugas);
        petugasInputHala.required = requirePetugas;
        if (!requirePetugas) petugasInputHala.value = ""; // bersihkan saat tidak diperlukan
      }

      $("#modalUpdateStokHala").modal("show");
    } catch (err) {
      console.error("Gagal buka modal update HALA", err);
      showErrorNotification("Gagal memuat data HALA");
    }
  }
});

// Submit handler untuk formUpdateStokHalaBulk — mengganti nilai semua jenis sekaligus
const formUpdateHala = document.getElementById("formUpdateStokHalaBulk");
if (formUpdateHala) {
  formUpdateHala.onsubmit = async function (e) {
    e.preventDefault();
    const submitBtn = document.getElementById("submitBulkUpdateHalaBtn");
    const originalText = submitBtn ? submitBtn.innerHTML : "";
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
      }
      const requirePetugasFlag = this.dataset.requirePetugas === "1";
      const petugas = document.getElementById("petugasUpdateStokHalaBulk").value.trim();
      if (requirePetugasFlag && !petugas) throw new Error("Nama staf harus diisi");
      const category = document.getElementById("jenisUpdateHala").value;
      const mainCat = document.getElementById("jenisUpdateHalaDisplay").value.split(" - ")[0] || "HALA";

      await fetchStockData();
      if (!stockData[category]) stockData[category] = {};
      // Ensure the HALA structure exists and has .details initialized
      if (!stockData[category][mainCat] || !stockData[category][mainCat].details) {
        initializeHalaStructure(stockData[category], mainCat);
      }

      const item = stockData[category][mainCat] || { details: {} };
      // Ambil nilai input (jika kosong, biarkan tidak diubah)
      const updates = [];
      halaJewelryTypes.forEach((t) => {
        const input = document.querySelector(`.hala-update-qty-input[data-type="${t}"]`);
        if (!input) return;
        const val = input.value;
        if (val === "") return; // kosong -> skip (tidak diubah)
        const newVal = parseInt(val || "0");
        if (isNaN(newVal) || newVal < 0) throw new Error("Nilai tidak valid");
        updates.push({ type: t, qty: newVal });
      });

      if (updates.length === 0)
        throw new Error("Kosongkan kolom jika tidak ingin mengubah, atau isi minimal satu jenis.");

      // Terapkan update: set setiap details[type] = newVal
      updates.forEach((u) => {
        item.details[u.type] = u.qty;
      });
      // Recalculate total & lastUpdated & add history single entry
      item.quantity = calculateHalaTotal(stockData[category], mainCat);
      item.lastUpdated = new Date().toISOString();
      const historyEntry = {
        date: item.lastUpdated,
        action: "Update Bulk",
        quantity: updates.reduce((s, it) => s + it.qty, 0),
        items: updates.map((it) => ({
          jewelryType: it.type,
          jewelryName: halaJewelryMapping[it.type],
          quantity: it.qty,
        })),
      };
      if (requirePetugasFlag && petugas) historyEntry.petugas = petugas;
      item.history.unshift(historyEntry);
      if (item.history.length > 10) item.history = item.history.slice(0, 10);

      await saveData(category, mainCat);
      await fetchStockData(true);
      await populateTables();
      showSuccessNotification("Update HALA berhasil");
      $("#modalUpdateStokHala").modal("hide");
    } catch (err) {
      console.error("Gagal update HALA", err);
      showErrorNotification(err.message || "Gagal update HALA");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  };
}

// === UI Enhancement Functions ===
function showLoadingState() {
  // Add loading overlay to main content
  const mainContent = document.querySelector(".content-wrapper");
  if (mainContent && !mainContent.querySelector(".loading-overlay")) {
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "loading-overlay";
    loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
    mainContent.style.position = "relative";
    mainContent.appendChild(loadingOverlay);
  }
}

function hideLoadingState() {
  const loadingOverlay = document.querySelector(".loading-overlay");
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
  const tabLinks = document.querySelectorAll(".nav-link");
  tabLinks.forEach((link) => {
    link.addEventListener("click", function () {
      // Add loading state for tab content
      const targetId = this.getAttribute("data-bs-target");
      if (targetId) {
        const targetTab = document.querySelector(targetId);
        if (targetTab) {
          targetTab.style.opacity = "0.7";
          setTimeout(() => {
            targetTab.style.opacity = "1";
          }, 200);
        }
      }
    });
  });

  // Add hover effects for buttons
  const buttons = document.querySelectorAll(".btn");
  buttons.forEach((button) => {
    button.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-2px)";
    });

    button.addEventListener("mouseleave", function () {
      this.style.transform = "translateY(0)";
    });
  });
}

// Reset on hide
document.addEventListener("hide.bs.dropdown", function (event) {
  const dropdownMenu = event.target.nextElementSibling;
  if (dropdownMenu && dropdownMenu.classList.contains("dropdown-menu")) {
    // Reset styles
    dropdownMenu.style.position = "";
    dropdownMenu.style.left = "";
    dropdownMenu.style.top = "";
    dropdownMenu.style.minWidth = "";
  }
});

// Handle window resize
window.addEventListener("resize", function () {
  const openDropdowns = document.querySelectorAll(".dropdown-menu.show");
  openDropdowns.forEach((menu) => {
    const toggle = menu.previousElementSibling;
    if (toggle) {
      const rect = toggle.getBoundingClientRect();
      menu.style.left = rect.left + "px";
      menu.style.top = rect.bottom + 5 + "px";
    }
  });
});

// === DAILY SNAPSHOT (AUTO) INTEGRATION ===
// Replikasi ringan logika di laporanStokHarian untuk memastikan snapshot tetap dibuat
// bahkan bila halaman yang pertama dibuka adalah manajemen stok.

function formatDateKeySnapshot(date) {
  const d = new Date(date);
  if (isNaN(d)) return null;
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function getNowInWita() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 60 * 60000); // UTC+8
}

function computeCurrentSummarySnapshotForDaily() {
  const result = {};
  mainCategories.forEach((mainCat) => {
    let total = 0;
    summaryCategories.forEach((cat) => {
      if (stockData[cat] && stockData[cat][mainCat]) {
        total += parseInt(stockData[cat][mainCat].quantity) || 0;
      }
    });
    let komputer = 0;
    if (stockData["stok-komputer"] && stockData["stok-komputer"][mainCat]) {
      komputer = parseInt(stockData["stok-komputer"][mainCat].quantity) || 0;
    }
    let status;
    if (total === komputer) status = "Sesuai / Klop";
    else if (total < komputer) status = `Kurang ${komputer - total}`;
    else status = `Lebih ${total - komputer}`;
    result[mainCat] = { total, komputer, status };
  });
  return result;
}

async function loadDailySnapshotDoc(dateObj) {
  const dateKey = formatDateKeySnapshot(dateObj);
  if (!dateKey) return null;
  try {
    const ref = doc(firestore, "daily_stock_reports", dateKey);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

async function saveDailySnapshotDoc(dateObj, { backfilled = false } = {}) {
  const dateKey = formatDateKeySnapshot(dateObj);
  if (!dateKey) return;
  // Pastikan data stok mutakhir
  await fetchStockData(true);
  const payload = {
    date: dateKey,
    createdAt: new Date().toISOString(),
    items: computeCurrentSummarySnapshotForDaily(),
  };
  if (backfilled) payload.backfilled = true;
  const ref = doc(firestore, "daily_stock_reports", dateKey);
  await setDoc(ref, payload, { merge: true });
  return payload;
}

async function ensureYesterdaySnapshotIfMissingFromManagement() {
  const nowWita = getNowInWita();
  // Ambil "kemarin" di zona WITA
  const yesterday = new Date(getNowInWita().getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = formatDateKeySnapshot(yesterday);
  // Hanya lakukan jika snapshot kemarin belum ada
  const existing = await loadDailySnapshotDoc(yesterday);
  if (!existing) {
    try {
      await saveDailySnapshotDoc(yesterday, { backfilled: true });
      showSuccessNotification(`Snapshot backfill (${yesterdayKey}) dibuat`);
    } catch (e) {
      console.warn("Gagal membuat snapshot backfill kemarin", e);
    }
  }
}

async function ensureTodaySnapshotIfPassedFromManagement() {
  const nowWita = getNowInWita();
  const target = new Date(nowWita);
  target.setHours(23, 0, 0, 0);
  if (nowWita >= target) {
    const existing = await loadDailySnapshotDoc(nowWita);
    if (!existing) {
      try {
        await saveDailySnapshotDoc(nowWita);
        showSuccessNotification("Snapshot otomatis (23:00 WITA) dibuat");
      } catch (e) {
        console.warn("Gagal membuat snapshot otomatis hari ini", e);
      }
    }
  }
}

function scheduleNextDailySnapshotFromManagement() {
  const nowWita = getNowInWita();
  const next = new Date(nowWita);
  next.setHours(23, 0, 0, 0);
  if (nowWita >= next) next.setDate(next.getDate() + 1);
  const delay = next - nowWita;
  setTimeout(async () => {
    try {
      await saveDailySnapshotDoc(getNowInWita());
      showSuccessNotification("Snapshot otomatis (23:00 WITA) dibuat");
    } catch (e) {
      console.warn("Gagal snapshot terjadwal", e);
    } finally {
      scheduleNextDailySnapshotFromManagement();
    }
  }, delay);
}

async function triggerDailySnapshotsFromManagement() {
  try {
    await ensureYesterdaySnapshotIfMissingFromManagement();
    await ensureTodaySnapshotIfPassedFromManagement();
    scheduleNextDailySnapshotFromManagement();
  } catch (e) {
    console.warn("Gagal inisialisasi mekanisme snapshot harian", e);
  }
}

// Jalankan setelah init utama selesai
document.addEventListener("DOMContentLoaded", () => {
  // Beri sedikit delay agar populateTables/fetch selesai lebih dulu (defensif)
  setTimeout(() => {
    triggerDailySnapshotsFromManagement();
  }, 1500);
});
