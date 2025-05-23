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

// Fungsi untuk menampilkan alert yang lebih menarik
function showAlert(message, title = "Informasi", type = "info") {
  return Swal.fire({
    title: title,
    text: message,
    icon: type, // 'success', 'error', 'warning', 'info', 'question'
    confirmButtonText: 'OK',
    confirmButtonColor: '#0d6efd' // Warna primary Bootstrap
  });
}

// Fungsi untuk konfirmasi
function showConfirm(message, title = "Konfirmasi") {
  return Swal.fire({
    title: title,
    text: message,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Ya',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#0d6efd',
    cancelButtonColor: '#6c757d'
  }).then((result) => {
    return result.isConfirmed;
  });
}

// Definisi jenis barang
const jenisBarang = {
  "C": "Cincin",
  "K": "Kalung",
  "L": "Liontin",
  "A": "Anting",
  "G": "Gelang",
  "S": "Giwang"
};

// State untuk menyimpan data kode
let kodeData = {
  active: [],
  mutated: []
};

// State untuk menyimpan kode yang dipilih
let selectedKodes = {
  active: new Set(),
  mutated: new Set()
};

// Fungsi untuk memuat data kode dari Firestore
async function loadKodeData() {
  try {
    // Reset data
    kodeData = {
      active: [],
      mutated: []
    };
    
    // Query untuk mengambil data penjualan manual
    const penjualanQuery = query(
      collection(firestore, "penjualanAksesoris"),
      where("jenisPenjualan", "==", "manual"),
      orderBy("timestamp", "desc")
    );
    
    const penjualanSnapshot = await getDocs(penjualanQuery);
    
    // Proses setiap dokumen penjualan
    penjualanSnapshot.forEach(doc => {
      const penjualan = { id: doc.id, ...doc.data() };
      
      // Proses setiap item dalam penjualan
      if (penjualan.items && Array.isArray(penjualan.items)) {
        penjualan.items.forEach(item => {
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
                mutasiHistory: item.mutasiHistory || []
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
  
  return data.filter(item => {
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
  data.forEach(item => {
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
          ${type === "active" ? `
          <button class="btn btn-sm btn-warning btn-mutasi" data-id="${item.id}">
            <i class="fas fa-exchange-alt"></i>
          </button>
          ` : `
          <button class="btn btn-sm btn-secondary btn-restore" data-id="${item.id}">
            <i class="fas fa-undo"></i>
          </button>
          `}
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
  $(`#table${type.charAt(0).toUpperCase() + type.slice(1)}Kode .kode-checkbox`).on("change", function() {
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
  $(`#table${type.charAt(0).toUpperCase() + type.slice(1)}Kode .btn-detail`).on("click", function() {
    const id = $(this).data("id");
    const itemType = $(this).data("type");
    
    showKodeDetail(id, itemType);
  });
  
  // Handler untuk tombol mutasi (hanya untuk kode aktif)
  if (type === "active") {
    $(`#tableActiveKode .btn-mutasi`).on("click", function() {
      const id = $(this).data("id");
      
      // Tambahkan ke set kode yang dipilih
      selectedKodes.active = new Set([id]);
      
      // Tampilkan modal mutasi
      showMutasiModal();
    });
  }
  
  // Handler untuk tombol restore (hanya untuk kode yang sudah dimutasi)
  if (type === "mutated") {
    $(`#tableMutatedKode .btn-restore`).on("click", function() {
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
  const item = type === "active" 
    ? kodeData.active.find(item => item.id === id)
    : kodeData.mutated.find(item => item.id === id);
  
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
  $("#detailStatus").val(item.isMutated ? "Sudah Dimutasi" : "Aktif");
  $("#detailKeterangan").val(item.keterangan);
  
  // Tampilkan riwayat mutasi jika ada
  if (item.mutasiHistory && item.mutasiHistory.length > 0) {
    $("#mutasiHistorySection").show();
    
    const historyTableBody = $("#tableMutasiHistory tbody");
    historyTableBody.empty();
    
    item.mutasiHistory.forEach(history => {
      const row = `
        <tr>
          <td>${history.tanggal}</td>
          <td>${history.status}</td>
          <td>${history.keterangan}</td>
        </tr>
      `;
      
      historyTableBody.append(row);
    });
  } else {
    $("#mutasiHistorySection").hide();
  }
  
  // Tampilkan modal
  $("#modalDetailKode").modal("show");
}

// Fungsi untuk menampilkan modal konfirmasi hapus
function showDeleteModal() {
  // Dapatkan daftar kode yang dipilih
  const selectedIds = Array.from(selectedKodes.mutated);
  const selectedItems = selectedIds.map(id => kodeData.mutated.find(item => item.id === id)).filter(Boolean);
  
  // Tampilkan daftar kode yang akan dihapus
  const kodeListElement = $("#deleteKodeList ul");
  kodeListElement.empty();
  
  selectedItems.forEach(item => {
    kodeListElement.append(`
      <li class="list-group-item d-flex justify-content-between align-items-center">
        ${item.kode} - ${item.nama}
        <span class="badge bg-primary">${item.jenisNama}</span>
      </li>
    `);
  });
  
  // Tampilkan modal
  $("#modalDeleteKode").modal("show");
}

// Fungsi untuk menghapus kode yang dipilih
async function deleteKode() {
  try {
    // Dapatkan daftar kode yang dipilih
    const selectedIds = Array.from(selectedKodes.mutated);
    
    // Jika tidak ada kode yang dipilih, tampilkan pesan error
    if (selectedIds.length === 0) {
      showAlert("Tidak ada kode yang dipilih untuk dihapus", "Error", "error");
      return;
    }
    
    // Proses setiap kode yang dipilih
    for (const id of selectedIds) {
      // Cari item berdasarkan id
      const item = kodeData.mutated.find(item => item.id === id);
      
      if (!item) continue;
      
      // Ekstrak ID penjualan dan kode dari ID gabungan
      const [penjualanId, kodeText] = item.id.split("_");
      
      // Dapatkan dokumen penjualan
      const penjualanRef = doc(firestore, "penjualanAksesoris", penjualanId);
      const penjualanDoc = await getDoc(penjualanRef);
      
      if (!penjualanDoc.exists()) {
        console.error(`Dokumen penjualan dengan ID ${penjualanId} tidak ditemukan`);
        continue;
      }
      
      // Dapatkan data penjualan
      const penjualanData = penjualanDoc.data();
      
      // Temukan indeks item dalam array items
      const itemIndex = penjualanData.items.findIndex(i => i.kodeText === kodeText);
      
      if (itemIndex === -1) {
        console.error(`Item dengan kode ${kodeText} tidak ditemukan dalam dokumen penjualan`);
        continue;
      }
      
      // Hapus item dari array items
      const updatedItems = [...penjualanData.items];
      updatedItems.splice(itemIndex, 1);
      
      // Update dokumen di Firestore
      await updateDoc(penjualanRef, {
        items: updatedItems
      });
      
      // Hapus dari data lokal
      kodeData.mutated = kodeData.mutated.filter(i => i.id !== id);
    }
    
    // Reset selected kodes
    selectedKodes.mutated.clear();
    
    // Update tampilan
    updateKodeDisplay();
    
    // Update status tombol
    updateButtonStatus("mutated");
    
    // Tutup modal
    $("#modalDeleteKode").modal("hide");
    
    // Tampilkan pesan sukses
    showAlert("Kode berhasil dihapus", "Sukses", "success");
    
  } catch (error) {
    console.error("Error deleting kode:", error);
    showAlert("Gagal menghapus kode: " + error.message, "Error", "error");
  }
}

// Fungsi untuk menampilkan modal mutasi
function showMutasiModal() {
  // Dapatkan daftar kode yang dipilih
  const selectedIds = Array.from(selectedKodes.active);
  const selectedItems = selectedIds.map(id => kodeData.active.find(item => item.id === id)).filter(Boolean);
  
  // Tampilkan daftar kode yang akan dimutasi
  const kodeListElement = $("#mutasiKodeList ul");
  kodeListElement.empty();
  
  selectedItems.forEach(item => {
    kodeListElement.append(`
      <li class="list-group-item d-flex justify-content-between align-items-center">
        ${item.kode} - ${item.nama}
        <span class="badge bg-primary">${item.jenisNama}</span>
      </li>
    `);
  });
  
  // Reset keterangan
  $("#mutasiKeterangan").val("");
  
  // Tampilkan modal
  $("#modalMutasiKode").modal("show");
}

// Fungsi untuk mengonfirmasi restore kode
async function confirmRestoreKode() {
  const confirmed = await showConfirm("Apakah Anda yakin ingin mengembalikan status kode ini menjadi aktif?");
  
  if (confirmed) {
    await restoreKode();
  }
}

// Fungsi untuk memutasi kode
async function mutateKode() {
  try {
    // Dapatkan keterangan mutasi
    const keterangan = $("#mutasiKeterangan").val();
    
    // Dapatkan daftar kode yang dipilih
    const selectedIds = Array.from(selectedKodes.active);
    
    // Jika tidak ada kode yang dipilih, tampilkan pesan error
    if (selectedIds.length === 0) {
      showAlert("Tidak ada kode yang dipilih untuk dimutasi", "Error", "error");
      return;
    }
    
    // Tanggal mutasi
    const tanggalMutasi = formatDate(new Date());
    
    // Proses setiap kode yang dipilih
    for (const id of selectedIds) {
      // Cari item berdasarkan id
      const item = kodeData.active.find(item => item.id === id);
      
      if (!item) continue;
      
      // Ekstrak ID penjualan dan kode dari ID gabungan
      const [penjualanId, kodeText] = item.id.split("_");
      
      // Dapatkan dokumen penjualan
      const penjualanRef = doc(firestore, "penjualanAksesoris", penjualanId);
      const penjualanDoc = await getDoc(penjualanRef);
      
      if (!penjualanDoc.exists()) {
        console.error(`Dokumen penjualan dengan ID ${penjualanId} tidak ditemukan`);
        continue;
      }
      
      // Dapatkan data penjualan
      const penjualanData = penjualanDoc.data();
      
      // Temukan indeks item dalam array items
      const itemIndex = penjualanData.items.findIndex(i => i.kodeText === kodeText);
      
      if (itemIndex === -1) {
        console.error(`Item dengan kode ${kodeText} tidak ditemukan dalam dokumen penjualan`);
        continue;
      }
      
      // Buat riwayat mutasi baru
      const newHistory = {
        tanggal: tanggalMutasi,
        status: "Dimutasi",
        keterangan: keterangan
      };
      
      // Perbarui data item
      const updatedItems = [...penjualanData.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        isMutated: true,
        tanggalMutasi: tanggalMutasi,
        mutasiKeterangan: keterangan,
        mutasiHistory: [...(updatedItems[itemIndex].mutasiHistory || []), newHistory]
      };
      
      // Update dokumen di Firestore
      await updateDoc(penjualanRef, {
        items: updatedItems
      });
      
      // Perbarui data lokal
      item.isMutated = true;
      item.tanggalMutasi = tanggalMutasi;
      item.mutasiKeterangan = keterangan;
      item.mutasiHistory = [...(item.mutasiHistory || []), newHistory];
      
      // Pindahkan dari active ke mutated
      kodeData.active = kodeData.active.filter(i => i.id !== id);
      kodeData.mutated.push(item);
    }
    
    // Reset selected kodes
    selectedKodes.active.clear();
    
    // Update tampilan
    updateKodeDisplay();
    
    // Update status tombol
    updateButtonStatus("active");
    
    // Tutup modal
    $("#modalMutasiKode").modal("hide");
    
    // Tampilkan pesan sukses
    showAlert("Kode berhasil dimutasi", "Sukses", "success");
    
  } catch (error) {
    console.error("Error mutating kode:", error);
    showAlert("Gagal memutasi kode: " + error.message, "Error", "error");
  }
}

// Fungsi untuk mengembalikan kode yang sudah dimutasi
async function restoreKode() {
  try {
    // Dapatkan daftar kode yang dipilih
    const selectedIds = Array.from(selectedKodes.mutated);
    
    // Jika tidak ada kode yang dipilih, tampilkan pesan error
    if (selectedIds.length === 0) {
      showAlert("Tidak ada kode yang dipilih untuk dikembalikan", "Error", "error");
      return;
    }
    
    // Tanggal restore
    const tanggalRestore = formatDate(new Date());
    
    // Proses setiap kode yang dipilih
    for (const id of selectedIds) {
      // Cari item berdasarkan id
      const item = kodeData.mutated.find(item => item.id === id);
      
      if (!item) continue;
      
      // Ekstrak ID penjualan dan kode dari ID gabungan
      const [penjualanId, kodeText] = item.id.split("_");
      
      // Dapatkan dokumen penjualan
      const penjualanRef = doc(firestore, "penjualanAksesoris", penjualanId);
      const penjualanDoc = await getDoc(penjualanRef);
      
      if (!penjualanDoc.exists()) {
        console.error(`Dokumen penjualan dengan ID ${penjualanId} tidak ditemukan`);
        continue;
      }
      
      // Dapatkan data penjualan
      const penjualanData = penjualanDoc.data();
      
      // Temukan indeks item dalam array items
      const itemIndex = penjualanData.items.findIndex(i => i.kodeText === kodeText);
      
      if (itemIndex === -1) {
        console.error(`Item dengan kode ${kodeText} tidak ditemukan dalam dokumen penjualan`);
        continue;
      }
      
      // Buat riwayat mutasi baru
      const newHistory = {
        tanggal: tanggalRestore,
        status: "Dikembalikan",
        keterangan: "Kode dikembalikan ke status aktif"
      };
      
      // Perbarui data item
      const updatedItems = [...penjualanData.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        isMutated: false,
        tanggalMutasi: null,
        mutasiKeterangan: "",
        mutasiHistory: [...(updatedItems[itemIndex].mutasiHistory || []), newHistory]
      };
      
      // Update dokumen di Firestore
      await updateDoc(penjualanRef, {
        items: updatedItems
      });
      
      // Perbarui data lokal
      item.isMutated = false;
      item.tanggalMutasi = null;
      item.mutasiKeterangan = "";
      item.mutasiHistory = [...(item.mutasiHistory || []), newHistory];
      
      // Pindahkan dari mutated ke active
      kodeData.mutated = kodeData.mutated.filter(i => i.id !== id);
      kodeData.active.push(item);
    }
    
    // Reset selected kodes
    selectedKodes.mutated.clear();
    
    // Update tampilan
    updateKodeDisplay();
    
    // Update status tombol
    updateButtonStatus("mutated");
    
    // Tampilkan pesan sukses
    showAlert("Kode berhasil dikembalikan ke status aktif", "Sukses", "success");
    
  } catch (error) {
    console.error("Error restoring kode:", error);
    showAlert("Gagal mengembalikan kode: " + error.message, "Error", "error");
  }
}

// Fungsi untuk memperbarui counter
function updateCounters() {
  // Hitung jumlah kode aktif dan yang sudah dimutasi
  const activeCount = $("#tableActiveKode tbody tr").length;
  const mutatedCount = $("#tableMutatedKode tbody tr").length;
  
  // Update badge
  $("#activeCount").text(activeCount);
  $("#mutatedCount").text(mutatedCount);
}

// Fungsi untuk export data ke Excel
function exportToExcel(type) {
  try {
    const fileName = type === "active" ? "Kode_Aktif" : "Kode_Dimutasi";
    const tableId = type === "active" ? "tableActiveKode" : "tableMutatedKode";
    
    // Buat workbook baru
    const wb = XLSX.utils.book_new();
    
    // Konversi tabel HTML ke worksheet
    const ws = XLSX.utils.table_to_sheet(document.getElementById(tableId));
    
    // Tambahkan worksheet ke workbook
    XLSX.utils.book_append_sheet(wb, ws, "Data Kode");
    
    // Simpan workbook ke file Excel
    XLSX.writeFile(wb, `${fileName}_${formatDate(new Date()).replace(/\//g, "-")}.xlsx`);
    
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    showAlert("Gagal mengekspor data: " + error.message, "Error", "error");
  }
}

// Helper function untuk format tanggal
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Helper function untuk format timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return "-";
  
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDate(date);
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return "-";
  }
}

// Event handlers
$(document).ready(function() {
  // Load data kode saat halaman dimuat
  loadKodeData();
  
  // Handler untuk tombol filter
  $("#btnFilter").on("click", function() {
    updateKodeDisplay();
  });
  
  // Handler untuk tombol reset
  $("#btnReset").on("click", function() {
    $("#filterJenis").val("");
    $("#searchKode").val("");
    updateKodeDisplay();
  });
  
  // Handler untuk select all checkbox (active)
  $("#selectAllActive").on("change", function() {
    const isChecked = $(this).is(":checked");
    
    // Update semua checkbox di tabel
    $("#tableActiveKode .kode-checkbox").prop("checked", isChecked);
    
    // Update selected kodes
    selectedKodes.active.clear();
    
    if (isChecked) {
      $("#tableActiveKode .kode-checkbox").each(function() {
        selectedKodes.active.add($(this).data("id"));
      });
    }
    
    // Update status tombol
    updateButtonStatus("active");
  });
  
  // Handler untuk select all checkbox (mutated)
  $("#selectAllMutated").on("change", function() {
    const isChecked = $(this).is(":checked");
    
    // Update semua checkbox di tabel
    $("#tableMutatedKode .kode-checkbox").prop("checked", isChecked);
    
    // Update selected kodes
    selectedKodes.mutated.clear();
    
    if (isChecked) {
      $("#tableMutatedKode .kode-checkbox").each(function() {
        selectedKodes.mutated.add($(this).data("id"));
      });
    }
    
    // Update status tombol
    updateButtonStatus("mutated");
  });
  
  // Handler untuk tombol mutasi terpilih
  $("#btnMutasiSelected").on("click", function() {
    if (selectedKodes.active.size === 0) {
      showAlert("Tidak ada kode yang dipilih untuk dimutasi", "Peringatan", "warning");
      return;
    }
    
    showMutasiModal();
  });
  
  // Handler untuk tombol konfirmasi mutasi
  $("#btnConfirmMutasi").on("click", function() {
    mutateKode();
  });
  
  // Handler untuk tombol restore terpilih
  $("#btnRestoreSelected").on("click", function() {
    if (selectedKodes.mutated.size === 0) {
      showAlert("Tidak ada kode yang dipilih untuk dikembalikan", "Peringatan", "warning");
      return;
    }
    
    confirmRestoreKode();
  });
  
  // Handler untuk tombol export Excel (active)
  $("#btnExportActive").on("click", function() {
    exportToExcel("active");
  });
  
  // Handler untuk tombol export Excel (mutated)
  $("#btnExportMutated").on("click", function() {
    exportToExcel("mutated");
  });
  
  // Handler untuk pencarian real-time
  $("#searchKode").on("input", function() {
    // Delay pencarian untuk menghindari terlalu banyak pembaruan
    clearTimeout($(this).data("timeout"));
    
    $(this).data("timeout", setTimeout(function() {
      updateKodeDisplay();
    }, 500));
  });
  
  
// Handler untuk tombol hapus terpilih
$("#btnDeleteSelected").on("click", function() {
  if (selectedKodes.mutated.size === 0) {
    showAlert("Tidak ada kode yang dipilih untuk dihapus", "Peringatan", "warning");
    return;
  }
  
  showDeleteModal();
});

// Handler untuk tombol konfirmasi hapus
$("#btnConfirmDelete").on("click", function() {
  deleteKode();
});

  // Handler untuk perubahan filter jenis
  $("#filterJenis").on("change", function() {
    updateKodeDisplay();
  });
  
  // Handler untuk tab change
  $('button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
    // Reset selected kodes when switching tabs
    selectedKodes.active.clear();
    selectedKodes.mutated.clear();
    
    // Update button status
    updateButtonStatus("active");
    updateButtonStatus("mutated");
    
    // Uncheck select all checkboxes
    $("#selectAllActive").prop("checked", false);
    $("#selectAllMutated").prop("checked", false);
  });
  
  // Load SheetJS library for Excel export
  if (typeof XLSX === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    document.head.appendChild(script);
  }
});


