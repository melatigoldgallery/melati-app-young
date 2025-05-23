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

let activeLockRow = null;
let currentTransactionData = null;

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

// Wait for document to be ready
$(document).ready(function () {
  // Pastikan event listener hanya ditambahkan sekali
  $("#btnPrintReceipt")
    .off("click")
    .on("click", function () {
      printReceipt();
    });

  $("#btnPrintInvoice")
    .off("click")
    .on("click", function () {
      printInvoice();
    });

  // Set tanggal hari ini
  const today = new Date();
  const formattedDate = formatDate(today);
  $("#tanggal").val(formattedDate);

  // Initialize datepicker
  $("#tanggal").datepicker({
    format: "dd/mm/yyyy",
    autoclose: true,
    language: "id",
    todayHighlight: true,
  });

  // Calendar icon click handler
  $("#calendarIcon").on("click", function () {
    $("#tanggal").datepicker("show");
  });

  // Set focus to sales field when page loads
  $("#sales").focus();

  console.log("Print event handlers initialized");
});

// Stock data cache
const stockCache = {
  data: null,
  lastFetched: null,
  dirtyItems: new Set(),
};

// Load stock data on page load
loadStockData();

// Fungsi load stok yang lebih efisien
async function loadStockData(forceRefresh = false) {
  try {
    // Gunakan cache jika valid dan tidak ada perubahan
    const now = new Date().getTime();
    if (
      !forceRefresh &&
      stockCache.lastFetched &&
      now - stockCache.lastFetched < 2 * 60 * 1000 &&
      stockCache.data &&
      stockCache.dirtyItems.size === 0
    ) {
      console.log("Using cached stock data");
      populateStockTables(stockCache.data);
      return;
    }

    // Ambil data baru
    const stockSnapshot = await getDocs(collection(firestore, "stokAksesoris"));
    const stockData = [];
    stockSnapshot.forEach((doc) => stockData.push({ id: doc.id, ...doc.data() }));

    // Update cache
    stockCache.data = stockData;
    stockCache.lastFetched = now;
    stockCache.dirtyItems.clear();

    populateStockTables(stockData);
  } catch (error) {
    console.error("Error loading stock data:", error);
    showAlert("Gagal memuat data stok: " + error.message);
  }
}

// Function to populate stock tables
function populateStockTables(stockData) {
  // Populate aksesoris table
  const aksesorisTable = $("#tableAksesoris tbody");
  aksesorisTable.empty();

  const aksesorisItems = stockData.filter(
    (item) => item.kategori === "aksesoris" && item.stokAkhir > 0 // Only show items with stock > 0
  );

  if (aksesorisItems.length === 0) {
    aksesorisTable.append('<tr><td colspan="3" class="text-center">Tidak ada data aksesoris</td></tr>');
  } else {
    aksesorisItems.forEach((item) => {
      const row = `
          <tr data-kode="${item.kode}" data-nama="${item.nama}" data-stok="${item.stokAkhir || 0}" data-harga="${
        item.hargaJual || 0
      }">
            <td>${item.kode || "-"}</td>
            <td>${item.nama || "-"}</td>
            <td>${item.stokAkhir || 0}</td>
          </tr>
        `;
      aksesorisTable.append(row);
    });
  }

  // Populate kotak table
  const kotakTable = $("#tableKotak tbody");
  kotakTable.empty();

  const kotakItems = stockData.filter(
    (item) => item.kategori === "kotak" && item.stokAkhir > 0 // Only show items with stock > 0
  );

  if (kotakItems.length === 0) {
    kotakTable.append('<tr><td colspan="3" class="text-center">Tidak ada data kotak</td></tr>');
  } else {
    kotakItems.forEach((item) => {
      const row = `
          <tr data-kode="${item.kode}" data-nama="${item.nama}" data-stok="${item.stokAkhir || 0}" data-harga="${
        item.hargaJual || 0
      }">
            <td>${item.kode || "-"}</td>
            <td>${item.nama || "-"}</td>
            <td>${item.stokAkhir || 0}</td>
          </tr>
        `;
      kotakTable.append(row);
    });
  }

  // Populate lock table (menggunakan data yang sama dengan aksesoris)
  const lockTable = $("#tableLock tbody");
  lockTable.empty();

  const lockItems = stockData.filter(
    (item) => item.kategori === "aksesoris" && item.stokAkhir > 0 // Only show items with stock > 0
  );

  if (lockItems.length === 0) {
    lockTable.append('<tr><td colspan="3" class="text-center">Tidak ada data lock</td></tr>');
  } else {
    lockItems.forEach((item) => {
      const row = `
        <tr data-kode="${item.kode}" data-nama="${item.nama}" data-stok="${item.stokAkhir || 0}" data-harga="${
        item.hargaJual || 0
      }">
          <td>${item.kode || "-"}</td>
          <td>${item.nama || "-"}</td>
          <td>${item.stokAkhir || 0}</td>
        </tr>
      `;
      lockTable.append(row);
    });
  }

  // Attach event handlers for table row clicks
  attachTableRowClickHandlers();
}

// Function to attach click handlers to table rows
function attachTableRowClickHandlers() {
  // Aksesoris table row click
  $("#tableAksesoris tbody tr").on("click", function () {
    if ($(this).data("kode")) {
      const kode = $(this).data("kode");
      const nama = $(this).data("nama");
      const stok = $(this).data("stok");
      const harga = $(this).data("harga");

      // Add to table
      addAksesorisToTable(kode, nama, stok, harga);

      // Close modal
      $("#modalPilihAksesoris").modal("hide");
    }
  });

  // Kotak table row click
  $("#tableKotak tbody tr").on("click", function () {
    if ($(this).data("kode")) {
      const kode = $(this).data("kode");
      const nama = $(this).data("nama");
      const stok = $(this).data("stok");
      const harga = $(this).data("harga");

      // Add to table
      addKotakToTable(kode, nama, stok, harga);

      // Close modal
      $("#modalPilihKotak").modal("hide");
    }
  });

  // Lock table row click
  $("#tableLock tbody tr").on("click", function () {
    if ($(this).data("kode")) {
      const kode = $(this).data("kode");
      const nama = $(this).data("nama");

      if (activeLockRow) {
        // Jika ini adalah baris input
        if (activeLockRow.hasClass("input-row")) {
          $("#manualInputKodeLock").val(kode);
        } else {
          // Jika ini adalah baris normal
          activeLockRow.find(".kode-lock-input").val(kode);
        }

        // Reset referensi
        activeLockRow = null;
      }

      // Tutup modal
      $("#modalPilihLock").modal("hide");
    }
  });
}

