import { firestore } from "./configFirebase.js";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Konstanta untuk caching
const CACHE_KEY = "kodeDataCache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 menit dalam milidetik

// Fungsi untuk menampilkan alert yang lebih menarik
function showAlert(message, title = "Informasi", type = "info") {
  return Swal.fire({
    title: title,
    text: message,
    icon: type, // 'success', 'error', 'warning', 'info', 'question'
    confirmButtonText: "OK",
    confirmButtonColor: "#0d6efd", // Warna primary Bootstrap
  });
}

// Fungsi untuk konfirmasi
function showConfirm(message, title = "Konfirmasi") {
  return Swal.fire({
    title: title,
    text: message,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya",
    cancelButtonText: "Batal",
    confirmButtonColor: "#0d6efd",
    cancelButtonColor: "#6c757d",
  }).then((result) => {
    return result.isConfirmed;
  });
}

// Definisi jenis barang
const jenisBarang = {
  C: "Cincin",
  K: "Kalung",
  L: "Liontin",
  A: "Anting",
  G: "Gelang",
  S: "Giwang",
};

// State untuk menyimpan data kode
let kodeData = {
  active: [],
  mutated: [],
};

// State untuk menyimpan kode yang dipilih
let selectedKodes = {
  active: new Set(),
  mutated: new Set(),
};

// Fungsi untuk memeriksa apakah cache masih valid
function isCacheValid() {
  const cachedData = localStorage.getItem(CACHE_KEY);
  if (!cachedData) return false;

  try {
    const { timestamp, data } = JSON.parse(cachedData);
    return Date.now() - timestamp < CACHE_DURATION;
  } catch (error) {
    console.error("Error parsing cache:", error);
    return false;
  }
}

// Fungsi untuk menyimpan data ke cache
function saveToCache(data) {
  try {
    const cacheData = {
      timestamp: Date.now(),
      data: data,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    console.log("Data saved to cache");
  } catch (error) {
    console.error("Error saving to cache:", error);
  }
}

// Fungsi untuk mengambil data dari cache
function getFromCache() {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      const { data } = JSON.parse(cachedData);
      return data;
    }
    return null;
  } catch (error) {
    console.error("Error getting from cache:", error);
    return null;
  }
}

// Fungsi untuk memuat data kode dari Firestore atau cache
async function loadKodeData(forceRefresh = false) {
  try {
    // Cek apakah cache valid dan tidak dipaksa refresh
    if (!forceRefresh && isCacheValid()) {
      console.log("Using cached data");
      const cachedData = getFromCache();
      if (cachedData) {
        kodeData = cachedData;
        updateKodeDisplay();
        updateCounters();
        return;
      }
    }

    console.log("Fetching fresh data from Firestore");

    // Reset data
    kodeData = {
      active: [],
      mutated: [],
    };

    // Query untuk mengambil data penjualan manual
    const penjualanQuery = query(
      collection(firestore, "penjualanAksesoris"),
      where("jenisPenjualan", "==", "manual"),
      orderBy("timestamp", "desc")
    );

    const penjualanSnapshot = await getDocs(penjualanQuery);

    // Proses setiap dokumen penjualan
    penjualanSnapshot.forEach((doc) => {
      const penjualan = { id: doc.id, ...doc.data() };

      // Proses setiap item dalam penjualan
      if (penjualan.items && Array.isArray(penjualan.items)) {
        penjualan.items.forEach((item) => {
          // Periksa apakah kode memenuhi pola (huruf diikuti angka)
          if (item.kodeText && /^[a-zA-Z]+-\d+$/.test(item.kodeText)) {
            // Ekstrak prefix kode (huruf pertama)
            const prefix = item.kodeText.charAt(0).toUpperCase();

            // Periksa apakah prefix ada dalam daftar jenis barang
            if (prefix in jenisBarang) {
              // Buat objek kode
              const kodeItem = {
                id: `${penjualan.id}_${item.kodeText}`,
                kode: item.kodeText,
                nama: item.nama || "Tidak ada nama",
                kadar: item.kadar || "-",
                berat: item.berat || 0,
                tanggalInput: penjualan.tanggal || formatTimestamp(penjualan.timestamp),
                keterangan: item.keterangan || "",
                jenisPrefix: prefix,
                jenisNama: jenisBarang[prefix],
                penjualanId: penjualan.id,
                isMutated: item.isMutated || false,
                tanggalMutasi: item.tanggalMutasi || null,
                mutasiKeterangan: item.mutasiKeterangan || "",
                mutasiHistory: item.mutasiHistory || [],
              };

              // Tambahkan ke array yang sesuai berdasarkan status mutasi
              if (kodeItem.isMutated) {
                kodeData.mutated.push(kodeItem);
              } else {
                kodeData.active.push(kodeItem);
              }
            }
          }
        });
      }
    });

    // Simpan data ke cache
    saveToCache(kodeData);

    // Update tampilan
    updateKodeDisplay();

    // Update counter
    updateCounters();

    console.log("Data kode berhasil dimuat:", kodeData);
  } catch (error) {
    console.error("Error loading kode data:", error);
    showAlert("Gagal memuat data kode: " + error.message, "Error", "error");
  }
}

