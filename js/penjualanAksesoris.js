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

// Wait for document to be ready
$(document).ready(function () {
  // Initialize datepicker
  $("#tanggal").datepicker({
    format: "dd/mm/yyyy",
    autoclose: true,
    language: "id",
    todayHighlight: true,
  });

  // Initialize UI for default sales type
  updateUIForSalesType("aksesoris");

  // Initialize payment method options
  updatePaymentMethodOptions("aksesoris");

  // Set today's date automatically
  const today = new Date();
  const formattedDate =
    today.getDate().toString().padStart(2, "0") +
    "/" +
    (today.getMonth() + 1).toString().padStart(2, "0") +
    "/" +
    today.getFullYear();
  $("#tanggal").datepicker("setDate", today);

  // Calendar icon click handler
  $("#calendarIcon").on("click", function () {
    $("#tanggal").datepicker("show");
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
  }

  // Function to add aksesoris to table
  function addAksesorisToTable(kode, nama, stok, harga) {
    // Default values
    const jumlah = 1;
    const berat = 0;
    const totalHarga = 0;

    // Create new row
    const newRow = `
      <tr>
        <td>${kode}</td>
        <td>${nama}</td>
        <td>
          <input type="number" class="form-control form-control-sm jumlah-input" value="${jumlah}" min="1" max="${stok}">
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

    // Focus on the berat input of the new row
    const $newRow = $("#tableAksesorisDetail tbody tr:last-child");
    $newRow.find(".berat-input").focus();

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

    // Add free option only for kotak sales type
    if (salesType === "kotak") {
      $("#metodeBayar").append('<option value="free" class="kotak-only">Free</option>');
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
        $(".kotak-only").hide();
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
    }

    $("#detailTitle").text(detailTitle);

    // Update payment method options
    updatePaymentMethodOptions(type);
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

      // Get values from input row
      const kode = $(`#${type}InputKode`).val() || "-";
      const namaBarang = $(`#${type}InputNamaBarang`).val();
      const jumlah = $(`#${type}InputJumlah`).val() || 1;
      const berat = $(`#${type}InputBerat`).val() || 0;
      const totalHargaValue = $(`#${type}InputTotalHarga`).val() || "0";
      const totalHarga = parseFloat(totalHargaValue.replace(/\./g, "").replace(",", ".")) || 0;
      const hargaPerGram = $(`#${type}InputHargaPerGram`).val() || "0";

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

      // Determine target table
      let tableSelector;
      if (salesType === "gantiLock") {
        tableSelector = "#tableLockDetail";
      } else {
        // manual
        tableSelector = "#tableManualDetail";
      }

      // Create new row
      const newRow = `
      <tr>
        <td>${kode}</td>
        <td>${namaBarang}</td>
        <td>${jumlah}</td>
        <td>${berat}</td>
        <td>${hargaPerGram}</td>
        <td class="total-harga">${parseInt(totalHarga).toLocaleString("id-ID")}</td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;

      // Add row to table before input row
      $(tableSelector + " tbody").append(newRow);

      // Clear input row
      $(`#${type}InputKode`).val("");
      $(`#${type}InputNamaBarang`).val("");
      $(`#${type}InputJumlah`).val("1");
      $(`#${type}InputBerat`).val("");
      $(`#${type}InputHargaPerGram`).val("");
      $(`#${type}InputTotalHarga`).val("");

      // Focus on first field for next entry
      $(`#${type}InputKode`).focus();

      // Update grand total
      updateGrandTotal(salesType);
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
    let total = 0;
    let tableSelector;
    let totalSelector;

    switch (salesType) {
      case "aksesoris":
        tableSelector = "#tableAksesorisDetail tbody tr:not(.input-row)";
        totalSelector = "#grand-total-aksesoris";

        // Calculate total from total-harga-input values
        $(tableSelector).each(function () {
          const totalHargaInput = $(this).find(".total-harga-input").val() || "0";
          total += parseFloat(totalHargaInput.replace(/\./g, "").replace(",", ".")) || 0;
        });
        break;
      case "kotak":
        tableSelector = "#tableKotakDetail tbody tr:not(.input-row)";
        totalSelector = "#grand-total-kotak";

        // Calculate total from table rows (excluding input row)
        $(tableSelector).each(function () {
          const rowTotal = $(this).find(".total-harga").text() || $(this).find("td:nth-last-child(2)").text();
          total += parseFloat(rowTotal.replace(/\./g, "").replace(",", ".")) || 0;
        });
        break;
      case "gantiLock":
        tableSelector = "#tableLockDetail tbody tr:not(.input-row)";
        totalSelector = "#grand-total-lock";

        // Calculate total from table rows (excluding input row)
        $(tableSelector).each(function () {
          const rowTotal = $(this).find(".total-harga").text() || $(this).find("td:nth-last-child(2)").text();
          total += parseFloat(rowTotal.replace(/\./g, "").replace(",", ".")) || 0;
        });
        break;
      case "manual":
        tableSelector = "#tableManualDetail tbody tr:not(.input-row)";
        totalSelector = "#grand-total-manual";

        // Calculate total from table rows (excluding input row)
        $(tableSelector).each(function () {
          const rowTotal = $(this).find(".total-harga").text() || $(this).find("td:nth-last-child(2)").text();
          total += parseFloat(rowTotal.replace(/\./g, "").replace(",", ".")) || 0;
        });
        break;
    }

    // Update the grand total display
    $(totalSelector).text(total.toLocaleString("id-ID"));

    // Update the payment total
    updateTotal();
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

  // Function to reset table and add input row
  function resetTableAndAddInputRow(type) {
    let tableSelector;

    if (type === "lock") {
      tableSelector = "#tableLockDetail";
    } else {
      // manual
      tableSelector = "#tableManualDetail";
    }

    // Clear existing rows except for the input row
    $(tableSelector + " tbody tr:not(.input-row)").remove();

    // Remove existing input row if any
    $(tableSelector + " tbody tr.input-row").remove();

    // Create input row
    const inputRow = `
    <tr class="input-row">
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
    $(tableSelector + " tbody").append(inputRow);

    // Add event listeners for total price calculation
    $(`#${type}InputBerat, #${type}InputTotalHarga`).on("input", function () {
      calculateHargaPerGram(type);
    });

    // Focus on first field
    $(`#${type}InputKode`).focus();
  }

  // Save transaction
  $("#btnSimpanPenjualan").on("click", function () {
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
    if ($(tableSelector + " tbody tr").length === 0) {
      alert("Tidak ada barang yang ditambahkan!");
      return;
    }
  
    // Check payment method
    const paymentMethod = $("#metodeBayar").val();
    if (paymentMethod === "dp") {
      const nominalDP = parseFloat($("#nominalDP").val().replace(/\./g, "").replace(",", ".")) || 0;
      const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;
      
      if (nominalDP <= 0) {
        alert("Nominal DP harus diisi!");
        $("#nominalDP").focus();
        return;
      }
      
      if (nominalDP >= total) {
        alert("Nominal DP tidak boleh sama dengan atau melebihi total harga!");
        $("#nominalDP").focus();
        return;
      }
      
      const jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "").replace(",", ".")) || 0;
      const sisaPembayaran = parseFloat($("#sisaPembayaran").val().replace(/\./g, "").replace(",", ".")) || 0;
      
      if (jumlahBayar < sisaPembayaran) {
        alert("Jumlah bayar kurang dari sisa pembayaran!");
        $("#jumlahBayar").focus();
        return;
      }
    } else if (paymentMethod !== "free") {
      const jumlahBayar = parseFloat($("#jumlahBayar").val().replace(/\./g, "").replace(",", ".")) || 0;
      const total = parseFloat($("#totalOngkos").val().replace(/\./g, "").replace(",", ".")) || 0;
  
      if (jumlahBayar < total) {
        alert("Jumlah bayar kurang dari total!");
        return;
      }
    }
  
    // Here you would normally save the transaction to your database
    alert("Transaksi berhasil disimpan!");
  
    // Enable print button
    $("#btnCetak").prop("disabled", false);
  });

  // Print receipt
  $("#btnCetak").on("click", function () {
    // Here you would normally open a print dialog or redirect to a print page
    alert("Fitur cetak nota akan segera tersedia!");
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
});