// Function to add aksesoris to table
function addAksesorisToTable(kode, nama, stok, harga) {
  // Default values
  const jumlah = 1;
  const berat = "";
  const totalHarga = "";
  const kadar = ""; // Default empty kadar

  // Create new row
  const newRow = `
    <tr>
      <td>${kode}</td>
      <td>${nama}</td>
      <td>
        <input type="number" class="form-control form-control-sm jumlah-input" value="${jumlah}" min="1" max="${stok}">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm kadar-input" value="${kadar}" placeholder="Kadar" required>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm berat-input" value="${berat}" min="0.01" step="0.01" placeholder="0.00" required>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm harga-per-gram-input" value="0" readonly>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm total-harga-input" value="${totalHarga}" placeholder="0" required>
      </td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `;

  // Add row to table
  $("#tableAksesorisDetail tbody").append(newRow);

  // Focus on the kadar input of the new row
  const $newRow = $("#tableAksesorisDetail tbody tr:last-child");
  $newRow.find(".kadar-input").focus();

  // Attach event handlers to the new row
  attachRowEventHandlers($newRow);

  // Update grand total
  updateGrandTotal("aksesoris");
}

// Function to add kotak to table
function addKotakToTable(kode, nama, stok, harga) {
  // Default values
  const jumlah = 1;
  const totalHarga = jumlah * harga;

  // Create new row
  const newRow = `
    <tr>
      <td>${kode}</td>
      <td>${nama}</td>
      <td>
        <input type="number" class="form-control form-control-sm jumlah-input" value="${jumlah}" min="1" max="${stok}">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm harga-input" value="${parseInt(harga).toLocaleString(
          "id-ID"
        )}" required>
      </td>
      <td class="total-harga">${parseInt(totalHarga).toLocaleString("id-ID")}</td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `;

  // Add row to table
  $("#tableKotakDetail tbody").append(newRow);

  // Focus on the jumlah input of the new row
  const $newRow = $("#tableKotakDetail tbody tr:last-child");
  $newRow.find(".jumlah-input").focus();

  // Attach event handlers to the new row
  attachRowEventHandlers($newRow);

  // Update grand total
  updateGrandTotal("kotak");
}

// Function to attach event handlers to row inputs
function attachRowEventHandlers($row) {
  // For aksesoris rows
  if ($row.closest("table").attr("id") === "tableAksesorisDetail") {
    const $jumlahInput = $row.find(".jumlah-input");
    const $beratInput = $row.find(".berat-input");
    const $hargaPerGramInput = $row.find(".harga-per-gram-input");
    const $totalHargaInput = $row.find(".total-harga-input");
    const $kadarInput = $row.find(".kadar-input");

    // Calculate harga per gram when total harga or berat changes
    $totalHargaInput.add($beratInput).on("input", function () {
      const berat = parseFloat($beratInput.val()) || 0;
      let totalHarga = $totalHargaInput.val().replace(/\./g, "");
      totalHarga = parseFloat(totalHarga) || 0;

      // Calculate harga per gram
      let hargaPerGram = 0;
      if (berat > 0) {
        hargaPerGram = totalHarga / berat;
      }

      // Update harga per gram field
      $hargaPerGramInput.val(Math.round(hargaPerGram).toLocaleString("id-ID"));

      // Update grand total
      updateGrandTotal("aksesoris");
    });

    // Format total harga with thousand separator
    $totalHargaInput.on("blur", function () {
      const value = $(this).val().replace(/\./g, "");
      $(this).val(parseInt(value || 0).toLocaleString("id-ID"));
    });

    // Update total when jumlah changes
    $jumlahInput.on("input", function () {
      // Update grand total
      updateGrandTotal("aksesoris");
    });

    // Add keypress event listener to handle Enter key on total harga input
    $totalHargaInput.on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();

        // Format the current value
        const value = $(this).val().replace(/\./g, "");
        $(this).val(parseInt(value || 0).toLocaleString("id-ID"));

        // Calculate total from all rows
        calculateAksesorisTotal();

        // Focus on payment field
        $("#jumlahBayar").focus();
      }
    });

    // Function to calculate total from all aksesoris rows
    function calculateAksesorisTotal() {
      let total = 0;

      // Sum up all total prices from each row
      $("#tableAksesorisDetail tbody tr").each(function () {
        const totalHarga = $(this).find(".total-harga-input").val().replace(/\./g, "");
        total += parseInt(totalHarga) || 0;
      });

      // Update grand total display
      $("#grand-total-aksesoris").text(total.toLocaleString("id-ID"));

      // Update total in payment section
      $("#totalOngkos").val(total.toLocaleString("id-ID"));
    }

    // Add keypress event listener to handle Enter key on kadar input
    $kadarInput.on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        // Move focus to berat input
        $beratInput.focus();
      }
    });

    // Add keypress event listener to handle Enter key on berat input
    $beratInput.on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        // Move focus to total harga input
        $totalHargaInput.focus();
      }
    });
  }

  // For kotak rows
  if ($row.closest("table").attr("id") === "tableKotakDetail") {
    const $namaInput = $row.find(".nama-input");
    const $jumlahInput = $row.find(".jumlah-input");
    const $hargaInput = $row.find(".harga-input");
    const $totalCell = $row.find(".total-harga");

    // Calculate total on input change
    $namaInput
      .add($jumlahInput)
      .add($hargaInput)
      .on("input", function () {
        const jumlah = parseInt($jumlahInput.val()) || 0;
        const harga = parseInt($hargaInput.val().replace(/\./g, "")) || 0;
        const total = jumlah * harga;
        $totalCell.text(total.toLocaleString("id-ID"));

        // Update grand total
        updateGrandTotal("kotak");
      });

    // Format harga with thousand separator
    $hargaInput.on("blur", function () {
      const value = $(this).val().replace(/\./g, "");
      $(this).val(parseInt(value || 0).toLocaleString("id-ID"));
    });

    // Add keypress event listener to handle Enter key
    $hargaInput.on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();

        // Format the current value
        const value = $(this).val().replace(/\./g, "");
        $(this).val(parseInt(value || 0).toLocaleString("id-ID"));

        // Calculate total for this row
        const $row = $(this).closest("tr");
        const jumlah = parseInt($row.find(".jumlah-input").val()) || 0;
        const harga = parseInt(value) || 0;
        const total = jumlah * harga;
        $row.find(".total-harga").text(total.toLocaleString("id-ID"));

        // Update grand total
        updateGrandTotal("kotak");

        // Focus on payment field
        $("#jumlahBayar").focus();
      }
    });
  }

  // Delete button handler
  $row.find(".btn-delete").on("click", function () {
    const tableId = $row.closest("table").attr("id");
    const salesType =
      tableId === "tableAksesorisDetail" ? "aksesoris" : tableId === "tableKotakDetail" ? "kotak" : "manual";

    $row.remove();
    updateGrandTotal(salesType);
  });
}

