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

  console.log("Print event handlers initialized");
});

// Stock data cache
const stockCache = {
  data: null,
  lastFetched: null,
};

// Load stock data on page load
loadStockData();

// Function to load stock data from Firestore
async function loadStockData() {
  try {
    // Check cache validity (cache expires after 5 minutes)
    const now = new Date().getTime();
    const cacheExpiry = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (stockCache.lastFetched && now - stockCache.lastFetched < cacheExpiry && stockCache.data) {
      console.log("Using cached stock data");
      populateStockTables(stockCache.data);
      return;
    }

    console.log("Fetching fresh stock data");
    const stockSnapshot = await getDocs(collection(firestore, "stokAksesoris"));

    const stockData = [];
    stockSnapshot.forEach((doc) => {
      stockData.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Update cache
    stockCache.data = stockData;
    stockCache.lastFetched = now;

    // Populate stock tables
    populateStockTables(stockData);
  } catch (error) {
    console.error("Error loading stock data:", error);
    alert("Gagal memuat data stok: " + error.message);
  }
}

// Function to populate stock tables
function populateStockTables(stockData) {
  // Populate aksesoris table
  const aksesorisTable = $("#tableAksesoris tbody");
  aksesorisTable.empty();

  const aksesorisItems = stockData.filter((item) => item.kategori === "aksesoris");

  if (aksesorisItems.length === 0) {
    aksesorisTable.append('<tr><td colspan="5" class="text-center">Tidak ada data aksesoris</td></tr>');
  } else {
    aksesorisItems.forEach((item) => {
      const row = `
          <tr>
            <td>${item.kode || "-"}</td>
            <td>${item.nama || "-"}</td>
            <td>${item.stokAkhir || 0}</td>
            <td>${item.hargaJual ? parseInt(item.hargaJual).toLocaleString("id-ID") : "0"}</td>
            <td>
              <button class="btn btn-sm btn-primary btn-pilih-aksesoris" 
                data-kode="${item.kode}" 
                data-nama="${item.nama}"
                data-stok="${item.stokAkhir || 0}"
                data-harga="${item.hargaJual || 0}">
                <i class="fas fa-check"></i> Pilih
              </button>
            </td>
          </tr>
        `;
      aksesorisTable.append(row);
    });
  }

  // Populate kotak table
  const kotakTable = $("#tableKotak tbody");
  kotakTable.empty();

  const kotakItems = stockData.filter((item) => item.kategori === "kotak");

  if (kotakItems.length === 0) {
    kotakTable.append('<tr><td colspan="5" class="text-center">Tidak ada data kotak</td></tr>');
  } else {
    kotakItems.forEach((item) => {
      const row = `
          <tr>
            <td>${item.kode || "-"}</td>
            <td>${item.nama || "-"}</td>
            <td>${item.stokAkhir || 0}</td>
            <td>${item.hargaJual ? parseInt(item.hargaJual).toLocaleString("id-ID") : "0"}</td>
            <td>
              <button class="btn btn-sm btn-primary btn-pilih-kotak" 
                data-kode="${item.kode}" 
                data-nama="${item.nama}"
                data-stok="${item.stokAkhir || 0}"
                data-harga="${item.hargaJual || 0}">
                <i class="fas fa-check"></i> Pilih
              </button>
            </td>
          </tr>
        `;
      kotakTable.append(row);
    });
  }

  // Populate lock table (menggunakan data yang sama dengan aksesoris)
  const lockTable = $("#tableLock tbody");
  lockTable.empty();

  const lockItems = stockData.filter((item) => item.kategori === "aksesoris");

  if (lockItems.length === 0) {
    lockTable.append('<tr><td colspan="4" class="text-center">Tidak ada data lock</td></tr>');
  } else {
    lockItems.forEach((item) => {
      const row = `
        <tr>
          <td>${item.kode || "-"}</td>
          <td>${item.nama || "-"}</td>
          <td>${item.stokAkhir || 0}</td>
          <td>
            <button class="btn btn-sm btn-primary btn-pilih-lock" 
              data-kode="${item.kode}" 
              data-nama="${item.nama}">
              <i class="fas fa-check"></i> Pilih
            </button>
          </td>
        </tr>
      `;
      lockTable.append(row);
    });
  }

  // Attach event handlers for pilih buttons
  attachPilihButtonHandlers();
}

// Function to attach event handlers to pilih buttons
function attachPilihButtonHandlers() {
  // Aksesoris pilih button
  $(document)
    .off("click", ".btn-pilih-aksesoris")
    .on("click", ".btn-pilih-aksesoris", function () {
      const kode = $(this).data("kode");
      const nama = $(this).data("nama");
      const stok = $(this).data("stok");
      const harga = $(this).data("harga");

      // Add to table
      addAksesorisToTable(kode, nama, stok, harga);

      // Close modal
      $("#modalPilihAksesoris").modal("hide");
    });

  // Kotak pilih button
  $(document)
    .off("click", ".btn-pilih-kotak")
    .on("click", ".btn-pilih-kotak", function () {
      const kode = $(this).data("kode");
      const nama = $(this).data("nama");
      const stok = $(this).data("stok");
      const harga = $(this).data("harga");

      // Add to table
      addKotakToTable(kode, nama, stok, harga);

      // Close modal
      $("#modalPilihKotak").modal("hide");
    });

  // Lock pilih button
  $(document)
    .off("click", ".btn-pilih-lock")
    .on("click", ".btn-pilih-lock", function () {
      const kode = $(this).data("kode");

      if (activeLockRow) {
        // Jika ini adalah baris input
        if (activeLockRow.hasClass("input-row")) {
          $("#lockInputKodeLock").val(kode);
        } else {
          // Jika ini adalah baris normal
          activeLockRow.find(".kode-lock-input").val(kode);
        }

        // Reset referensi
        activeLockRow = null;
      }

      // Tutup modal
      $("#modalPilihLock").modal("hide");
    });
}

// Function to add aksesoris to table
function addAksesorisToTable(kode, nama, stok, harga) {
  // Default values
  const jumlah = 1;
  const berat = 0;
  const totalHarga = 0;
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
        <input type="text" class="form-control form-control-sm kadar-input" value="${kadar}" placeholder="Kadar">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm berat-input" value="${berat}" min="0.01" step="0.01">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm harga-per-gram-input" value="0" readonly>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm total-harga-input" value="0">
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
        )}">
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

  // For kotak rows (keep existing code)
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
    const salesType = tableId === "tableAksesorisDetail" ? "aksesoris" : "kotak";

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
  $("#aksesorisTableContainer, #kotakTableContainer, #lockTableContainer, #manualTableContainer").hide();

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
    case "gantiLock":
      $("#lockTableContainer").show();
      $("#btnTambahBaris").show(); // Tampilkan tombol "Tambah Baris"
      detailTitle = "Detail Penggantian Lock";
      $(".kotak-only").hide();
      $(".payment-field").show();
      // Reset tabel dan tambahkan baris input
      resetTableAndAddInputRow("lock");
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
    case "gantiLock":
      $("#lockTableContainer").show();
      $("#btnTambah").show(); // Tampilkan tombol "Pilih Kode"
      $("#btnTambahBaris").show(); // Tetap tampilkan tombol "Tambah Baris"
      detailTitle = "Detail Penggantian Lock";
      $(".kotak-only").hide();
      $(".payment-field").show();
      // Reset tabel dan tambahkan baris input
      resetTableAndAddInputRow("lock");
      break;
  }

  $("#detailTitle").text(detailTitle);

  // Update payment method options
  updatePaymentMethodOptions(type);
}