// Fungsi untuk memperbarui tampilan kode
function updateKodeDisplay() {
  // Filter berdasarkan kriteria yang dipilih
  const filteredActive = filterKodeData(kodeData.active);
  const filteredMutated = filterKodeData(kodeData.mutated);

  // Render tabel kode aktif
  renderKodeTable(filteredActive, "active");

  // Render tabel kode yang sudah dimutasi
  renderKodeTable(filteredMutated, "mutated");

  // Update counter
  updateCounters();
}

// Fungsi untuk memfilter data kode berdasarkan kriteria
function filterKodeData(data) {
  const jenisFilter = $("#filterJenis").val();
  const searchText = $("#searchKode").val().toLowerCase();

  return data.filter((item) => {
    // Filter berdasarkan jenis barang
    if (jenisFilter && item.jenisPrefix !== jenisFilter) {
      return false;
    }

    // Filter berdasarkan teks pencarian
    if (searchText) {
      const matchesKode = item.kode.toLowerCase().includes(searchText);
      const matchesNama = item.nama.toLowerCase().includes(searchText);

      if (!matchesKode && !matchesNama) {
        return false;
      }
    }

    return true;
  });
}

// Fungsi untuk merender tabel kode
function renderKodeTable(data, type) {
  const tableId = type === "active" ? "tableActiveKode" : "tableMutatedKode";
  const tableBody = $(`#${tableId} tbody`);

  // Kosongkan tabel
  tableBody.empty();

  // Jika tidak ada data, tampilkan pesan
  if (data.length === 0) {
    const colSpan = type === "active" ? 6 : 6;
    tableBody.html(`<tr><td colspan="${colSpan}" class="text-center">Tidak ada data kode</td></tr>`);
    return;
  }

  // Render baris untuk setiap item
  data.forEach((item) => {
    const row = `
      <tr data-id="${item.id}">
        <td>
          <input type="checkbox" class="form-check-input kode-checkbox" data-id="${item.id}" data-type="${type}">
        </td>
        <td>${item.kode}</td>
        <td>${item.nama}</td>
        <td>${item.kadar}</td>
        <td>${item.berat}</td>
        <td>${type === "active" ? item.tanggalInput : item.tanggalMutasi || "-"}</td>
        <td>
          <button class="btn btn-sm btn-info btn-detail" data-id="${item.id}" data-type="${type}">
            <i class="fas fa-info-circle"></i>
          </button>
          ${
            type === "active"
              ? `
          <button class="btn btn-sm btn-warning btn-mutasi" data-id="${item.id}">
            <i class="fas fa-exchange-alt"></i>
          </button>
          `
              : `
          <button class="btn btn-sm btn-secondary btn-restore" data-id="${item.id}">
            <i class="fas fa-undo"></i>
          </button>
          `
          }
        </td>
      </tr>
    `;

    tableBody.append(row);
  });

  // Attach event handlers
  attachTableEventHandlers(type);
}