// Calculate total price based on input values
function calculateTotalPrice() {
  const jumlah = parseFloat($("#inputJumlah").val()) || 0;
  const berat = parseFloat($("#inputBerat").val()) || 0;
  const hargaPerGram = parseFloat($("#inputHargaPerGram").val()) || 0;

  const totalHarga = jumlah * berat * hargaPerGram;
  $("#inputTotalHarga").val(totalHarga.toLocaleString("id-ID"));

  return totalHarga;
}

// Add event listeners to calculate total price
$("#inputJumlah, #inputBerat, #inputHargaPerGram").on("input", calculateTotalPrice);

// Handle sales type change
$("#jenisPenjualan").on("change", function () {
  const selectedType = $(this).val();

  // Update UI based on selected type
  updateUIForSalesType(selectedType);

  // Update payment method options based on sales type
  updatePaymentMethodOptions(selectedType);
});

// Function to update payment method options based on sales type
function updatePaymentMethodOptions(salesType) {
  // Get the current selected payment method
  const currentMethod = $("#metodeBayar").val();

  // Clear existing options
  $("#metodeBayar").empty();

  // Add default options
  $("#metodeBayar").append('<option value="tunai">Tunai</option>');

  // Add DP option only for manual sales type
  if (salesType === "manual") {
    $("#metodeBayar").append('<option value="dp">DP</option>');
  }

  // Add free option for kotak and aksesoris sales type
  if (salesType === "kotak" || salesType === "aksesoris") {
    $("#metodeBayar").append('<option value="free">Free</option>');
  }

  // Try to set the previously selected method if it's still valid
  if ($("#metodeBayar option[value='" + currentMethod + "']").length > 0) {
    $("#metodeBayar").val(currentMethod);
  } else {
    // Default to tunai if the previous method is no longer available
    $("#metodeBayar").val("tunai");
  }

  // Trigger change event to update UI
  $("#metodeBayar").trigger("change");
}

// Function to update UI based on sales type
function updateUIForSalesType(type) {
  // Hide all table containers first
  $("#aksesorisTableContainer, #kotakTableContainer, #manualTableContainer").hide();

  // Hide/show appropriate buttons
  $("#btnTambah, #btnTambahBaris").hide();

  // Update detail title
  let detailTitle = "Detail Barang";

  // Show appropriate table based on type
  switch (type) {
    case "aksesoris":
      $("#aksesorisTableContainer").show();
      $("#btnTambah").show(); // Tampilkan tombol "Pilih Kode"
      detailTitle = "Detail Aksesoris";
      $(".payment-field").show();
      break;
    case "kotak":
      $("#kotakTableContainer").show();
      $("#btnTambah").show(); // Tampilkan tombol "Pilih Kode"
      detailTitle = "Detail Kotak";
      $(".kotak-only").show();
      $(".payment-field").show();
      break;
    case "manual":
      $("#manualTableContainer").show();
      $("#btnTambahBaris").show(); // Tampilkan tombol "Tambah Baris"
      detailTitle = "Detail Penjualan Manual";
      $(".kotak-only").hide();
      $(".payment-field").show();
      // Reset tabel dan tambahkan baris input
      resetTableAndAddInputRow("manual");
      break;
  }

  $("#detailTitle").text(detailTitle);

  // Update payment method options
  updatePaymentMethodOptions(type);
}

// Function to reset table and add input row
function resetTableAndAddInputRow(type) {
  // Clear existing rows
  $("#tableManualDetail tbody").empty();

  // Create input row for manual
  const inputRow = `
    <tr class="input-row">
      <td><input type="text" class="form-control form-control-sm" id="manualInputKode" placeholder="Kode"></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputNamaBarang" placeholder="Nama barang"></td>
      <td>
        <div class="input-group input-group-sm">
          <input type="text" class="form-control" id="manualInputKodeLock" placeholder="Pilih kode" readonly>
          <button class="btn btn-outline-secondary" id="manualBtnPilihKodeLock" type="button">
            <i class="fas fa-search"></i>
          </button>
        </div>
      </td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputKadar" placeholder="Kadar" required></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputBerat" placeholder="0.00" required></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputHargaPerGram" placeholder="0" readonly></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputTotalHarga" placeholder="0" required></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputKeterangan" placeholder="Keterangan"></td>
      <td></td>
    </tr>
  `;

  // Add input row to table
  $("#tableManualDetail tbody").append(inputRow);

  // Add event listeners
  // Event listener for pilih kode lock button
  $("#manualBtnPilihKodeLock").on("click", function () {
    // Set baris input sebagai baris aktif
    activeLockRow = $(this).closest("tr");

    // Show modal to select lock code
    $("#modalPilihLock").modal("show");
  });

  // Event listeners for total price calculation
  $("#manualInputBerat, #manualInputTotalHarga").on("input", function () {
    calculateHargaPerGram("manual");
  });

  // Add keypress event listener to handle Enter key navigation
  $("#manualInputKode").on("keypress", function (e) {
    if (e.which === 13) {
      e.preventDefault();
      $("#manualInputNamaBarang").focus();
    }
  });

  $("#manualInputNamaBarang").on("keypress", function (e) {
    if (e.which === 13) {
      e.preventDefault();
      $("#manualInputKodeLock").focus();
    }
  });

  $("#manualInputKadar").on("keypress", function (e) {
    if (e.which === 13) {
      e.preventDefault();
      $("#manualInputBerat").focus();
    }
  });

  $("#manualInputBerat").on("keypress", function (e) {
    if (e.which === 13) {
      e.preventDefault();
      $("#manualInputTotalHarga").focus();
    }
  });

  $("#manualInputTotalHarga").on("keypress", function (e) {
    if (e.which === 13) {
      e.preventDefault();
      $("#manualInputKeterangan").focus();
    }
  });

  $("#manualInputKeterangan").on("keypress", function (e) {
    if (e.which === 13) {
      e.preventDefault();
      addNewRow("manual");
    }
  });

  // Focus on first field
  $("#manualInputKode").focus();
}