// Modifikasi fungsi addLockToTable
function addLockToTable(kode, nama, stok, harga) {
  // Default values
  const berat = 0;
  const totalHarga = 0;

  // Create new row
  const newRow = `
      <tr>
        <td>${kode}</td>
        <td>${nama}</td>
        <td>
          <div class="input-group input-group-sm">
            <input type="text" class="form-control kode-lock-input" placeholder="Pilih kode" readonly>
            <button class="btn btn-outline-secondary btn-pilih-kode-lock" type="button">
              <i class="fas fa-search"></i>
            </button>
          </div>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm berat-input" value="${berat}" min="0.01" step="0.01">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm harga-per-gram-input" value="0" readonly>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm total-harga-input" value="0">
        </td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;

  // Add row to table
  $("#tableLockDetail tbody").append(newRow);

  // Get the new row
  const $newRow = $("#tableLockDetail tbody tr:last-child");

  // Attach event handler for pilih kode lock button
  $newRow.find(".btn-pilih-kode-lock").on("click", function () {
    // Set this row as the active row
    activeLockRow = $newRow;

    // Show modal to select lock code
    $("#modalPilihLock").modal("show");
  });

  // Attach other event handlers
  attachLockRowEventHandlers($newRow);

  // Focus on the berat input
  $newRow.find(".berat-input").focus();

  // Update grand total
  updateGrandTotal("gantiLock");
}

// Fungsi untuk menangani event pada baris lock
function attachLockRowEventHandlers($row) {
  const $beratInput = $row.find(".berat-input");
  const $hargaPerGramInput = $row.find(".harga-per-gram-input");
  const $totalHargaInput = $row.find(".total-harga-input");

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
    updateGrandTotal("gantiLock");
  });

  // Format total harga with thousand separator
  $totalHargaInput.on("blur", function () {
    const value = $(this).val().replace(/\./g, "");
    $(this).val(parseInt(value || 0).toLocaleString("id-ID"));
  });

  // Delete button handler
  $row.find(".btn-delete").on("click", function () {
    $row.remove();
    updateGrandTotal("gantiLock");
  });
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

// Function to add input row if needed
function addInputRowIfNeeded(type) {
  let tableSelector, inputRowId;

  if (type === "lock") {
    tableSelector = "#tableLockDetail";
    inputRowId = "lockInputRow";
  } else {
    // manual
    tableSelector = "#tableManualDetail";
    inputRowId = "manualInputRow";
  }

  // Check if input row already exists
  if ($(tableSelector + " tbody tr#" + inputRowId).length === 0) {
    // Create input row
    const inputRow = `
      <tr id="${inputRowId}" class="input-row">
        <td><input type="text" class="form-control form-control-sm" id="${type}InputKode" placeholder="Kode"></td>
        <td><input type="text" class="form-control form-control-sm" id="${type}InputNamaBarang" placeholder="Nama barang"></td>
        <td><input type="number" class="form-control form-control-sm" id="${type}InputJumlah" value="1" min="1"></td>
        <td><input type="text" class="form-control form-control-sm" id="${type}InputBerat" placeholder="0.00"></td>
        <td><input type="text" class="form-control form-control-sm" id="${type}InputHargaPerGram" placeholder="0" readonly></td>
        <td><input type="text" class="form-control form-control-sm" id="${type}InputTotalHarga" placeholder="0"></td>
        <td></td>
      </tr>
    `;

    // Add input row to table
    $(tableSelector + " tbody").prepend(inputRow);

    // Add event listeners to calculate total price
    $(`#${type}InputJumlah, #${type}InputBerat, #${type}InputHargaPerGram`).on("input", function () {
      calculateRowTotalPrice(type);
    });
  }
}