// Fungsi untuk menambahkan event handler ke tabel
function attachTableEventHandlers(type) {
  // Handler untuk checkbox
  $(`#table${type.charAt(0).toUpperCase() + type.slice(1)}Kode .kode-checkbox`).on("change", function () {
    const id = $(this).data("id");
    const checkboxType = $(this).data("type");

    if ($(this).is(":checked")) {
      selectedKodes[checkboxType].add(id);
    } else {
      selectedKodes[checkboxType].delete(id);
    }

    // Update status tombol mutasi/restore
    updateButtonStatus(checkboxType);
  });

  // Handler untuk tombol detail
  $(`#table${type.charAt(0).toUpperCase() + type.slice(1)}Kode .btn-detail`).on("click", function () {
    const id = $(this).data("id");
    const itemType = $(this).data("type");

    showKodeDetail(id, itemType);
  });

  // Handler untuk tombol mutasi (hanya untuk kode aktif)
  if (type === "active") {
    $(`#tableActiveKode .btn-mutasi`).on("click", function () {
      const id = $(this).data("id");

      // Tambahkan ke set kode yang dipilih
      selectedKodes.active = new Set([id]);

      // Tampilkan modal mutasi
      showMutasiModal();
    });
  }

  // Handler untuk tombol restore (hanya untuk kode yang sudah dimutasi)
  if (type === "mutated") {
    $(`#tableMutatedKode .btn-restore`).on("click", function () {
      const id = $(this).data("id");

      // Tambahkan ke set kode yang dipilih
      selectedKodes.mutated = new Set([id]);

      // Konfirmasi restore
      confirmRestoreKode();
    });
  }
}

// Fungsi untuk memperbarui status tombol mutasi/restore
function updateButtonStatus(type) {
  if (type === "active") {
    const hasSelected = selectedKodes.active.size > 0;
    $("#btnMutasiSelected").prop("disabled", !hasSelected);
  } else {
    const hasSelected = selectedKodes.mutated.size > 0;
    $("#btnRestoreSelected").prop("disabled", !hasSelected);
    $("#btnDeleteSelected").prop("disabled", !hasSelected);
  }
}

// Fungsi untuk menampilkan detail kode
function showKodeDetail(id, type) {
  // Cari item berdasarkan id
  const item =
    type === "active"
      ? kodeData.active.find((item) => item.id === id)
      : kodeData.mutated.find((item) => item.id === id);

  if (!item) {
    showAlert("Data kode tidak ditemukan", "Error", "error");
    return;
  }

  // Isi modal dengan data item
  $("#detailKode").val(item.kode);
  $("#detailNama").val(item.nama);
  $("#detailKadar").val(item.kadar);
  $("#detailBerat").val(item.berat);
  $("#detailTanggal").val(item.tanggalInput);
  $("#detailJenis").val(item.jenisNama);
  $("#detailKeterangan").val(item.keterangan);

  // Tambahan informasi untuk kode yang sudah dimutasi
  if (type === "mutated") {
    $("#mutasiInfoContainer").show();
    $("#detailTanggalMutasi").val(item.tanggalMutasi);
    $("#detailKeteranganMutasi").val(item.mutasiKeterangan);

    // Tampilkan riwayat mutasi jika ada
    const historyContainer = $("#mutasiHistoryContainer");
    historyContainer.empty();

    if (item.mutasiHistory && item.mutasiHistory.length > 0) {
      historyContainer.show();

      // Buat daftar riwayat
      const historyList = $("<ul class='list-group'></ul>");

      item.mutasiHistory.forEach((history) => {
        const historyItem = $(`
          <li class="list-group-item">
            <div class="d-flex justify-content-between">
              <span>${history.tanggal}</span>
              <span class="badge bg-secondary">${history.status}</span>
            </div>
            <div class="mt-1">${history.keterangan}</div>
          </li>
        `);

        historyList.append(historyItem);
      });

      historyContainer.append(historyList);
    } else {
      historyContainer.hide();
    }
  } else {
    $("#mutasiInfoContainer").hide();
    $("#mutasiHistoryContainer").hide();
  }

  // Tampilkan modal
  $("#kodeDetailModal").modal("show");
}