// Function to calculate harga per gram based on total harga and berat
function calculateHargaPerGram(type) {
  const berat = parseFloat($(`#${type}InputBerat`).val()) || 0;
  const totalHarga = parseFloat($(`#${type}InputTotalHarga`).val().replace(/\./g, "").replace(",", ".")) || 0;

  let hargaPerGram = 0;
  if (berat > 0) {
    hargaPerGram = totalHarga / berat;
  }

  $(`#${type}InputHargaPerGram`).val(Math.round(hargaPerGram).toLocaleString("id-ID"));
}

// Add new row from input row
$("#btnTambahBaris").on("click", function () {
  const salesType = $("#jenisPenjualan").val();

  if (salesType === "manual") {
    addNewRow("manual");
  }
});

// Handle "Pilih Kode" button click
$("#btnTambah").on("click", function () {
  const salesType = $("#jenisPenjualan").val();

  // Show the appropriate modal based on sales type
  if (salesType === "aksesoris") {
    $("#modalPilihAksesoris").modal("show");
  } else if (salesType === "kotak") {
    $("#modalPilihKotak").modal("show");
  }
});

// Handle delete button click for all tables
$(document).on("click", ".btn-delete", function () {
  const salesType = $("#jenisPenjualan").val();
  $(this).closest("tr").remove();
  updateGrandTotal(salesType);
});

// Handle payment method change
$("#metodeBayar").on("change", function () {
  const method = $(this).val();
  const salesType = $("#jenisPenjualan").val();

  if (method === "free") {
    // If free, hide payment fields and set total to 0
    $(".payment-field, .dp-field").hide();
    $("#totalOngkos").val("0");
  } else if (method === "dp") {
    // If DP, show DP fields (only available for manual sales)
    if (salesType === "manual") {
      $(".payment-field, .dp-field").show();
    } else {
      // If somehow DP is selected for non-manual sales, switch back to tunai
      $("#metodeBayar").val("tunai");
      $(".payment-field").show();
      $(".dp-field").hide();
    }
    // Recalculate total based on current items
    updateTotal();
  } else {
    // For other methods (tunai)
    $(".payment-field").show();
    $(".dp-field").hide();
    // Recalculate total based on current items
    updateTotal();
  }
});

// Handle nominal DP input
$("#nominalDP").on("input", function () {
  calculateSisaPembayaran();
});

// Format nominal DP with thousand separator
$("#nominalDP").on("blur", function () {
  const value = $(this).val().replace(/\./g, "");
  $(this).val(parseInt(value || 0).toLocaleString("id-ID"));
  calculateSisaPembayaran();
});

// Calculate sisa pembayaran
function calculateSisaPembayaran() {
  const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;
  const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "").replace(",", ".")) || 0;

  const sisa = total - nominalDP;
  $("#sisaPembayaran").val(sisa > 0 ? sisa.toLocaleString("id-ID") : "0");

  // Recalculate kembalian if jumlah bayar is already entered
  if ($("#jumlahBayar").val()) {
    calculateKembalian();
  }
}

// Calculate kembalian based on payment method
function calculateKembalian() {
  const paymentMethod = $("#metodeBayar").val();
  const jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "").replace(",", ".")) || 0;

  if (paymentMethod === "dp") {
    // For DP method, kembalian = jumlah bayar - nominal DP
    const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "").replace(",", ".")) || 0;
    const kembalian = jumlahBayar - nominalDP;
    $("#kembalian").val(kembalian >= 0 ? kembalian.toLocaleString("id-ID") : "0");
  } else {
    // For other methods, kembalian = jumlah bayar - total
    const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;
    const kembalian = jumlahBayar - total;
    $("#kembalian").val(kembalian >= 0 ? kembalian.toLocaleString("id-ID") : "0");
  }
}

// Function to update grand total for a specific sales type
function updateGrandTotal(salesType) {
  let tableSelector;
  let grandTotalId;

  switch (salesType) {
    case "aksesoris":
      tableSelector = "#tableAksesorisDetail";
      grandTotalId = "#grand-total-aksesoris";
      break;
    case "kotak":
      tableSelector = "#tableKotakDetail";
      grandTotalId = "#grand-total-kotak";
      break;
    case "manual":
      tableSelector = "#tableManualDetail";
      grandTotalId = "#grand-total-manual";
      break;
  }

  let total = 0;

  // Sum up all total prices
  if (salesType === "aksesoris") {
    // For aksesoris, we need to get values from input fields
    $(tableSelector + " tbody tr:not(.input-row) .total-harga-input").each(function () {
      const value = $(this).val().replace(/\./g, "").replace(",", ".");
      total += parseFloat(value) || 0;
    });
  } else if (salesType === "kotak") {
    // For kotak, we get values from text cells
    $(tableSelector + " tbody tr:not(.input-row) .total-harga").each(function () {
      const value = $(this).text().replace(/\./g, "").replace(",", ".");
      total += parseFloat(value) || 0;
    });
  } else {
    // For manual, we get values from total-harga class
    $(tableSelector + " tbody tr:not(.input-row) .total-harga").each(function () {
      const value = $(this).text().replace(/\./g, "").replace(",", ".");
      total += parseFloat(value) || 0;
    });
  }

  // Update grand total display
  $(grandTotalId).text(total.toLocaleString("id-ID"));

  // Update total in payment section
  $("#totalOngkos").val(total.toLocaleString("id-ID"));

  // If payment method is DP, update sisa pembayaran
  if ($("#metodeBayar").val() === "dp") {
    updateSisaPembayaran();
  }
}

// Fungsi untuk memperbarui sisa pembayaran
function updateSisaPembayaran() {
  const totalStr = $("#totalOngkos").val() || "0";
  const dpStr = $("#nominalDP").val() || "0";

  const total = parseFloat(totalStr.replace(/\./g, "").replace(",", ".")) || 0;
  const dp = parseFloat(dpStr.replace(/\./g, "").replace(",", ".")) || 0;

  const sisa = total - dp;

  $("#sisaPembayaran").val(sisa.toLocaleString("id-ID"));
}

// Fungsi untuk memperbarui kembalian
function updateKembalian() {
  const totalStr = $("#totalOngkos").val() || "0";
  const bayarStr = $("#jumlahBayar").val() || "0";

  const total = parseFloat(totalStr.replace(/\./g, "").replace(",", ".")) || 0;
  const bayar = parseFloat(bayarStr.replace(/\./g, "").replace(",", ".")) || 0;

  const kembalian = bayar - total;

  $("#kembalian").val(kembalian.toLocaleString("id-ID"));
}