// Function to calculate total price for a row
function calculateRowTotalPrice(type) {
  const jumlah = parseFloat($(`#${type}InputJumlah`).val()) || 0;
  const berat = parseFloat($(`#${type}InputBerat`).val()) || 0;
  const hargaPerGram = parseFloat($(`#${type}InputHargaPerGram`).val()) || 0;

  const totalHarga = jumlah * berat * hargaPerGram;
  $(`#${type}InputTotalHarga`).val(totalHarga.toLocaleString("id-ID"));

  return totalHarga;
}

// Add new row from input row
$("#btnTambahBaris").on("click", function () {
  const salesType = $("#jenisPenjualan").val();

  if (salesType === "gantiLock" || salesType === "manual") {
    const type = salesType === "gantiLock" ? "lock" : "manual";
    addNewRow(type);
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
  } else if (salesType === "gantiLock") {
    // Untuk gantiLock, kita perlu memilih barang yang akan diganti locknya
    $("#modalPilihAksesoris").modal("show");
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
    // For DP method, kembalian = jumlah bayar - sisa pembayaran
    const sisaPembayaran = parseFloat($("#sisaPembayaran").val().replace(/\./g, "").replace(",", ".")) || 0;
    const kembalian = jumlahBayar - sisaPembayaran;
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
    case "gantiLock":
      tableSelector = "#tableLockDetail";
      grandTotalId = "#grand-total-lock";
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
  } else {
    // For other types, we get values from text cells
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
    case "gantiLock":
      total = parseFloat($("#grand-total-lock").text().replace(/\./g, "").replace(",", ".")) || 0;
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
  const paymentMethod = $("#metodeBayar").val();
  const jumlahBayar = parseFloat($(this).val().replace(/\./g, "").replace(",", ".")) || 0;

  if (paymentMethod === "dp") {
    const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "").replace(",", ".")) || 0;
    const kembalian = jumlahBayar - nominalDP;
    $("#kembalian").val(kembalian >= 0 ? kembalian.toLocaleString("id-ID") : "0");
  } else {
    const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;
    const kembalian = jumlahBayar - total;
    $("#kembalian").val(kembalian >= 0 ? kembalian.toLocaleString("id-ID") : "0");
  }
});

// Format number inputs with thousand separator
function formatNumber(input) {
  const value = input.value.replace(/\D/g, "");
  input.value = parseInt(value || 0).toLocaleString("id-ID");
}

// Modify the jumlahBayar input handler
$("#jumlahBayar").on("input", function () {
  calculateKembalian();
});

// Format jumlah bayar with thousand separator
$("#jumlahBayar").on("blur", function () {
  const value = $(this).val().replace(/\./g, "");
  $(this).val(parseInt(value || 0).toLocaleString("id-ID"));
  calculateKembalian();
});

// Reset form button
$("#btnBatal").on("click", function () {
  if (confirm("Apakah Anda yakin ingin membatalkan transaksi ini?")) {
    location.reload();
  }
});

// Modifikasi fungsi resetTableAndAddInputRow untuk lock
function resetTableAndAddInputRow(type) {
  let tableSelector;

  if (type === "lock") {
    tableSelector = "#tableLockDetail";
  } else {
    // manual
    tableSelector = "#tableManualDetail";
  }

  // Clear existing rows
  $(tableSelector + " tbody").empty();

  // Create input row
  const inputRow =
    type === "lock"
      ? `
    <tr class="input-row">
      <td><input type="text" class="form-control form-control-sm" id="${type}InputKode" placeholder="Kode"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputNamaBarang" placeholder="Nama barang"></td>
      <td>
        <div class="input-group input-group-sm">
          <input type="text" class="form-control" id="${type}InputKodeLock" placeholder="Pilih kode" readonly>
          <button class="btn btn-outline-secondary" id="${type}BtnPilihKodeLock" type="button">
            <i class="fas fa-search"></i>
          </button>
        </div>
      </td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputKadar" placeholder="Kadar"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputBerat" placeholder="0.00"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputHargaPerGram" placeholder="0" readonly></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputTotalHarga" placeholder="0"></td>
      <td></td>
    </tr>
  `
      : `
    <tr class="input-row">
      <td><input type="text" class="form-control form-control-sm" id="${type}InputKode" placeholder="Kode"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputNamaBarang" placeholder="Nama barang"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputKadar" placeholder="Kadar"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputBerat" placeholder="0.00"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputHargaPerGram" placeholder="0" readonly></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputTotalHarga" placeholder="0"></td>
      <td><input type="text" class="form-control form-control-sm" id="${type}InputKeterangan" placeholder="Keterangan"></td>
      <td></td>
    </tr>
  `;

  // Add input row to table
  $(tableSelector + " tbody").append(inputRow);

  // Add event listeners
  if (type === "lock") {
    // Event listener for pilih kode lock button
    $(`#${type}BtnPilihKodeLock`).on("click", function () {
      // Set baris input sebagai baris aktif
      activeLockRow = $(this).closest("tr");

      // Show modal to select lock code
      $("#modalPilihLock").modal("show");
    });

    // Event listeners for total price calculation
    $(`#${type}InputBerat, #${type}InputTotalHarga`).on("input", function () {
      calculateHargaPerGram(type);
    });

    // Add keypress event listener to handle Enter key navigation
    $(`#${type}InputKode`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputNamaBarang`).focus();
      }
    });

    $(`#${type}InputNamaBarang`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputKodeLock`).focus();
      }
    });

    $(`#${type}InputKadar`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputBerat`).focus();
      }
    });

    $(`#${type}InputBerat`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputTotalHarga`).focus();
      }
    });

    // Add keypress event listener to total harga input to handle Enter key
    $(`#${type}InputTotalHarga`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        addNewRow(type);
      }
    });
  } else {
    // Event listeners for manual type
    $(`#${type}InputBerat, #${type}InputTotalHarga`).on("input", function () {
      calculateHargaPerGram(type);
    });

    // Add keypress event listener to handle Enter key navigation
    $(`#${type}InputKode`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputNamaBarang`).focus();
      }
    });

    $(`#${type}InputNamaBarang`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputKadar`).focus();
      }
    });

    $(`#${type}InputKadar`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputBerat`).focus();
      }
    });

    $(`#${type}InputBerat`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputTotalHarga`).focus();
      }
    });

    $(`#${type}InputTotalHarga`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        $(`#${type}InputKeterangan`).focus();
      }
    });

    $(`#${type}InputKeterangan`).on("keypress", function (e) {
      if (e.which === 13) {
        e.preventDefault();
        addNewRow(type);
      }
    });
  }

  // Focus on first field
  $(`#${type}InputKode`).focus();
}

