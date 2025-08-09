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
const categoryMapping = {
  "Stok Brankas": "brankas",
  "Belum Posting": "posting",
  Display: "barang-display",
  Rusak: "barang-rusak",
  "Batu Lepas": "batu-lepas",
  Manual: "manual",
  Admin: "admin",
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
// === Populate Table ===
export async function populateTables() {
  await fetchStockData();
  mainCategories.forEach((mainCat) => {
    const tbody = document.getElementById(mainCategoryToId[mainCat]);
    if (!tbody) return;
    tbody.innerHTML = "";
    subCategories.forEach((subCat, idx) => {
      const categoryKey = getCategoryKey(subCat);
      const stockItem =
        stockData[categoryKey] && stockData[categoryKey][mainCat]
          ? stockData[categoryKey][mainCat]
          : { quantity: 0, lastUpdated: null, history: [] };

      const tr = document.createElement("tr");

      // Cek apakah kategori adalah Display atau Manual untuk menggunakan tombol Update
      const isDisplayOrManual = subCat === "Display" || subCat === "Manual";

      let actionColumn;
      if (isDisplayOrManual) {
        // Untuk Display dan Manual, gunakan tombol Update langsung
        actionColumn = `
          <td class="text-center">
            <button class="btn btn-success btn-sm update-stock-btn" data-main="${mainCat}" data-category="${categoryKey}" data-subcategory="${subCat}">
              <i class="fas fa-edit"></i> Update
            </button>
          </td>
        `;
      } else {
        // Untuk kategori lainnya, gunakan dropdown seperti biasa
        actionColumn = `
          <td class="text-center">
            <div class="dropdown">
              <button class="btn btn-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
                Aksi
              </button>
              <ul class="dropdown-menu">
                <li><a class="dropdown-item add-stock-btn" href="#" data-main="${mainCat}" data-category="${categoryKey}">Tambah</a></li>
                <li><a class="dropdown-item reduce-stock-btn" href="#" data-main="${mainCat}" data-category="${categoryKey}">Kurangi</a></li>
              </ul>
            </div>
          </td>
        `;
      }

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${subCat}</td>
        <td class="text-center">${stockItem.quantity}</td>
        ${actionColumn}
        <td class="text-center">
          <button class="btn btn-info btn-sm show-history-btn" data-main="${mainCat}" data-category="${categoryKey}"><i class="fas fa-clock-rotate-left"></i></button>
        </td>
        <td class="text-center text-muted small">${formatDate(stockItem.lastUpdated)}</td>
      `;
      tbody.appendChild(tr);
    });
  });
  populateStokKomputerTable();
  updateSummaryTotals();
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
async function updateStokDisplayManual(category, mainCat, newQuantity, petugas, keterangan) {
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
    petugas,
    keterangan: keterangan || "Update stok langsung",
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
      totalEl.textContent = total;
      if (total === komputer) {
        totalEl.className = "number text-success";
        if (statusEl) {
          statusEl.textContent = "Klop";
          statusEl.className = "text-success";
        }
      } else if (total < komputer) {
        totalEl.className = "number text-danger";
        if (statusEl) {
          statusEl.textContent = `Minus ${komputer - total}`;
          statusEl.className = "text-danger";
        }
      } else {
        totalEl.className = "number text-warning";
        if (statusEl) {
          statusEl.textContent = `Plus ${total - komputer}`;
          statusEl.className = "text-warning";
        }
      }
    }
  });
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

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${formatDate(record.date)}</td>
      <td>${actionBadge}</td>
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
  // Tambah stok
  if (e.target.classList.contains("add-stock-btn")) {
    e.preventDefault();
    currentMainCat = e.target.dataset.main;
    currentCategory = e.target.dataset.category;
    // Reset form
    document.getElementById("formTambahStok").reset();
    // Optionally, set jenis default sesuai kategori
    $("#modalTambahStok").modal("show");
  }
  // Kurangi stok
  if (e.target.classList.contains("reduce-stock-btn")) {
    e.preventDefault();
    currentMainCat = e.target.dataset.main;
    currentCategory = e.target.dataset.category;
    document.getElementById("formKurangiStok").reset();
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
    document.getElementById("updateStokKeterangan").value = "";

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

// === Handler Submit Modal Update Stok Display/Manual ===
document.getElementById("formUpdateStok").onsubmit = async function (e) {
  e.preventDefault();
  const mainCat = document.getElementById("updateStokMainCat").value;
  const category = document.getElementById("updateStokCategory").value;
  const jumlah = document.getElementById("updateStokJumlah").value;
  const petugas = document.getElementById("updateStokPetugas").value;
  const keterangan = document.getElementById("updateStokKeterangan").value;

  if (!mainCat || !category || jumlah === "" || !petugas) {
    alert("Semua field yang wajib harus diisi.");
    return;
  }

  await updateStokDisplayManual(category, mainCat, jumlah, petugas, keterangan);
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
  initializeCache();
  await populateTables();
  setupRealtimeListener();
});