// Function to update total based on current sales type
function updateTotal() {
  const salesType = $("#jenisPenjualan").val();
  const paymentMethod = $("#metodeBayar").val();

  // If payment method is free, set total to 0
  if (paymentMethod === "free") {
    $("#totalOngkos").val("0");
    return;
  }

  let total = 0;

  switch (salesType) {
    case "aksesoris":
      total = parseFloat($("#grand-total-aksesoris").text().replace(/\./g, "").replace(",", ".")) || 0;
      break;
    case "kotak":
      total = parseFloat($("#grand-total-kotak").text().replace(/\./g, "").replace(",", ".")) || 0;
      break;
    case "manual":
      total = parseFloat($("#grand-total-manual").text().replace(/\./g, "").replace(",", ".")) || 0;
      break;
  }

  $("#totalOngkos").val(total.toLocaleString("id-ID"));

  // If payment method is DP, calculate sisa pembayaran
  if (paymentMethod === "dp") {
    calculateSisaPembayaran();
  }
}

// Initialize UI for default sales type
updateUIForSalesType("aksesoris");

// Handle jumlah bayar input to calculate kembalian
$("#jumlahBayar").on("input", function () {
  calculateKembalian();
});

// Format jumlah bayar with thousand separator
$("#jumlahBayar").on("blur", function () {
  const value = $(this).val().replace(/\./g, "");
  $(this).val(parseInt(value || 0).toLocaleString("id-ID"));
  calculateKembalian();
});

// Di fungsi btnBatal
$("#btnBatal").on("click", async function () {
  const confirmed = await showConfirm("Apakah Anda yakin ingin membatalkan transaksi ini?");
  if (confirmed) {
    location.reload();
  }
});

// Function to add new row (extracted from btnTambahBaris click handler)
function addNewRow(type) {
  // Get values from input row
  const kode = $(`#${type}InputKode`).val() || "-";
  const namaBarang = $(`#${type}InputNamaBarang`).val();
  const kodeLock = $(`#${type}InputKodeLock`).val() || "-";
  const kadar = $(`#${type}InputKadar`).val() || "-";
  const berat = $(`#${type}InputBerat`).val() || 0;
  const totalHargaValue = $(`#${type}InputTotalHarga`).val() || "0";
  const totalHarga = parseFloat(totalHargaValue.replace(/\./g, "").replace(",", ".")) || 0;
  const hargaPerGram = $(`#${type}InputHargaPerGram`).val() || "0";
  const keterangan = $(`#${type}InputKeterangan`).val() || "";

  // Validasi
  if (!namaBarang) {
    showAlert("Nama barang harus diisi!");
    $(`#${type}InputNamaBarang`).focus();
    return;
  }
  if (!kadar) {
    showAlert("Kadar harus diisi!");
    $(`#${type}InputKadar`).focus();
    return;
  }
  if (berat <= 0) {
    showAlert("Berat harus lebih dari 0!");
    $(`#${type}InputBerat`).focus();
    return;
  }
  if (totalHarga <= 0) {
    showAlert("Total harga harus lebih dari 0!");
    $(`#${type}InputTotalHarga`).focus();
    return;
  }

  // Create new row
  const newRow = `
    <tr>
      <td>${kode}</td>
      <td>${namaBarang}</td>
      <td>${kodeLock}</td>
      <td>${kadar}</td>
      <td>${berat}</td>
      <td>${hargaPerGram}</td>
      <td class="total-harga">${parseInt(totalHarga).toLocaleString("id-ID")}</td>
      <td class="keterangan">${keterangan}</td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `;

  // Add row to table
  $(`#table${type.charAt(0).toUpperCase() + type.slice(1)}Detail tbody`).append(newRow);

  // Clear input row
  $(`#${type}InputKode`).val("");
  $(`#${type}InputNamaBarang`).val("");
  $(`#${type}InputKodeLock`).val("");
  $(`#${type}InputKadar`).val("");
  $(`#${type}InputBerat`).val("");
  $(`#${type}InputHargaPerGram`).val("");
  $(`#${type}InputTotalHarga`).val("");
  $(`#${type}InputKeterangan`).val("");

  // Focus on first field for next entry
  $(`#${type}InputKode`).focus();

  // Update grand total
  updateGrandTotal(type);
}