// Fungsi untuk menampilkan modal mutasi
function showMutasiModal() {
  // Reset form
  $("#mutasiForm")[0].reset();

  // Tampilkan kode yang dipilih
  const selectedIds = Array.from(selectedKodes.active);
  const selectedItems = kodeData.active.filter((item) => selectedIds.includes(item.id));

  const kodeList = $("#selectedKodeList");
  kodeList.empty();

  selectedItems.forEach((item) => {
    kodeList.append(`
      <li class="list-group-item d-flex justify-content-between align-items-center">
        ${item.kode} - ${item.nama}
        <span class="badge bg-primary rounded-pill">${item.jenisNama}</span>
      </li>
    `);
  });

  // Set tanggal hari ini
  const today = new Date();
  const formattedDate = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${today.getFullYear()}`;
  $("#tanggalMutasi").val(formattedDate);

  // Tampilkan modal
  $("#mutasiModal").modal("show");
}

// Fungsi untuk mengonfirmasi restore kode
async function confirmRestoreKode() {
  const confirmed = await showConfirm("Apakah Anda yakin ingin mengembalikan kode yang dipilih ke status aktif?");

  if (confirmed) {
    restoreSelectedKodes();
  }
}

// Fungsi untuk memutasi kode yang dipilih
async function mutateSelectedKodes() {
  try {
    // Ambil data dari form
    const tanggalMutasi = $("#tanggalMutasi").val();
    const keteranganMutasi = $("#keteranganMutasi").val();

    if (!tanggalMutasi || !keteranganMutasi) {
      showAlert("Tanggal dan keterangan mutasi harus diisi", "Validasi", "warning");
      return;
    }

    // Ambil kode yang dipilih
    const selectedIds = Array.from(selectedKodes.active);
    const selectedItems = kodeData.active.filter((item) => selectedIds.includes(item.id));

    if (selectedItems.length === 0) {
      showAlert("Tidak ada kode yang dipilih", "Validasi", "warning");
      return;
    }

    // Tampilkan loading
    Swal.fire({
      title: "Memproses Mutasi",
      text: "Mohon tunggu...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    // Proses setiap kode yang dipilih
    for (const item of selectedItems) {
      // Ambil referensi dokumen penjualan
      const penjualanRef = doc(firestore, "penjualanAksesoris", item.penjualanId);
      const penjualanDoc = await getDoc(penjualanRef);

      if (!penjualanDoc.exists()) {
        console.error(`Dokumen penjualan ${item.penjualanId} tidak ditemukan`);
        continue;
      }

      const penjualanData = penjualanDoc.data();

      // Cari item dalam array items
      if (!penjualanData.items || !Array.isArray(penjualanData.items)) {
        console.error(`Dokumen penjualan ${item.penjualanId} tidak memiliki array items`);
        continue;
      }

      // Cari indeks item dengan kode yang sesuai
      const itemIndex = penjualanData.items.findIndex((i) => i.kodeText === item.kode);

      if (itemIndex === -1) {
        console.error(`Item dengan kode ${item.kode} tidak ditemukan dalam dokumen penjualan ${item.penjualanId}`);
        continue;
      }

      // Buat objek riwayat mutasi
      const mutasiHistory = {
        tanggal: tanggalMutasi,
        status: "Mutasi",
        keterangan: keteranganMutasi,
      };

      // Update item
      penjualanData.items[itemIndex].isMutated = true;
      penjualanData.items[itemIndex].tanggalMutasi = tanggalMutasi;
      penjualanData.items[itemIndex].mutasiKeterangan = keteranganMutasi;

      // Tambahkan ke riwayat mutasi jika belum ada
      if (!penjualanData.items[itemIndex].mutasiHistory) {
        penjualanData.items[itemIndex].mutasiHistory = [];
      }

      penjualanData.items[itemIndex].mutasiHistory.unshift(mutasiHistory);

      // Update dokumen penjualan
      await updateDoc(penjualanRef, {
        items: penjualanData.items,
      });

      // Update data lokal
      // Hapus dari array active
      kodeData.active = kodeData.active.filter((i) => i.id !== item.id);

      // Tambahkan ke array mutated dengan data yang diperbarui
      const mutatedItem = {
        ...item,
        isMutated: true,
        tanggalMutasi: tanggalMutasi,
        mutasiKeterangan: keteranganMutasi,
        mutasiHistory: [mutasiHistory, ...(item.mutasiHistory || [])],
      };

      kodeData.mutated.push(mutatedItem);
    }

    // Update cache dengan data terbaru
    saveToCache(kodeData);

    // Reset selected kodes
    selectedKodes.active = new Set();

    // Update tampilan
    updateKodeDisplay();

    // Tutup modal
    $("#mutasiModal").modal("hide");

    // Tampilkan pesan sukses
    Swal.fire({
      title: "Berhasil",
      text: `${selectedItems.length} kode berhasil dimutasi`,
      icon: "success",
      confirmButtonText: "OK",
    });
  } catch (error) {
    console.error("Error mutating kodes:", error);

    Swal.fire({
      title: "Error",
      text: `Gagal memutasi kode: ${error.message}`,
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

// Fungsi untuk mengembalikan kode yang dipilih
async function restoreSelectedKodes() {
  try {
    // Ambil kode yang dipilih
    const selectedIds = Array.from(selectedKodes.mutated);
    const selectedItems = kodeData.mutated.filter((item) => selectedIds.includes(item.id));

    if (selectedItems.length === 0) {
      showAlert("Tidak ada kode yang dipilih", "Validasi", "warning");
      return;
    }

    // Tampilkan loading
    Swal.fire({
      title: "Memproses Pengembalian",
      text: "Mohon tunggu...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    // Proses setiap kode yang dipilih
    for (const item of selectedItems) {
      // Ambil referensi dokumen penjualan
      const penjualanRef = doc(firestore, "penjualanAksesoris", item.penjualanId);
      const penjualanDoc = await getDoc(penjualanRef);

      if (!penjualanDoc.exists()) {
        console.error(`Dokumen penjualan ${item.penjualanId} tidak ditemukan`);
        continue;
      }

      const penjualanData = penjualanDoc.data();

      // Cari item dalam array items
      if (!penjualanData.items || !Array.isArray(penjualanData.items)) {
        console.error(`Dokumen penjualan ${item.penjualanId} tidak memiliki array items`);
        continue;
      }

      // Cari indeks item dengan kode yang sesuai
      const itemIndex = penjualanData.items.findIndex((i) => i.kodeText === item.kode);

      if (itemIndex === -1) {
        console.error(`Item dengan kode ${item.kode} tidak ditemukan dalam dokumen penjualan ${item.penjualanId}`);
        continue;
      }

      // Buat objek riwayat restore
      const today = new Date();
      const formattedDate = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1)
        .toString()
        .padStart(2, "0")}/${today.getFullYear()}`;

      const restoreHistory = {
        tanggal: formattedDate,
        status: "Dikembalikan",
        keterangan: "Kode dikembalikan ke status aktif",
      };

      // Update item
      penjualanData.items[itemIndex].isMutated = false;

      // Tambahkan ke riwayat mutasi
      if (!penjualanData.items[itemIndex].mutasiHistory) {
        penjualanData.items[itemIndex].mutasiHistory = [];
      }

      penjualanData.items[itemIndex].mutasiHistory.unshift(restoreHistory);

      // Update dokumen penjualan
      await updateDoc(penjualanRef, {
        items: penjualanData.items,
      });

      // Update data lokal
      // Hapus dari array mutated
      kodeData.mutated = kodeData.mutated.filter((i) => i.id !== item.id);

      // Tambahkan ke array active dengan data yang diperbarui
      const activeItem = {
        ...item,
        isMutated: false,
        mutasiHistory: [restoreHistory, ...(item.mutasiHistory || [])],
      };

      kodeData.active.push(activeItem);
    }

    // Update cache dengan data terbaru
    saveToCache(kodeData);

    // Reset selected kodes
    selectedKodes.mutated = new Set();

    // Update tampilan
    updateKodeDisplay();

    // Tampilkan pesan sukses
    Swal.fire({
      title: "Berhasil",
      text: `${selectedItems.length} kode berhasil dikembalikan`,
      icon: "success",
      confirmButtonText: "OK",
    });
  } catch (error) {
    console.error("Error restoring kodes:", error);

    Swal.fire({
      title: "Error",
      text: `Gagal mengembalikan kode: ${error.message}`,
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

// Fungsi untuk memperbarui counter
function updateCounters() {
  // Filter berdasarkan kriteria yang dipilih
  const filteredActive = filterKodeData(kodeData.active);
  const filteredMutated = filterKodeData(kodeData.mutated);

  // Update counter
  $("#activeKodeCount").text(filteredActive.length);
  $("#mutatedKodeCount").text(filteredMutated.length);

  // Update counter per jenis barang
  const jenisCountActive = {};
  const jenisCountMutated = {};

  // Inisialisasi counter untuk semua jenis barang
  Object.keys(jenisBarang).forEach((prefix) => {
    jenisCountActive[prefix] = 0;
    jenisCountMutated[prefix] = 0;
  });

  // Hitung jumlah kode per jenis barang
  filteredActive.forEach((item) => {
    jenisCountActive[item.jenisPrefix] = (jenisCountActive[item.jenisPrefix] || 0) + 1;
  });

  filteredMutated.forEach((item) => {
    jenisCountMutated[item.jenisPrefix] = (jenisCountMutated[item.jenisPrefix] || 0) + 1;
  });

  // Update badge counter
  Object.keys(jenisBarang).forEach((prefix) => {
    $(`#activeCount${prefix}`).text(jenisCountActive[prefix] || 0);
    $(`#mutatedCount${prefix}`).text(jenisCountMutated[prefix] || 0);
  });
}

// Fungsi untuk memformat timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return "-";

  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${date.getFullYear()}`;
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return "-";
  }
}

// Fungsi untuk menghapus kode yang dipilih
async function deleteSelectedKodes() {
  try {
    // Konfirmasi penghapusan
    const confirmed = await showConfirm(
      "Apakah Anda yakin ingin menghapus kode yang dipilih? Tindakan ini tidak dapat dibatalkan.",
      "Konfirmasi Penghapusan"
    );

    if (!confirmed) return;

    // Ambil kode yang dipilih
    const selectedIds = Array.from(selectedKodes.mutated);
    const selectedItems = kodeData.mutated.filter((item) => selectedIds.includes(item.id));

    if (selectedItems.length === 0) {
      showAlert("Tidak ada kode yang dipilih", "Validasi", "warning");
      return;
    }

    // Tampilkan loading
    Swal.fire({
      title: "Memproses Penghapusan",
      text: "Mohon tunggu...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    // Proses setiap kode yang dipilih
    for (const item of selectedItems) {
      // Ambil referensi dokumen penjualan
      const penjualanRef = doc(firestore, "penjualanAksesoris", item.penjualanId);
      const penjualanDoc = await getDoc(penjualanRef);

      if (!penjualanDoc.exists()) {
        console.error(`Dokumen penjualan ${item.penjualanId} tidak ditemukan`);
        continue;
      }

      const penjualanData = penjualanDoc.data();

      // Cari item dalam array items
      if (!penjualanData.items || !Array.isArray(penjualanData.items)) {
        console.error(`Dokumen penjualan ${item.penjualanId} tidak memiliki array items`);
        continue;
      }

      // Filter array items untuk menghapus item dengan kode yang sesuai
      penjualanData.items = penjualanData.items.filter((i) => i.kodeText !== item.kode);

      // Update dokumen penjualan
      await updateDoc(penjualanRef, {
        items: penjualanData.items,
      });

      // Update data lokal
      kodeData.mutated = kodeData.mutated.filter((i) => i.id !== item.id);
    }

    // Update cache dengan data terbaru
    saveToCache(kodeData);

    // Reset selected kodes
    selectedKodes.mutated = new Set();

    // Update tampilan
    updateKodeDisplay();

    // Tampilkan pesan sukses
    Swal.fire({
      title: "Berhasil",
      text: `${selectedItems.length} kode berhasil dihapus`,
      icon: "success",
      confirmButtonText: "OK",
    });
  } catch (error) {
    console.error("Error deleting kodes:", error);

    Swal.fire({
      title: "Error",
      text: `Gagal menghapus kode: ${error.message}`,
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

// Fungsi untuk memuat data awal
async function initializePage() {
  try {
    // Tampilkan loading
    Swal.fire({
      title: "Memuat Data",
      text: "Mohon tunggu...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    // Muat data kode
    await loadKodeData();

    // Sembunyikan loading
    Swal.close();

    // Inisialisasi event handler
    initializeEventHandlers();
  } catch (error) {
    console.error("Error initializing page:", error);

    Swal.fire({
      title: "Error",
      text: `Gagal memuat data: ${error.message}`,
      icon: "error",
      confirmButtonText: "OK",
    });
  }
}

// Fungsi untuk export data ke Excel
function exportToExcel(data, filename, sheetName = "Data") {
  try {
    // Cek apakah XLSX library tersedia
    if (typeof XLSX === 'undefined') {
      showAlert("Library Excel tidak tersedia. Pastikan XLSX library sudah dimuat.", "Error", "error");
      return;
    }
    
    if (!data || data.length === 0) {
      showAlert("Tidak ada data untuk di-export", "Informasi", "info");
      return;
    }
    
    // Siapkan data untuk export
    const exportData = data.map((item) => ({
      Kode: item.kode,
      "Nama Barang": item.nama,
      Kadar: item.kadar,
      Berat: item.berat,
      "Tanggal Input": item.tanggalInput,
      Status: item.isMutated ? "Sudah Dimutasi" : "Belum Dimutasi",
      "Tanggal Mutasi": item.tanggalMutasi || "-",
      "Keterangan Mutasi": item.mutasiKeterangan || "-",
      Keterangan: item.keterangan,
    }));
    
    // Buat workbook dan worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    const colWidths = [
      { wch: 10 }, // Kode
      { wch: 25 }, // Nama Barang
      { wch: 7 }, // Kadar
      { wch: 7 }, // Berat
      { wch: 15 }, // Tanggal Input
      { wch: 15 }, // Status
      { wch: 15 }, // Tanggal Mutasi
      { wch: 25 }, // Keterangan Mutasi
      { wch: 25 }, // Keterangan
    ];
    ws["!cols"] = colWidths;
    
    // Tambahkan worksheet ke workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    // Generate filename dengan timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const fullFilename = `${filename}_${timestamp}.xlsx`;
    
    // Download file
    XLSX.writeFile(wb, fullFilename);
    
    showAlert(`Data berhasil di-export ke ${fullFilename}`, "Berhasil", "success");
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    showAlert("Gagal export data: " + error.message, "Error", "error");
  }
}

// Fungsi untuk export kode aktif
function exportActiveKodes() {
  console.log("Export active kodes clicked"); // Debug log
  const filteredData = filterKodeData(kodeData.active);
  console.log("Filtered active data:", filteredData); // Debug log
  exportToExcel(filteredData, "Kode_Aktif", "Kode Aktif");
}

// Fungsi untuk export kode yang sudah dimutasi
function exportMutatedKodes() {
  console.log("Export mutated kodes clicked"); // Debug log
  const filteredData = filterKodeData(kodeData.mutated);
  console.log("Filtered mutated data:", filteredData); // Debug log
  exportToExcel(filteredData, "Kode_Dimutasi", "Kode Dimutasi");
}

// Fungsi untuk menginisialisasi event handler - DIPERBAIKI
function initializeEventHandlers() {
  // Handler untuk filter jenis barang
  $("#filterJenis").on("change", function() {
    updateKodeDisplay();
  });
  
  // Handler untuk pencarian
  $("#searchKode").on("input", function() {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      updateKodeDisplay();
    }, 300);
  });
  
  // Handler untuk tombol refresh
  $("#btnRefresh").on("click", function() {
    loadKodeData(true);
  });
  
  // Handler untuk export Excel - PINDAHKAN KE SINI
  $("#btnExportActive").on("click", function() {
    exportActiveKodes();
  });
  
  $("#btnExportMutated").on("click", function() {
    exportMutatedKodes();
  });
  
  // Handler untuk tombol filter dan reset
  $("#btnFilter").on("click", function() {
    updateKodeDisplay();
  });
  
  $("#btnReset").on("click", function() {
    $("#filterJenis").val("");
    $("#searchKode").val("");
    updateKodeDisplay();
  });
  
  // Handler untuk tombol mutasi terpilih
  $("#btnMutasiSelected").on("click", function() {
    if (selectedKodes.active.size > 0) {
      showMutasiModal();
    } else {
      showAlert("Pilih kode yang akan dimutasi terlebih dahulu", "Informasi", "info");
    }
  });
  
  // Handler untuk tombol restore terpilih
  $("#btnRestoreSelected").on("click", function() {
    if (selectedKodes.mutated.size > 0) {
      confirmRestoreKode();
    } else {
      showAlert("Pilih kode yang akan dikembalikan terlebih dahulu", "Informasi", "info");
    }
  });
  
  // Handler untuk tombol hapus terpilih
  $("#btnDeleteSelected").on("click", function() {
    if (selectedKodes.mutated.size > 0) {
      deleteSelectedKodes();
    } else {
      showAlert("Pilih kode yang akan dihapus terlebih dahulu", "Informasi", "info");
    }
  });
  
  // Handler untuk tombol simpan mutasi
  $("#btnSaveMutasi").on("click", function() {
    mutateSelectedKodes();
  });
  
  // Handler untuk checkbox "Pilih Semua" pada tab aktif
  $("#selectAllActive").on("change", function() {
    const isChecked = $(this).is(":checked");
    $("#tableActiveKode .kode-checkbox").prop("checked", isChecked);
    
    if (isChecked) {
      const filteredActive = filterKodeData(kodeData.active);
      filteredActive.forEach(item => {
        selectedKodes.active.add(item.id);
      });
    } else {
      selectedKodes.active = new Set();
    }
    
    updateButtonStatus("active");
  });
  
  // Handler untuk checkbox "Pilih Semua" pada tab mutasi
  $("#selectAllMutated").on("change", function() {
    const isChecked = $(this).is(":checked");
    $("#tableMutatedKode .kode-checkbox").prop("checked", isChecked);
    
    if (isChecked) {
      const filteredMutated = filterKodeData(kodeData.mutated);
      filteredMutated.forEach(item => {
        selectedKodes.mutated.add(item.id);
      });
    } else {
      selectedKodes.mutated = new Set();
    }
    
    updateButtonStatus("mutated");
  });
  
  // Handler untuk tab
  $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
    $("#selectAllActive").prop("checked", false);
    $("#selectAllMutated").prop("checked", false);
    
    selectedKodes.active = new Set();
    selectedKodes.mutated = new Set();
    
    updateButtonStatus("active");
    updateButtonStatus("mutated");
  });
}


// Inisialisasi halaman saat dokumen siap
$(document).ready(function () {
  initializePage();
});

// Fungsi untuk menangani logout
function handleLogout() {
  // Clear session storage
  sessionStorage.removeItem("currentUser");

  // Redirect ke halaman login
  window.location.href = "index.html";
}

// Fungsi untuk memeriksa status login
async function checkLoginStatus() {
  const user = sessionStorage.getItem("currentUser");

  if (!user) {
    // Redirect ke halaman login jika tidak ada user yang login
    window.location.href = "index.html";
  }
}

// Periksa status login saat halaman dimuat
checkLoginStatus();