// Function to add new row (extracted from btnTambahBaris click handler)
function addNewRow(type) {
  // Get values from input row
  const kode = $(`#${type}InputKode`).val() || "-";
  const namaBarang = $(`#${type}InputNamaBarang`).val();
  const kadar = $(`#${type}InputKadar`).val() || "-";
  const berat = $(`#${type}InputBerat`).val() || 0;
  const totalHargaValue = $(`#${type}InputTotalHarga`).val() || "0";
  const totalHarga = parseFloat(totalHargaValue.replace(/\./g, "").replace(",", ".")) || 0;
  const hargaPerGram = $(`#${type}InputHargaPerGram`).val() || "0";

  // Ambil keterangan untuk tipe manual
  const keterangan = type === "manual" ? $(`#${type}InputKeterangan`).val() || "" : "";

  // Get kode lock for lock type
  const kodeLock = type === "lock" ? $(`#${type}InputKodeLock`).val() || "-" : "";

  // Validasi
  if (!namaBarang) {
    alert("Nama barang harus diisi!");
    $(`#${type}InputNamaBarang`).focus();
    return;
  }
  if (berat <= 0) {
    alert("Berat harus lebih dari 0!");
    $(`#${type}InputBerat`).focus();
    return;
  }

  if (totalHarga <= 0) {
    alert("Total harga harus lebih dari 0!");
    $(`#${type}InputTotalHarga`).focus();
    return;
  }

  // Determine target table and sales type
  let tableSelector;
  let salesType;

  if (type === "lock") {
    tableSelector = "#tableLockDetail";
    salesType = "gantiLock";
  } else {
    // manual
    tableSelector = "#tableManualDetail";
    salesType = "manual";
  }

  // Create new row
  const newRow =
    type === "lock"
      ? `
    <tr>
      <td>${kode}</td>
      <td>${namaBarang}</td>
      <td>${kodeLock}</td>
      <td>${kadar}</td>
      <td>${berat}</td>
      <td>${hargaPerGram}</td>
      <td class="total-harga">${parseInt(totalHarga).toLocaleString("id-ID")}</td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `
      : `
    <tr>
      <td>${kode}</td>
      <td>${namaBarang}</td>
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
  $(tableSelector + " tbody").append(newRow);

  // Clear input row
  $(`#${type}InputKode`).val("");
  $(`#${type}InputNamaBarang`).val("");
  $(`#${type}InputKadar`).val("");
  $(`#${type}InputBerat`).val("");
  $(`#${type}InputHargaPerGram`).val("");
  $(`#${type}InputTotalHarga`).val("");

  // Clear keterangan for manual type
  if (type === "manual") {
    $(`#${type}InputKeterangan`).val("");
  }

  // Clear kode lock for lock type
  if (type === "lock") {
    $(`#${type}InputKodeLock`).val("");
  }

  // Focus on first field for next entry
  $(`#${type}InputKode`).focus();

  // Update grand total
  updateGrandTotal(salesType);
}

// Fungsi simpan penjualan
// Print struk kasir
$("#btnPrintReceipt").on("click", function () {
  // Check if we have transaction data
  if (!window.currentTransaction) {
    alert("Tidak ada data transaksi untuk dicetak!");
    return;
  }

  const transaction = window.currentTransaction;
  const salesType = transaction.salesType;
  const tanggal = transaction.tanggal;
  const sales = transaction.sales;
  const totalHarga = transaction.totalHarga;
  const items = transaction.items;

  console.log("Printing receipt with data:", transaction); // Debug log

  // Generate receipt HTML
  let receiptHTML = `
    <div class="receipt">
      <h3>MELATI 3</h3>
      <h4>JL. DIPONEGORO NO. 116</h4>
      <h4>NOTA PENJUALAN ${salesType.toUpperCase()}</h4>
      <hr>
      <p>Tanggal: ${tanggal}<br>Sales: ${sales}</p>
      <hr>
      <table>
        <tr>
          <th>Kode</th>
          <th>Nama</th>
          <th>Gr</th>
          <th>Harga</th>
        </tr>
  `;

  // Add items to receipt
  items.forEach((item) => {
    receiptHTML += `
      <tr>
        <td>${item.kodeText || "-"}</td>
        <td>${item.nama || "-"}</td>
        <td>${item.berat || "-"}</td>
        <td>${parseInt(item.totalHarga).toLocaleString("id-ID")}</td>
      </tr>
    `;
  });

  // Add total
  receiptHTML += `
      <tr>
        <td colspan="3" style="text-align: right;"><strong>Total:</strong></td>
        <td><strong>${totalHarga}</strong></td>
      </tr>
    </table>
    <hr>
    <p style="text-align: center;">Terima Kasih<br>Atas Kunjungan Anda</p>
  </div>
  `;

  // Set receipt HTML to print area
  $("#printArea").html(receiptHTML);

  // Close modal and print
  $("#printModal").modal("hide");
  setTimeout(() => {
    window.print();
  }, 500);
});