// Fungsi simpan penjualan
$("#btnSimpanPenjualan").on("click", async function () {
  try {
    // Validasi nama sales
    const salesName = $("#sales").val().trim();
    if (!salesName) {
      showAlert("Nama sales harus diisi!");
      $("#sales").focus();
      return;
    }

    const salesType = $("#jenisPenjualan").val();
    const tableSelector =
      salesType === "aksesoris"
        ? "#tableAksesorisDetail"
        : salesType === "kotak"
        ? "#tableKotakDetail"
        : "#tableManualDetail";

    // Check if table has rows
    if ($(tableSelector + " tbody tr:not(.input-row)").length === 0) {
      showAlert("Tidak ada barang yang ditambahkan!");
      return;
    }

    // Validasi pembayaran
    const paymentMethod = $("#metodeBayar").val();
    if (paymentMethod === "dp") {
      const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "").replace(",", ".")) || 0;
      const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;

      if (nominalDP <= 0 || nominalDP >= total) {
        showAlert(
          nominalDP <= 0 ? "Nominal DP harus diisi!" : "Nominal DP tidak boleh sama dengan atau melebihi total harga!"
        );
        $("#nominalDP").focus();
        return;
      }
    } else if (paymentMethod !== "free") {
      const jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "").replace(",", ".")) || 0;
      const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;

      if (jumlahBayar < total) {
        showAlert("Jumlah bayar kurang dari total!");
        $("#jumlahBayar").focus();
        return;
      }
    }

    // Collect items data based on sales type
    let items = [];

    if (salesType === "aksesoris") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const jumlah = parseInt($(this).find(".jumlah-input").val()) || 1;
        const kadar = $(this).find(".kadar-input").val() || "-";
        const berat = parseFloat($(this).find(".berat-input").val()) || 0;
        const hargaPerGram =
          parseFloat($(this).find(".harga-per-gram-input").val().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga =
          parseFloat($(this).find(".total-harga-input").val().replace(/\./g, "").replace(",", ".")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          jumlah: jumlah,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
        });
      });
    } else if (salesType === "kotak") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const jumlah = parseInt($(this).find(".jumlah-input").val()) || 1;
        const hargaSatuan = parseFloat($(this).find(".harga-input").val().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find(".total-harga").text().replace(/\./g, "").replace(",", ".")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          jumlah: jumlah,
          totalHarga: totalHarga,
          hargaSatuan: hargaSatuan,
        });
      });
    } else {
      // Manual
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const kodeLock = $(this).find("td:nth-child(3)").text();
        const kadar = $(this).find("td:nth-child(4)").text();
        const berat = parseFloat($(this).find("td:nth-child(5)").text()) || 0;
        const hargaPerGram =
          parseFloat($(this).find("td:nth-child(6)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find("td:nth-child(7)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const keterangan = $(this).find("td:nth-child(8)").text() || "";

        items.push({
          kodeText: kode,
          nama: nama,
          kodeLock: kodeLock !== "-" ? kodeLock : null,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
          keterangan: keterangan,
        });
      });
    }

    // Persiapkan data transaksi
    const transactionData = {
      jenisPenjualan: salesType,
      tanggal: $("#tanggal").val(),
      sales: salesName,
      metodeBayar: paymentMethod,
      totalHarga: parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0,
      timestamp: serverTimestamp(),
      items: items,
    };

    // PERBAIKAN: Tandai sebagai ganti lock jika ada kodeLock
    if (salesType === "manual" && items.some((item) => item.kodeLock)) {
      transactionData.isGantiLock = true;
    }

    // Tambahkan detail pembayaran
    if (paymentMethod === "dp") {
      transactionData.nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "").replace(",", ".")) || 0;
      transactionData.sisaPembayaran = parseFloat($("#sisaPembayaran").val().replace(/\./g, "").replace(",", ".")) || 0;
      transactionData.statusPembayaran = "DP";
    } else if (paymentMethod === "free") {
      transactionData.statusPembayaran = "Free";
    } else {
      transactionData.jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "").replace(",", ".")) || 0;
      transactionData.kembalian = parseFloat($("#kembalian").val().replace(/\./g, "").replace(",", ".")) || 0;
      transactionData.statusPembayaran = "Lunas";
    }

    // Simpan transaksi
    const docRef = await addDoc(collection(firestore, "penjualanAksesoris"), transactionData);

    // Update stok jika tidak free
    if (paymentMethod !== "free") {
      await updateStock(salesType, transactionData.items);
    }

    // Show success message only after successful save
    showAlert("Transaksi berhasil disimpan!", "Sukses", "success");

    // Store the current transaction data in a global variable for printing
    currentTransactionData = {
      id: docRef.id,
      salesType: salesType,
      tanggal: $("#tanggal").val(),
      sales: salesName,
      totalHarga: $("#totalOngkos").val(),
      items: items,
      metodeBayar: paymentMethod,
    };

    // Add DP information if payment method is DP
    if (paymentMethod === "dp") {
      currentTransactionData.nominalDP = $("#nominalDP").val();
      currentTransactionData.sisaPembayaran = $("#sisaPembayaran").val();
    }

    console.log("Current transaction data set:", currentTransactionData);

    // Trigger print modal
    $("#printModal").modal("show");

    // Reset form after modal is closed
    $("#printModal").on("hidden.bs.modal", function () {
      resetForm();
      // Set focus to sales field
      $("#sales").focus();
      // Remove the one-time event handler to prevent multiple bindings
      $("#printModal").off("hidden.bs.modal");
    });
  } catch (error) {
    console.error("Error saving transaction: ", error);
    showAlert("Terjadi kesalahan saat menyimpan transaksi: " + error.message, "Error", "error");
  }
});

