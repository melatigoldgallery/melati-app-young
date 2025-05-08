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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Wait for document to be ready
$(document).ready(function() {
  // Initialize datepicker
  $('#tanggal').datepicker({
    format: 'dd/mm/yyyy',
    autoclose: true,
    language: 'id',
    todayHighlight: true
  });
  
  // Set today's date automatically
  const today = new Date();
  const formattedDate = today.getDate().toString().padStart(2, '0') + '/' + 
                      (today.getMonth() + 1).toString().padStart(2, '0') + '/' + 
                      today.getFullYear();
  $('#tanggal').datepicker('setDate', today);
  
  // Calendar icon click handler
  $('#calendarIcon').on('click', function() {
    $('#tanggal').datepicker('show');
  });

  // Stock data cache
  const stockCache = {
    data: null,
    lastFetched: null
  };

  // Load stock data on page load
  loadStockData();

  // Function to load stock data from Firestore
  async function loadStockData() {
    try {
      // Check cache validity (cache expires after 5 minutes)
      const now = new Date().getTime();
      const cacheExpiry = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      if (stockCache.lastFetched && 
          (now - stockCache.lastFetched) < cacheExpiry &&
          stockCache.data) {
        
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
          ...doc.data()
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
    const aksesorisTable = $('#tableAksesoris tbody');
    aksesorisTable.empty();
    
    const aksesorisItems = stockData.filter(item => item.kategori === 'aksesoris');
    
    if (aksesorisItems.length === 0) {
      aksesorisTable.append('<tr><td colspan="5" class="text-center">Tidak ada data aksesoris</td></tr>');
    } else {
      aksesorisItems.forEach(item => {
        const row = `
          <tr>
            <td>${item.kode || '-'}</td>
            <td>${item.nama || '-'}</td>
            <td>${item.stokAkhir || 0}</td>
            <td>${item.hargaJual ? parseInt(item.hargaJual).toLocaleString('id-ID') : '0'}</td>
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
    const kotakTable = $('#tableKotak tbody');
    kotakTable.empty();
    
    const kotakItems = stockData.filter(item => item.kategori === 'kotak');
    
    if (kotakItems.length === 0) {
      kotakTable.append('<tr><td colspan="5" class="text-center">Tidak ada data kotak</td></tr>');
    } else {
      kotakItems.forEach(item => {
        const row = `
          <tr>
            <td>${item.kode || '-'}</td>
            <td>${item.nama || '-'}</td>
            <td>${item.stokAkhir || 0}</td>
            <td>${item.hargaJual ? parseInt(item.hargaJual).toLocaleString('id-ID') : '0'}</td>
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
    $(document).off('click', '.btn-pilih-aksesoris').on('click', '.btn-pilih-aksesoris', function() {
      const kode = $(this).data('kode');
      const nama = $(this).data('nama');
      const stok = $(this).data('stok');
      const harga = $(this).data('harga');
      
      // Add to table
      addAksesorisToTable(kode, nama, stok, harga);
      
      // Close modal
      $('#modalPilihAksesoris').modal('hide');
    });
    
    // Kotak pilih button
    $(document).off('click', '.btn-pilih-kotak').on('click', '.btn-pilih-kotak', function() {
      const kode = $(this).data('kode');
      const nama = $(this).data('nama');
      const stok = $(this).data('stok');
      const harga = $(this).data('harga');
      
      // Add to table
      addKotakToTable(kode, nama, stok, harga);
      
      // Close modal
      $('#modalPilihKotak').modal('hide');
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
          <input type="number" class="form-control form-control-sm berat-input" value="${berat}" min="0.01" step="0.01">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm harga-input" value="${parseInt(harga).toLocaleString('id-ID')}">
        </td>
        <td class="total-harga">0</td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
    
    // Add row to table
    $('#tableAksesorisDetail tbody').append(newRow);
    
    // Focus on the berat input of the new row
    const $newRow = $('#tableAksesorisDetail tbody tr:last-child');
    $newRow.find('.berat-input').focus();
    
    // Attach event handlers to the new row
    attachRowEventHandlers($newRow);
    
    // Update grand total
    updateGrandTotal('aksesoris');
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
        <td>${parseInt(harga).toLocaleString('id-ID')}</td>
        <td class="total-harga">${parseInt(totalHarga).toLocaleString('id-ID')}</td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
    
    // Add row to table
    $('#tableKotakDetail tbody').append(newRow);
    
    // Focus on the jumlah input of the new row
    const $newRow = $('#tableKotakDetail tbody tr:last-child');
    $newRow.find('.jumlah-input').focus();
    
    // Attach event handlers to the new row
    attachRowEventHandlers($newRow);
    
    // Update grand total
    updateGrandTotal('kotak');
  }

  // Function to attach event handlers to row inputs
  function attachRowEventHandlers($row) {
    // For aksesoris rows
    if ($row.closest('table').attr('id') === 'tableAksesorisDetail') {
      const $jumlahInput = $row.find('.jumlah-input');
      const $beratInput = $row.find('.berat-input');
      const $hargaInput = $row.find('.harga-input');
      const $totalCell = $row.find('.total-harga');
      
      // Calculate total on input change
      $jumlahInput.add($beratInput).add($hargaInput).on('input', function() {
        const jumlah = parseInt($jumlahInput.val()) || 0;
        const berat = parseFloat($beratInput.val()) || 0;
        const harga = parseInt($hargaInput.val().replace(/\./g, '')) || 0;
        
        const total = jumlah * berat * harga;
        $totalCell.text(total.toLocaleString('id-ID'));
        
        // Update grand total
        updateGrandTotal('aksesoris');
      });
      
      // Format harga with thousand separator
      $hargaInput.on('blur', function() {
        const value = $(this).val().replace(/\./g, '');
        $(this).val(parseInt(value || 0).toLocaleString('id-ID'));
      });
    }
    
    // For kotak rows
    if ($row.closest('table').attr('id') === 'tableKotakDetail') {
      const $jumlahInput = $row.find('.jumlah-input');
      const $totalCell = $row.find('.total-harga');
      const hargaText = $row.find('td:nth-child(4)').text();
      const harga = parseInt(hargaText.replace(/\./g, '')) || 0;
      
      // Calculate total on input change
      $jumlahInput.on('input', function() {
        const jumlah = parseInt($(this).val()) || 0;
        const total = jumlah * harga;
        $totalCell.text(total.toLocaleString('id-ID'));
        
        // Update grand total
        updateGrandTotal('kotak');
      });
    }
    
    // Delete button handler
    $row.find('.btn-delete').on('click', function() {
      const tableId = $row.closest('table').attr('id');
      const salesType = tableId === 'tableAksesorisDetail' ? 'aksesoris' : 'kotak';
      
      $row.remove();
      updateGrandTotal(salesType);
    });
  }

  // Calculate total price based on input values
  function calculateTotalPrice() {
    const jumlah = parseFloat($('#inputJumlah').val()) || 0;
    const berat = parseFloat($('#inputBerat').val()) || 0;
    const hargaPerGram = parseFloat($('#inputHargaPerGram').val()) || 0;
    
    const totalHarga = jumlah * berat * hargaPerGram;
    $('#inputTotalHarga').val(totalHarga.toLocaleString('id-ID'));
    
    return totalHarga;
  }

  // Add event listeners to calculate total price
  $('#inputJumlah, #inputBerat, #inputHargaPerGram').on('input', calculateTotalPrice);

  // Handle sales type change
  $('#jenisPenjualan').on('change', function() {
    const selectedType = $(this).val();
    
    // Update UI based on selected type
    updateUIForSalesType(selectedType);
  });

  // Function to update UI based on sales type
  function updateUIForSalesType(type) {
    // Hide all tables first
    $('#tableAksesorisDetail, #tableKotakDetail').hide();
    
    // Hide/show appropriate buttons
    $('.catalog-select, .direct-entry').hide();
    
    // Update detail title
    let detailTitle = 'Detail Barang';
    
    // Show appropriate table based on type
    switch(type) {
      case 'aksesoris':
        $('#tableAksesorisDetail').show();
        $('.catalog-select').show();
        detailTitle = 'Detail Aksesoris';
        $('.kotak-only').hide();
        $('.payment-field').show();
        break;
      case 'kotak':
        $('#tableKotakDetail').show();
        $('.catalog-select').show();
        detailTitle = 'Detail Kotak';
        $('.kotak-only').show();
        $('.payment-field').show();
        break;
      case 'gantiLock':
        $('#directEntryForm').show();
        $('.direct-entry').show();
        detailTitle = 'Detail Penggantian Lock';
        $('.kotak-only').hide();
        $('.payment-field').show();
        break;
      case 'manual':
        $('#directEntryForm').show();
        $('.direct-entry').show();
        detailTitle = 'Detail Penjualan Manual';
        $('.kotak-only').hide();
        $('.payment-field').show();
        break;
    }
    
    $('#detailTitle').text(detailTitle);
  }

  // Handle adding item from direct entry form
  $('#btnTambahItem').on('click', function() {
    const salesType = $('#jenisPenjualan').val();
    const kode = $('#inputKode').val() || '-';
    const namaBarang = $('#inputNamaBarang').val();
    const jumlah = $('#inputJumlah').val();
    const berat = $('#inputBerat').val();
    const hargaPerGram = $('#inputHargaPerGram').val();
    const totalHarga = calculateTotalPrice();
    
    if (!namaBarang) {
      alert('Nama barang harus diisi!');
      return;
    }
    
    // Create new row
    const newRow = `
      <tr>
        <td>${kode}</td>
        <td>${namaBarang}</td>
        <td>${jumlah}</td>
        <td>${berat}</td>
        <td>${parseInt(hargaPerGram).toLocaleString('id-ID')}</td>
        <td>${totalHarga.toLocaleString('id-ID')}</td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
    
    // Add row to appropriate table
    let tableBody;
    if (salesType === 'gantiLock') {
      tableBody = $('#tableLockDetail tbody');
    } else if (salesType === 'manual') {
      tableBody = $('#tableManualDetail tbody');
    }
    
    tableBody.append(newRow);
    
    // Clear form
    $('#inputKode').val('');
    $('#inputNamaBarang').val('');
    $('#inputJumlah').val('1');
    $('#inputBerat').val('');
    $('#inputHargaPerGram').val('');
    $('#inputTotalHarga').val('0');
    
    // Update grand total
    updateGrandTotal(salesType);
  });

  // Add new row for direct entry (Ganti Lock and Manual)
  $('#btnTambahBaris').on('click', function() {
    // Clear the form fields first
    $('#inputKode').val('');
    $('#inputNamaBarang').val('');
    $('#inputJumlah').val('1');
    $('#inputBerat').val('');
    $('#inputHargaPerGram').val('');
    $('#inputTotalHarga').val('0');
    
    // Focus on the first field of the direct entry form
    $('#inputKode').focus();
    
    // Make sure the direct entry form is visible
    $('#directEntryForm').show();
  });

  // Handle "Pilih Kode" button click
  $('#btnTambah').on('click', function() {
    const salesType = $('#jenisPenjualan').val();
    
    // Show the appropriate modal based on sales type
    if (salesType === 'aksesoris') {
      $('#modalPilihAksesoris').modal('show');
    } else if (salesType === 'kotak') {
      $('#modalPilihKotak').modal('show');
    }
  });

  // Handle delete button click for all tables
  $(document).on('click', '.btn-delete', function() {
    const salesType = $('#jenisPenjualan').val();
    $(this).closest('tr').remove();
    updateGrandTotal(salesType);
  });

  // Handle payment method change
  $('#metodeBayar').on('change', function() {
    const method = $(this).val();
    if (method === 'free') {
      // If free, hide payment fields and set total to 0
      $('.payment-field').hide();
      $('#totalOngkos').val('0');
    } else {
      $('.payment-field').show();
      // Recalculate total based on current items
      updateTotal();
    }
  });

  // Function to update grand total for a specific sales type
  function updateGrandTotal(salesType) {
    let total = 0;
    let tableSelector;
    let totalSelector;
    
    switch(salesType) {
      case 'aksesoris':
        tableSelector = '#tableAksesorisDetail tbody tr';
        totalSelector = '#grand-total-aksesoris';
        break;
      case 'kotak':
        tableSelector = '#tableKotakDetail tbody tr';
        totalSelector = '#grand-total-kotak';
        break;
      case 'gantiLock':
        tableSelector = '#tableLockDetail tbody tr';
        totalSelector = '#grand-total-lock';
        break;
      case 'manual':
        tableSelector = '#tableManualDetail tbody tr';
        totalSelector = '#grand-total-manual';
        break;
    }
    
    // Calculate total from table rows
    $(tableSelector).each(function() {
      const rowTotal = $(this).find('.total-harga').text() || 
                      $(this).find('td:nth-last-child(2)').text();
      total += parseFloat(rowTotal.replace(/\./g, '').replace(',', '.')) || 0;
    });
    
    // Update the grand total display
    $(totalSelector).text(total.toLocaleString('id-ID'));
    
    // Update the payment total
    updateTotal();
  }

  // Function to update total based on current sales type
  function updateTotal() {
    const salesType = $('#jenisPenjualan').val();
    const paymentMethod = $('#metodeBayar').val();
    
    // If payment method is free, set total to 0
    if (paymentMethod === 'free') {
      $('#totalOngkos').val('0');
      return;
    }
    
    let total = 0;
    
    switch(salesType) {
      case 'aksesoris':
        total = parseFloat($('#grand-total-aksesoris').text().replace(/\./g, '').replace(',', '.')) || 0;
        break;
      case 'kotak':
        total = parseFloat($('#grand-total-kotak').text().replace(/\./g, '').replace(',', '.')) || 0;
        break;
      case 'gantiLock':
        total = parseFloat($('#grand-total-lock').text().replace(/\./g, '').replace(',', '.')) || 0;
        break;
      case 'manual':
        total = parseFloat($('#grand-total-manual').text().replace(/\./g, '').replace(',', '.')) || 0;
        break;
    }
    
    $('#totalOngkos').val(total.toLocaleString('id-ID'));
  }

  // Initialize UI for default sales type
  updateUIForSalesType('aksesoris');

  // Handle jumlah bayar input to calculate kembalian
  $('#jumlahBayar').on('input', function() {
    const jumlahBayar = parseFloat($(this).val().replace(/\./g, '').replace(',', '.')) || 0;
    const total = parseFloat($('#totalOngkos').val().replace(/\./g, '').replace(',', '.')) || 0;
    const kembalian = jumlahBayar - total;
    
    $('#kembalian').val(kembalian >= 0 ? kembalian.toLocaleString('id-ID') : '0');
  });

  // Format number inputs with thousand separator
  function formatNumber(input) {
    const value = input.value.replace(/\D/g, '');
    input.value = parseInt(value || 0).toLocaleString('id-ID');
  }

  // Apply formatting to numeric inputs
  $('#jumlahBayar').on('blur', function() {
    formatNumber(this);
  });

  // Reset form button
  $('#btnBatal').on('click', function() {
    if (confirm('Apakah Anda yakin ingin membatalkan transaksi ini?')) {
      location.reload();
    }
  });

  // Save transaction
  $('#btnSimpanPenjualan').on('click', function() {
    const salesType = $('#jenisPenjualan').val();
    const tableSelector = salesType === 'aksesoris' ? '#tableAksesorisDetail' : 
                         salesType === 'kotak' ? '#tableKotakDetail' : 
                         salesType === 'gantiLock' ? '#tableLockDetail' : '#tableManualDetail';
    
    // Check if table has rows
    if ($(tableSelector + ' tbody tr').length === 0) {
      alert('Tidak ada barang yang ditambahkan!');
      return;
    }
    
    // Check payment method
    const paymentMethod = $('#metodeBayar').val();
    if (paymentMethod !== 'free') {
      const jumlahBayar = parseFloat($('#jumlahBayar').val().replace(/\./g, '').replace(',', '.')) || 0;
      const total = parseFloat($('#totalOngkos').val().replace(/\./g, '').replace(',', '.')) || 0;
      
      if (jumlahBayar < total && paymentMethod !== 'dp') {
        alert('Jumlah bayar kurang dari total!');
        return;
      }
    }
    
    // Here you would normally save the transaction to your database
    alert('Transaksi berhasil disimpan!');
    
    // Enable print button
    $('#btnCetak').prop('disabled', false);
  });

  // Print receipt
  $('#btnCetak').on('click', function() {
    // Here you would normally open a print dialog or redirect to a print page
    alert('Fitur cetak nota akan segera tersedia!');
  });

  // Search functionality for aksesoris modal
  $('#searchAksesoris').on('input', function() {
    const searchText = $(this).val().toLowerCase();
    
    $('#tableAksesoris tbody tr').each(function() {
      const kode = $(this).find('td:nth-child(1)').text().toLowerCase();
      const nama = $(this).find('td:nth-child(2)').text().toLowerCase();
      
      if (kode.includes(searchText) || nama.includes(searchText)) {
        $(this).show();
      } else {
        $(this).hide();
      }
    });
  });

  // Search functionality for kotak modal
  $('#searchKotak').on('input', function() {
    const searchText = $(this).val().toLowerCase();
    
    $('#tableKotak tbody tr').each(function() {
      const kode = $(this).find('td:nth-child(1)').text().toLowerCase();
      const nama = $(this).find('td:nth-child(2)').text().toLowerCase();
      
      if (kode.includes(searchText) || nama.includes(searchText)) {
        $(this).show();
      } else {
        $(this).hide();
      }
    });
  });
});