// Print invoice customer
$("#btnPrintInvoice").on("click", function () {
  // Check if we have transaction data
  if (!window.currentTransaction) {
    alert("Tidak ada data transaksi untuk dicetak!");
    return;
  }

  const transaction = window.currentTransaction;
  const salesType = transaction.salesType;
  const tanggal = transaction.tanggal;
  const sales = transaction.sales;
  const totalHarga = transaction.totalHarga;
  const items = transaction.items;

  console.log("Printing invoice with data:", transaction); // Debug log

  // Generate invoice HTML
  let invoiceHTML = `
    <div class="invoice">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2>MELATI GOLD SHOP</h2>
        <h3>INVOICE PENJUALAN ${salesType.toUpperCase()}</h3>
      </div>
      
      <div style="margin-bottom: 20px;">
        <p><strong>Tanggal:</strong> ${tanggal}</p>
        <p><strong>Sales:</strong> ${sales}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Kode Barang</th>
            <th>Ptg</th>
            <th>Nama Barang</th>
            <th>Kadar</th>
            <th>Berat</th>
            <th>Harga</th>
          </tr>
        </thead>
        <tbody>
  `;

  // Add items to invoice
  items.forEach((item) => {
    invoiceHTML += `
      <tr>
        <td>${item.kodeText || "-"}</td>
        <td>${item.jumlah || "1"}</td>
        <td>${item.nama || "-"}</td>
        <td>${item.kadar || "-"}</td>
        <td>${item.berat || "-"}</td>
        <td>${parseInt(item.totalHarga).toLocaleString("id-ID")}</td>
      </tr>
    `;
  });

  // Add total
  invoiceHTML += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align: right;"><strong>Total:</strong></td>
            <td><strong>${totalHarga}</strong></td>
          </tr>
        </tfoot>
      </table>
      
      <div style="margin-top: 30px; display: flex; justify-content: space-between;">
        <div style="text-align: center;">
          <p>Customer</p>
          <br><br><br>
          <p>(______________)</p>
        </div>
        <div style="text-align: center;">
          <p>Hormat Kami</p>
          <br><br><br>
          <p>(______________)</p>
        </div>
      </div>
    </div>
  `;

  // Set invoice HTML to print area
  $("#printArea").html(invoiceHTML);

  // Close modal and print
  $("#printModal").modal("hide");
  setTimeout(() => {
    window.print();
  }, 500);
});

// Fungsi simpan penjualan
$("#btnSimpanPenjualan").on("click", async function () {
  try {
    // Validasi nama sales
    const salesName = $("#sales").val().trim();
    if (!salesName) {
      alert("Nama sales harus diisi!");
      $("#sales").focus();
      return;
    }

    const salesType = $("#jenisPenjualan").val();
    const tableSelector =
      salesType === "aksesoris"
        ? "#tableAksesorisDetail"
        : salesType === "kotak"
        ? "#tableKotakDetail"
        : salesType === "gantiLock"
        ? "#tableLockDetail"
        : "#tableManualDetail";

    // Check if table has rows
    if ($(tableSelector + " tbody tr:not(.input-row)").length === 0) {
      alert("Tidak ada barang yang ditambahkan!");
      return;
    }

    // Validasi pembayaran
    const paymentMethod = $("#metodeBayar").val();
    if (paymentMethod === "dp") {
      const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "").replace(",", ".")) || 0;
      const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;

      if (nominalDP <= 0 || nominalDP >= total) {
        alert(
          nominalDP <= 0 ? "Nominal DP harus diisi!" : "Nominal DP tidak boleh sama dengan atau melebihi total harga!"
        );
        $("#nominalDP").focus();
        return;
      }
    } else if (paymentMethod !== "free") {
      const jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "").replace(",", ".")) || 0;
      const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;

      if (jumlahBayar < total) {
        alert("Jumlah bayar kurang dari total!");
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
    } else if (salesType === "gantiLock") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const kodeLock = $(this).find("td:nth-child(3)").text();
        const kadar = $(this).find("td:nth-child(4)").text();
        const berat = parseFloat($(this).find("td:nth-child(5)").text()) || 0;
        const hargaPerGram =
          parseFloat($(this).find("td:nth-child(6)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find("td:nth-child(7)").text().replace(/\./g, "").replace(",", ".")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          kodeLock: kodeLock,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
        });
      });
    } else {
      // Manual - Tambahkan kolom keterangan
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const kadar = $(this).find("td:nth-child(3)").text();
        const berat = parseFloat($(this).find("td:nth-child(4)").text()) || 0;
        const hargaPerGram =
          parseFloat($(this).find("td:nth-child(5)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find("td:nth-child(6)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const keterangan = $(this).find("td:nth-child(7)").text() || "";

        items.push({
          kodeText: kode,
          nama: nama,
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

    // Save transaction to Firestore
    const docRef = await addDoc(collection(firestore, "penjualanAksesoris"), transactionData);
    console.log("Transaction saved with ID: ", docRef.id);

    // Update stock if not free
    if (paymentMethod !== "free") {
      await updateStock(salesType, transactionData.items);
    }

    // Show success message only after successful save
    alert("Transaksi berhasil disimpan!");

    // Store the current transaction data in a global variable for printing
    currentTransactionData = {
      id: docRef.id,
      salesType: salesType,
      tanggal: $("#tanggal").val(),
      sales: salesName,
      totalHarga: $("#totalOngkos").val(),
      items: items,
    };

    console.log("Current transaction data set:", currentTransactionData);

    // Trigger print modal
    $("#printModal").modal("show");

    // Reset form after modal is closed
    $("#printModal").on("hidden.bs.modal", function () {
      resetForm();
      // Remove the one-time event handler to prevent multiple bindings
      $("#printModal").off("hidden.bs.modal");
    });
  } catch (error) {
    console.error("Error saving transaction: ", error);
    alert("Terjadi kesalahan saat menyimpan transaksi: " + error.message);
  }
});

// Fungsi untuk print struk kasir
function printReceipt() {
  if (!currentTransactionData) {
    alert("Tidak ada data transaksi untuk dicetak!");
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
        }
        .receipt {
          width: 80mm;
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
        <hr>
  `;

  // Tambahkan keterangan jika ada
  if (hasKeterangan && transaction.salesType === "manual") {
    receiptHTML += `
        <div class="keterangan">
          <strong>Keterangan:</strong> ${keteranganText}
        </div>
    `;
  }

  receiptHTML += `
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

// Fungsi untuk print invoice customer
function printInvoice() {
  if (!currentTransactionData) {
    alert("Tidak ada data transaksi untuk dicetak!");
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
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          margin: 0;
          padding: 0;
        }
        .invoice {
          width: 210mm;
          margin: 0 auto;
          padding: 10mm;
        }
        .invoice h2, .invoice h3 {
          text-align: center;
          margin: 5mm 0;
        }
        .invoice table {
          width: 100%;
          border-collapse: collapse;
          margin: 5mm 0;
        }
        .invoice table, .invoice td {
          border: 1px solid #000;
        }
        .invoice td {
          padding: 2mm;
          text-align: left;
        }
        .text-center {
          text-align: center;
        }
        .text-right {
          text-align: right;
        }
        .signature-area {
          display: flex;
          justify-content: space-between;
          margin-top: 30px;
        }
        .signature-box {
          text-align: center;
          width: 40%;
        }
        .keterangan {
          margin-top: 5mm;
          padding: 2mm;
          border: 1px solid #000;
          font-style: italic;
        }
      </style>
    </head>
    <body>
     <div class="invoice">
        <h2>MELATI GOLD SHOP</h2>
        <h3>INVOICE PENJUALAN ${transaction.salesType.toUpperCase()}</h3>
        
        <div>
          <p><strong>Tanggal:</strong> ${transaction.tanggal}</p>
          <p><strong>Sales:</strong> ${transaction.sales}</p>
        </div>
        
        <table>
          <tbody>
  `;

  // Tambahkan item ke invoice
  let hasKeterangan = false;

  transaction.items.forEach((item) => {
    if (item.keterangan && item.keterangan.trim() !== "") {
      hasKeterangan = true;
    }

    invoiceHTML += `
      <tr>
        <td>${item.kodeText || "-"}</td>
        <td>${item.jumlah || "1"}</td>
        <td>${item.nama || "-"}</td>
        <td>${item.kadar || "-"}</td>
        <td>${item.berat || "-"}</td>
        <td class="text-right">${parseInt(item.totalHarga).toLocaleString("id-ID")}</td>
        ${transaction.salesType === "manual" ? `<td>${item.keterangan || "-"}</td>` : ""}
      </tr>
    `;
  });

  // Tambahkan total
  invoiceHTML += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="${
                transaction.salesType === "manual" ? "6" : "5"
              }" class="text-right"><strong>Total:</strong></td>
              <td class="text-right"><strong>${transaction.totalHarga}</strong></td>
              ${transaction.salesType === "manual" ? "<td></td>" : ""}
            </tr>
          </tfoot>
        </table>
        
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
        : salesType === "gantiLock"
        ? "#tableLockDetail"
        : "#tableManualDetail";

    // Periksa apakah ada item di tabel
    if ($(tableSelector + " tbody tr:not(.input-row)").length === 0) {
      alert("Tidak ada data transaksi untuk dicetak. Simpan transaksi terlebih dahulu.");
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
    } else if (salesType === "gantiLock") {
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const kodeLock = $(this).find("td:nth-child(3)").text();
        const kadar = $(this).find("td:nth-child(4)").text();
        const berat = parseFloat($(this).find("td:nth-child(5)").text()) || 0;
        const hargaPerGram =
          parseFloat($(this).find("td:nth-child(6)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find("td:nth-child(7)").text().replace(/\./g, "").replace(",", ".")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          kodeLock: kodeLock,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
        });
      });
    } else {
      // Manual
      $(tableSelector + " tbody tr:not(.input-row)").each(function () {
        const kode = $(this).find("td:nth-child(1)").text();
        const nama = $(this).find("td:nth-child(2)").text();
        const kadar = $(this).find("td:nth-child(3)").text();
        const berat = parseFloat($(this).find("td:nth-child(4)").text()) || 0;
        const hargaPerGram =
          parseFloat($(this).find("td:nth-child(5)").text().replace(/\./g, "").replace(",", ".")) || 0;
        const totalHarga = parseFloat($(this).find("td:nth-child(6)").text().replace(/\./g, "").replace(",", ".")) || 0;

        items.push({
          kodeText: kode,
          nama: nama,
          kadar: kadar,
          berat: berat,
          hargaPerGram: hargaPerGram,
          totalHarga: totalHarga,
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
    };

    console.log("Created transaction data from form:", currentTransactionData);
  }

  // Tampilkan modal print
  $("#printModal").modal("show");
});

// Tambahkan event listener untuk tombol print di modal
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

  console.log("Print event handlers initialized");
});