// Fungsi untuk print struk kasir
function printReceipt() {
  if (!currentTransactionData) {
    showAlert("Tidak ada data transaksi untuk dicetak!");
    return;
  }

  const transaction = currentTransactionData;
  console.log("Printing receipt with data:", transaction);

  // Buat jendela baru untuk print
  const printWindow = window.open("", "_blank");

  // Buat konten HTML untuk struk
  let receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Struk Kasir</title>
      <style>
        body {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          margin: 0;
          padding: 0;
          width: 80mm;
        }
        .receipt {          
          margin: 0 auto;
          padding: 5mm;
        }
        .receipt h3, .receipt h4 {
          text-align: center;
          margin: 2mm 0;
        }
        .receipt hr {
          border-top: 1px dashed #000;
        }
        .receipt table {
          width: 100%;
          border-collapse: collapse;
        }
        .receipt th, .receipt td {
          text-align: left;
          padding: 1mm 2mm;
        }
        .text-center {
          text-align: center;
        }
        .text-right {
          text-align: right;
        }
        .keterangan {
          font-style: italic;
          font-size: 10px;
          margin-top: 2mm;
          border-top: 1px dotted #000;
          padding-top: 2mm;
        }
        .payment-info {
          margin-top: 2mm;
          border-top: 1px dotted #000;
          padding-top: 2mm;
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <h3>MELATI 3</h3>
        <h4>JL. DIPONEGORO NO. 116</h4>
        <h4>NOTA PENJUALAN ${transaction.salesType.toUpperCase()}</h4>
        <hr>
        <p>Tanggal: ${transaction.tanggal}<br>Sales: ${transaction.sales}</p>
        <hr>
        <table>
          <tr>
            <th>Kode</th>
            <th>Nama</th>
            <th>Kadar</th>
            <th>Gr</th>
            <th>Harga</th>
          </tr>
  `;

  // Tambahkan item ke struk
  let hasKeterangan = false;
  let keteranganText = "";

  transaction.items.forEach((item) => {
    receiptHTML += `
      <tr>
        <td>${item.kodeText || "-"}</td>
        <td>${item.nama || "-"}</td>
        <td>${item.kadar || "-"}</td>
        <td>${item.berat || "-"}</td>
        <td class="text-right">${parseInt(item.totalHarga).toLocaleString("id-ID")}</td>
      </tr>
    `;

    // Simpan keterangan jika ada
    if (item.keterangan && item.keterangan.trim() !== "") {
      hasKeterangan = true;
      keteranganText += item.keterangan + " ";
    }
  });

  // Tambahkan total
  receiptHTML += `
          <tr>
            <td colspan="4" class="text-right"><strong>Total:</strong></td>
            <td class="text-right"><strong>${transaction.totalHarga}</strong></td>
          </tr>
        </table>
  `;

  // Tambahkan informasi pembayaran DP jika metode pembayaran adalah DP
  if (transaction.metodeBayar === "dp") {
    // Format DP and remaining balance with thousand separators
    const dpAmount = parseFloat(transaction.nominalDP.replace(/\./g, "").replace(",", "."));
    const remainingAmount = parseFloat(transaction.sisaPembayaran.replace(/\./g, "").replace(",", "."));

    receiptHTML += `
        <div class="payment-info">
          <table>
            <tr>
              <td>Total Harga:</td>
              <td class="text-right">${transaction.totalHarga}</td>
            </tr>
            <tr>
              <td>DP:</td>
              <td class="text-right">${dpAmount.toLocaleString("id-ID")}</td>
            </tr>
            <tr>
              <td><strong>SISA:</strong></td>
              <td class="text-right"><strong>${remainingAmount.toLocaleString("id-ID")}</strong></td>
            </tr>
          </table>
        </div>
    `;
  }

  // Tambahkan keterangan jika ada
  if (hasKeterangan && transaction.salesType === "manual") {
    receiptHTML += `
        <div class="keterangan">
          <strong>Keterangan:</strong> ${keteranganText}
        </div>
    `;
  }

  receiptHTML += `
        <hr>
        <p class="text-center">Terima Kasih<br>Atas Kunjungan Anda</p>
      </div>
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `;

  // Tulis HTML ke jendela baru
  printWindow.document.write(receiptHTML);
  printWindow.document.close();
}

function printInvoice() {
  if (!currentTransactionData) {
    showAlert("Tidak ada data transaksi untuk dicetak!");
    return;
  }

  const transaction = currentTransactionData;
  console.log("Printing invoice with data:", transaction);

  // Buat jendela baru untuk print
  const printWindow = window.open("", "_blank");

  // Buat konten HTML untuk invoice
  let invoiceHTML = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Invoice Customer</title>
    <style>
      @page {
        size: 10cm 20cm;
        margin: 0;
      }
      body {
        font-family: Arial, sans-serif;
        font-size: 12px;
        margin: 0;
        padding: 5mm;
        width: 20cm;
        box-sizing: border-box;
      }
      .invoice {
        width: 100%;
      }
      .header-info {
        text-align: right;
        margin-bottom: 2cm;
        margin-right:3cm:
        margin-top:1cm;
      }         
      .total-row {
        margin-top: 1.9cm;
        text-align: right;
        font-weight: bold;
        margin-right: 3cm;
      }
      .sales{
      text-align: right;
      margin-top: 0.6cm;
      margin-right:2cm;
      }
      .keterangan {
        font-style: italic;
        font-size: 10px;
        margin-top: 2mm;
        padding-top: 2mm;
      }
      
      .item-details {
        display: flex;
        flex-wrap: wrap;
      }
      .item-price {
        width: 100%;
        text-align: right;
        font-weight: bold;
      }
      .item-data {
        display: grid;
        grid-template-columns: 2cm 1.8cm 5cm 2cm 2cm 2cm;
        width: 100%;
        column-gap: 0.2cm;
        margin-left: 1cm;
        margin-top: 1.5cm;
        margin-right: 3cm;
      }
      .item-data span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    </style>
  </head>
  <body>
    <div class="invoice">
      <div class="header-info">
        <p>${transaction.tanggal || this.formatTimestamp(transaction.timestamp)}</p>
      </div>
      <hr>
`;

  // Tambahkan item ke invoice
  let hasKeterangan = false;
  let keteranganText = "";
  let totalHarga = 0;

  transaction.items.forEach((item) => {
    const itemHarga = parseInt(item.totalHarga) || 0;
    totalHarga += itemHarga;

    invoiceHTML += `
      <div class="item-details">
        <div class="item-data">
          <span>${item.kodeText || "-"}</span>
          <span>${item.jumlah || "1"}pcs</span>
          <span>${item.nama || "-"}</span>
          <span>${item.kadar || "-"}</span>
          <span>${item.berat || "-"}gr</span>
          <span>${itemHarga.toLocaleString("id-ID")}</span>
        </div>
      </div>
  `;

    // Simpan keterangan jika ada
    if (item.keterangan && item.keterangan.trim() !== "") {
      hasKeterangan = true;
      keteranganText += `${item.nama}: ${item.keterangan}; `;
    }
  });

  // Tambahkan total di pojok kanan bawah
  invoiceHTML += `
      <div class="total-row">
        Rp ${totalHarga.toLocaleString("id-ID")}
      </div>
    <div class="sales">${transaction.sales || "-"}</div>
`;

  // Tambahkan keterangan jika ada
  if (hasKeterangan && transaction.jenisPenjualan === "manual") {
    invoiceHTML += `
      <div class="keterangan">
        ${keteranganText}
      </div>
  `;
  }

  invoiceHTML += `
    </div>
    <script>
      window.onload = function() {
        window.print();
        setTimeout(function() { window.close(); }, 500);
      };
    </script>
  </body>
  </html>
`;

  // Tulis HTML ke jendela baru
  printWindow.document.write(invoiceHTML);
  printWindow.document.close();
}

// Manual print button handler
$("#btnCetak").on("click", function () {
  if (!currentTransactionData) {
    // Coba ambil data dari form jika tidak ada data transaksi tersimpan
    const salesType = $("#jenisPenjualan").val();
    const tableSelector =
      salesType === "aksesoris"
        ? "#tableAksesorisDetail"
        : salesType === "kotak"
        ? "#tableKotakDetail"
        : "#tableManualDetail";

    // Periksa apakah ada item di tabel
    if ($(tableSelector + " tbody tr:not(.input-row)").length === 0) {
      showAlert("Tidak ada data transaksi untuk dicetak. Simpan transaksi terlebih dahulu.");
      return;
    }

    // Kumpulkan data dari form
    let items = [];

    if (salesType === "aksesoris") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const jumlah = parseInt($(this).find(".jumlah-input").val()) || 1;
        const kadar = $(this).find(".kadar-input").val() || "-";
        const berat = parseFloat($(this).find(".berat-input").val()) || 0;
        const hargaPerGram =
          parseFloat($(this).find(".harga-per-gram-input").val().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga =
          parseFloat($(this).find(".total-harga-input").val().replace(/\./g, "").replace(",", ".")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          jumlah: jumlah,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
        });
      });
    } else if (salesType === "kotak") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const jumlah = parseInt($(this).find(".jumlah-input").val()) || 1;
        const hargaSatuan = parseFloat($(this).find(".harga-input").val().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find(".total-harga").text().replace(/\./g, "").replace(",", ".")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          jumlah: jumlah,
          totalHarga: totalHarga,
          hargaSatuan: hargaSatuan,
        });
      });
    } else {
      // Manual
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const kodeLock = $(this).find("td:nth-child(3)").text();
        const kadar = $(this).find("td:nth-child(4)").text();
        const berat = parseFloat($(this).find("td:nth-child(5)").text()) || 0;
        const hargaPerGram =
          parseFloat($(this).find("td:nth-child(6)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find("td:nth-child(7)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const keterangan = $(this).find("td:nth-child(8)").text() || "";

        items.push({
          kodeText: kode,
          nama: nama,
          kodeLock: kodeLock,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
          keterangan: keterangan,
        });
      });
    }

    // Buat data transaksi dari form
    currentTransactionData = {
      salesType: salesType,
      tanggal: $("#tanggal").val(),
      sales: $("#sales").val().trim() || "Admin",
      totalHarga: $("#totalOngkos").val(),
      items: items,
      metodeBayar: $("#metodeBayar").val(),
    };

    // Tambahkan informasi DP jika metode pembayaran adalah DP
    if ($("#metodeBayar").val() === "dp") {
      currentTransactionData.nominalDP = $("#nominalDP").val();
      currentTransactionData.sisaPembayaran = $("#sisaPembayaran").val();
    }

    console.log("Created transaction data from form:", currentTransactionData);

    // Tampilkan modal print
    $("#printModal").modal("show");
  }
});

// Function to update stock after sales
async function updateStock(salesType, items) {
  try {
    for (const item of items) {
      const kode = item.kodeText;
      if (!kode || salesType === "manual") continue;

      const stockQuery = query(collection(firestore, "stokAksesoris"), where("kode", "==", kode));
      const stockSnapshot = await getDocs(stockQuery);

      if (!stockSnapshot.empty) {
        const stockDoc = stockSnapshot.docs[0];
        const currentStock = stockDoc.data().stokAkhir || 0;
        const jumlah = parseInt(item.jumlah) || 1;
        const newStock = Math.max(0, currentStock - jumlah);

        // Update stok di Firestore
        await updateDoc(doc(firestore, "stokAksesoris", stockDoc.id), {
          stokAkhir: newStock,
          lastUpdate: serverTimestamp(),
        });

        // Tambah log transaksi
        await addDoc(collection(firestore, "stokAksesorisTransaksi"), {
          kode,
          nama: item.nama || "",
          kategori: salesType === "kotak" ? "kotak" : "aksesoris",
          jenis: "laku",
          jumlah,
          stokSebelum: currentStock,
          stokSesudah: newStock,
          stokAkhir: newStock,
          timestamp: serverTimestamp(),
          keterangan: `Penjualan ${salesType} oleh ${$("#sales").val() || "Admin"}`,
        });

        // Update cache lokal
        if (stockCache.data) {
          const cacheItem = stockCache.data.find((i) => i.kode === kode);
          if (cacheItem) {
            cacheItem.stokAkhir = newStock;
            stockCache.dirtyItems.add(kode);
          }
        }
      }
    }

    // Refresh tampilan jika ada cache
    if (stockCache.data) populateStockTables(stockCache.data);

    return true;
  } catch (error) {
    console.error("Error updating stock:", error);
    throw error;
  }
}

// Function to reset the form after transaction
function resetForm() {
  try {
    // Reset sales type to default
    $("#jenisPenjualan").val("aksesoris").trigger("change");

    // Reset date to current date
    const today = new Date();
    const formattedDate = formatDate(today);
    $("#tanggal").val(formattedDate);

    // Reset sales name field
    $("#sales").val("").removeClass("is-valid is-invalid");

    // Clear all tables
    $("#tableAksesorisDetail tbody").empty();
    $("#tableKotakDetail tbody").empty();
    $("#tableManualDetail tbody").empty();

    // Reset payment fields
    $("#metodeBayar").val("tunai").trigger("change");
    $("#nominalDP").val("");
    $("#totalOngkos").val("0");
    $("#sisaPembayaran").val("0");
    $("#jumlahBayar").val("");
    $("#kembalian").val("0");

    // Reset grand totals
    $("#grand-total-aksesoris").text("0");
    $("#grand-total-kotak").text("0");
    $("#grand-total-manual").text("0");

    // Set focus to sales field after reset
    $("#sales").focus();

    console.log("Form reset successfully");
  } catch (error) {
    console.error("Error resetting form:", error);
  }
}

// Helper function untuk format tanggal
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Tambah tombol refresh stok
$(document).ready(function () {
  if ($("#refreshStok").length === 0) {
    $(".catalog-select").before(`
      <button type="button" class="btn btn-outline-primary me-2" id="refreshStok">
        <i class="fas fa-sync-alt me-1"></i> Refresh Stok
      </button>
    `);

    $("#refreshStok").on("click", function () {
      loadStockData(true);
      showAlert("Data stok berhasil diperbarui", "Sukses", "success");
    });
  }

  // Refresh stok setelah transaksi selesai
  $("#printModal").on("hidden.bs.modal", function () {
    loadStockData(true);
  });
});

// Search functionality for aksesoris modal
$("#searchAksesoris").on("input", function () {
  const searchText = $(this).val().toLowerCase();

  $("#tableAksesoris tbody tr").each(function () {
    const kode = $(this).find("td:nth-child(1)").text().toLowerCase();
    const nama = $(this).find("td:nth-child(2)").text().toLowerCase();

    if (kode.includes(searchText) || nama.includes(searchText)) {
      $(this).show();
    } else {
      $(this).hide();
    }
  });
});

// Search functionality for kotak modal
$("#searchKotak").on("input", function () {
  const searchText = $(this).val().toLowerCase();

  $("#tableKotak tbody tr").each(function () {
    const kode = $(this).find("td:nth-child(1)").text().toLowerCase();
    const nama = $(this).find("td:nth-child(2)").text().toLowerCase();

    if (kode.includes(searchText) || nama.includes(searchText)) {
      $(this).show();
    } else {
      $(this).hide();
    }
  });
});

// Search functionality for lock modal
$("#searchLock").on("input", function () {
  const searchText = $(this).val().toLowerCase();

  $("#tableLock tbody tr").each(function () {
    const kode = $(this).find("td:nth-child(1)").text().toLowerCase();
    const nama = $(this).find("td:nth-child(2)").text().toLowerCase();

    if (kode.includes(searchText) || nama.includes(searchText)) {
      $(this).show();
    } else {
      $(this).hide();
    }
  });
});

// Validasi nama sales saat blur
$("#sales").on("blur", function () {
  const salesName = $(this).val().trim();
  if (!salesName) {
    $(this).addClass("is-invalid");
    if (!$(this).next(".invalid-feedback").length) {
      $(this).after('<div class="invalid-feedback">Nama sales harus diisi!</div>');
    }
  } else {
    $(this).removeClass("is-invalid").addClass("is-valid");
    $(this).next(".invalid-feedback").remove();
  }
});

// Hapus validasi saat focus
$("#sales").on("focus", function () {
  $(this).removeClass("is-invalid is-valid");
  $(this).next(".invalid-feedback").remove();
});