// Helper function untuk format tanggal
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Variabel untuk menandai apakah print dipanggil setelah simpan
let printAfterSave = false;

// Modifikasi event handler untuk modal print
$("#printModal").on("show.bs.modal", function () {
  if (printAfterSave) {
    // Jika dipanggil setelah simpan, tambahkan pesan
    $(this).find(".modal-body").prepend(`
      <div class="alert alert-success mb-3">
        <i class="fas fa-check-circle me-2"></i>
        Transaksi berhasil disimpan! Silakan pilih jenis nota yang akan dicetak.
      </div>
    `);

    // Reset flag
    printAfterSave = false;
  } else {
    // Hapus pesan jika ada
    $(this).find(".alert").remove();
  }
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

// Fungsi untuk menambahkan baris input pada tabel ganti lock
function addLockInputRow() {
  const inputRow = `
    <tr class="input-row">
      <td><input type="text" class="form-control form-control-sm" id="lockInputKode" placeholder="Kode"></td>
      <td><input type="text" class="form-control form-control-sm" id="lockInputNamaBarang" placeholder="Nama barang"></td>
      <td>
        <div class="input-group input-group-sm">
          <input type="text" class="form-control" id="lockInputKodeLock" placeholder="Pilih kode" readonly>
          <button class="btn btn-outline-secondary" id="lockBtnPilihKodeLock" type="button">
            <i class="fas fa-search"></i>
          </button>
        </div>
      </td>
      <td><input type="text" class="form-control form-control-sm" id="lockInputKadar" placeholder="Kadar"></td>
      <td><input type="text" class="form-control form-control-sm" id="lockInputBerat" placeholder="0.00"></td>
      <td><input type="text" class="form-control form-control-sm" id="lockInputHargaPerGram" placeholder="0" readonly></td>
      <td><input type="text" class="form-control form-control-sm" id="lockInputTotalHarga" placeholder="0"></td>
      <td></td>
    </tr>
  `;

  // Add input row to table
  $("#tableLockDetail tbody").append(inputRow);
}

// Fungsi untuk menambahkan baris input pada tabel manual
function addManualInputRow() {
  const inputRow = `
    <tr class="input-row">
      <td><input type="text" class="form-control form-control-sm" id="manualInputKode" placeholder="Kode"></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputNamaBarang" placeholder="Nama barang"></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputKadar" placeholder="Kadar"></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputBerat" placeholder="0.00"></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputHargaPerGram" placeholder="0" readonly></td>
      <td><input type="text" class="form-control form-control-sm" id="manualInputTotalHarga" placeholder="0"></td>
      <td></td>
    </tr>
  `;

  // Add input row to table
  $("#tableManualDetail tbody").append(inputRow);
}

// Fungsi untuk reset form setelah simpan
function resetFormAfterSave() {
  // Simpan jenis penjualan saat ini
  const currentSalesType = $("#jenisPenjualan").val();

  // Reset semua tabel
  $("#tableAksesorisDetail tbody, #tableKotakDetail tbody, #tableLockDetail tbody, #tableManualDetail tbody").empty();

  // Reset total-total
  $("#grand-total-aksesoris, #grand-total-kotak, #grand-total-lock, #grand-total-manual").text("0");

  // Reset form pembayaran
  $("#totalOngkos").val("0");
  $("#jumlahBayar").val("");
  $("#kembalian").val("0");
  $("#nominalDP").val("");
  $("#sisaPembayaran").val("0");

  // Refresh UI untuk jenis penjualan yang sama
  updateUIForSalesType(currentSalesType);

  // Jika jenis penjualan adalah gantiLock atau manual, tambahkan baris input baru
  if (currentSalesType === "gantiLock") {
    resetTableAndAddInputRow("lock");
  } else if (currentSalesType === "manual") {
    resetTableAndAddInputRow("manual");
  }

  // Fokus ke field pertama yang relevan
  if (currentSalesType === "aksesoris" || currentSalesType === "kotak") {
    $("#btnTambah").focus();
  } else if (currentSalesType === "gantiLock") {
    $("#lockInputKode").focus();
  } else if (currentSalesType === "manual") {
    $("#manualInputKode").focus();
  }
}

// Print struk kasir
$("#btnPrintReceipt").on("click", function () {
  // Check if we have transaction data
  if (!window.currentTransaction) {
    alert("Tidak ada data transaksi untuk dicetak!");
    return;
  }

  const transaction = window.currentTransaction;
  const salesType = transaction.salesType;
  const tanggal = transaction.tanggal;
  const sales = transaction.sales;
  const totalHarga = transaction.totalHarga;
  const items = transaction.items;

  console.log("Printing receipt with data:", transaction); // Debug log

  // Generate receipt HTML
  let receiptHTML = `
    <div class="receipt">
      <h3>MELATI 3</h3>
      <h4>JL. DIPONEGORO NO. 116</h4>
      <h4>NOTA PENJUALAN ${salesType.toUpperCase()}</h4>
      <hr>
      <p>Tanggal: ${tanggal}<br>Sales: ${sales}</p>
      <hr>
      <table>
        <tr>
          <th>Kode</th>
          <th>Nama</th>
          <th>Gr</th>
          <th>Harga</th>
        </tr>
  `;

  // Add items to receipt
  items.forEach((item) => {
    receiptHTML += `
      <tr>
        <td>${item.kodeText || "-"}</td>
        <td>${item.nama || "-"}</td>
        <td>${item.berat || "-"}</td>
        <td>${parseInt(item.totalHarga).toLocaleString("id-ID")}</td>
      </tr>
    `;
  });

  // Add total
  receiptHTML += `
      <tr>
        <td colspan="3" style="text-align: right;"><strong>Total:</strong></td>
        <td><strong>${totalHarga}</strong></td>
      </tr>
    </table>
    <hr>
    <p style="text-align: center;">Terima Kasih<br>Atas Kunjungan Anda</p>
  </div>
  `;

  // Set receipt HTML to print area
  $("#printArea").html(receiptHTML);

  // Close modal and print
  $("#printModal").modal("hide");
  setTimeout(() => {
    window.print();
  }, 500);
});

// Print invoice customer
$("#btnPrintInvoice").on("click", function () {
  // Check if we have transaction data
  if (!window.currentTransaction) {
    alert("Tidak ada data transaksi untuk dicetak!");
    return;
  }

  const transaction = window.currentTransaction;
  const salesType = transaction.salesType;
  const tanggal = transaction.tanggal;
  const sales = transaction.sales;
  const totalHarga = transaction.totalHarga;
  const items = transaction.items;

  console.log("Printing invoice with data:", transaction); // Debug log

  // Generate invoice HTML
  let invoiceHTML = `
    <div class="invoice">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2>MELATI GOLD SHOP</h2>
        <h3>INVOICE PENJUALAN ${salesType.toUpperCase()}</h3>
      </div>
      
      <div style="margin-bottom: 20px;">
        <p><strong>Tanggal:</strong> ${tanggal}</p>
        <p><strong>Sales:</strong> ${sales}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Kode Barang</th>
            <th>Ptg</th>
            <th>Nama Barang</th>
            <th>Kadar</th>
            <th>Berat</th>
            <th>Harga</th>
          </tr>
        </thead>
        <tbody>
  `;

  // Add items to invoice
  items.forEach((item) => {
    invoiceHTML += `
      <tr>
        <td>${item.kodeText || "-"}</td>
        <td>${item.jumlah || "1"}</td>
        <td>${item.nama || "-"}</td>
        <td>${item.kadar || "-"}</td>
        <td>${item.berat || "-"}</td>
        <td>${parseInt(item.totalHarga).toLocaleString("id-ID")}</td>
      </tr>
    `;
  });

  // Add total
  invoiceHTML += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align: right;"><strong>Total:</strong></td>
            <td><strong>${totalHarga}</strong></td>
          </tr>
        </tfoot>
      </table>
      
      <div style="margin-top: 30px; display: flex; justify-content: space-between;">
        <div style="text-align: center;">
          <p>Customer</p>
          <br><br><br>
          <p>(______________)</p>
        </div>
        <div style="text-align: center;">
          <p>Hormat Kami</p>
          <br><br><br>
          <p>(______________)</p>
        </div>
      </div>
    </div>
  `;

  // Set invoice HTML to print area
  $("#printArea").html(invoiceHTML);

  // Close modal and print
  $("#printModal").modal("hide");
  setTimeout(() => {
    window.print();
  }, 500);
});

// Fungsi untuk memperbarui stok setelah penjualan
async function updateStock(salesType, items) {
  try {
    // Untuk setiap item yang dijual, update stok di Firestore
    for (const item of items) {
      const kode = item.kodeText;

      // Skip jika tidak ada kode atau jenis penjualan adalah gantiLock atau manual
      if (!kode || salesType === "gantiLock" || salesType === "manual") continue;

      // Cari dokumen stok berdasarkan kode
      const stockQuery = query(collection(firestore, "stokAksesoris"), where("kode", "==", kode));

      const stockSnapshot = await getDocs(stockQuery);

      if (!stockSnapshot.empty) {
        // Dokumen stok ditemukan
        const stockDoc = stockSnapshot.docs[0];
        const stockData = stockDoc.data();
        const currentStock = stockData.stokAkhir || 0;
        const jumlah = parseInt(item.jumlah) || 1;

        // Hitung stok baru
        let newStock = Math.max(0, currentStock - jumlah);

        // Update stok di Firestore
        await updateDoc(doc(firestore, "stokAksesoris", stockDoc.id), {
          stokAkhir: newStock,
          lastUpdate: serverTimestamp(),
        });

        // Tambahkan log transaksi stok
        await addDoc(collection(firestore, "stokAksesorisTransaksi"), {
          kode: kode,
          nama: item.nama || "",
          kategori: salesType === "kotak" ? "kotak" : "aksesoris",
          jenis: salesType === "free" ? "free" : "laku",
          jumlah: jumlah,
          stokSebelum: currentStock,
          stokSesudah: newStock,
          timestamp: serverTimestamp(),
          keterangan: `Penjualan ${salesType} oleh ${$("#sales").val() || "Admin"}`,
        });
      } else {
        // Jika stok tidak ditemukan, buat dokumen baru
        console.warn(`Stok untuk kode ${kode} tidak ditemukan, membuat data baru`);

        // Tambahkan dokumen stok baru
        await addDoc(collection(firestore, "stokAksesoris"), {
          kode: kode,
          nama: item.nama || "",
          kategori: salesType === "kotak" ? "kotak" : "aksesoris",
          stokAwal: 0,
          stokAkhir: 0, // Stok sudah terjual
          lastUpdate: serverTimestamp(),
        });

        // Tambahkan log transaksi stok
        await addDoc(collection(firestore, "stokAksesorisTransaksi"), {
          kode: kode,
          nama: item.nama || "",
          kategori: salesType === "kotak" ? "kotak" : "aksesoris",
          jenis: salesType === "free" ? "free" : "laku",
          jumlah: parseInt(item.jumlah) || 1,
          stokSebelum: 0,
          stokSesudah: 0,
          timestamp: serverTimestamp(),
          keterangan: `Penjualan ${salesType} oleh ${$("#sales").val() || "Admin"}`,
        });
      }
    }

    console.log("Stock updated successfully");
    return true;
  } catch (error) {
    console.error("Error updating stock:", error);
    throw error; // Re-throw untuk penanganan di fungsi pemanggil
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

    // Keep sales name (don't reset it for convenience)

    // Clear all tables
    $("#tableAksesorisDetail tbody").empty();
    $("#tableKotakDetail tbody").empty();
    $("#tableLockDetail tbody").empty();
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
    $("#grand-total-lock").text("0");
    $("#grand-total-manual").text("0");

    console.log("Form reset successfully");
  } catch (error) {
    console.error("Error resetting form:", error);
  }
}

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
