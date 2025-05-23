import { firestore } from "./configFirebase.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Global variables
let deleteDataType = null;
let deleteStartDate = null;
let deleteEndDate = null;
const VERIFICATION_PASSWORD = "admin123";

// Tambahkan di bagian atas file, setelah import
const tableConfigs = {
  all: {
    columns: ["Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", "Jumlah", "Berat", "Kadar", "Harga", "Status", "Keterangan", "Aksi"],
    fields: ["tanggal", "sales", "jenis", "kode", "nama", "jumlah", "berat", "kadar", "harga", "status", "keterangan", "aksi"]
  },
  aksesoris: {
    columns: ["Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", "Jumlah", "Berat", "Kadar", "Harga", "Status", "Aksi"],
    fields: ["tanggal", "sales", "jenis", "kode", "nama", "jumlah", "berat", "kadar", "harga", "status", "aksi"]
  },
  kotak: {
    columns: ["Tanggal", "Sales", "Jenis", "Nama Barang", "Jumlah", "Harga", "Status", "Aksi"],
    fields: ["tanggal", "sales", "jenis", "nama", "jumlah", "harga", "status", "aksi"]
  },
  manual: {
    columns: ["Tanggal", "Sales", "Jenis", "Kode Barang", "Nama Barang", "Jumlah", "Berat", "Kadar", "Harga", "Status", "Keterangan", "Aksi"],
    fields: ["tanggal", "sales", "jenis", "kode", "nama", "jumlah", "berat", "kadar", "harga", "status", "keterangan", "aksi"]
  },
  summary: {
    columns: ["Kode Barang", "Nama Barang", "Total Jumlah", "Total Harga"],
    fields: ["kode", "nama", "jumlah", "harga"]
  }
};

// Cache management dengan TTL dan cleanup otomatis
const cacheManager = {
  salesData: {
    data: null,
    lastFetched: null,
    ttl: 5 * 60 * 1000, // 5 menit
  },
  
  isValid(cacheKey) {
    const cache = this[cacheKey];
    if (!cache || !cache.data || !cache.lastFetched) return false;
    return (Date.now() - cache.lastFetched) < cache.ttl;
  },
  
  set(cacheKey, data) {
    this[cacheKey] = {
      data: data,
      lastFetched: Date.now(),
      ttl: this[cacheKey]?.ttl || 5 * 60 * 1000
    };
  },
  
  get(cacheKey) {
    return this.isValid(cacheKey) ? this[cacheKey].data : null;
  },
  
  clear(cacheKey = null) {
    if (cacheKey) {
      this[cacheKey] = { data: null, lastFetched: null, ttl: this[cacheKey]?.ttl || 5 * 60 * 1000 };
    } else {
      Object.keys(this).forEach(key => {
        if (typeof this[key] === 'object' && this[key].hasOwnProperty('data')) {
          this[key] = { data: null, lastFetched: null, ttl: this[key].ttl };
        }
      });
    }
  }
};

// Main handler object
const laporanPenjualanHandler = {
  salesData: [],
  filteredSalesData: [],
  summaryData: [],
  isSummaryMode: false,
  dataTable: null,

  // Utility functions
  showAlert: (message, title = "Informasi", type = "info") => {
    return Swal.fire({
      title: title,
      text: message,
      icon: type,
      confirmButtonText: 'OK',
      confirmButtonColor: '#0d6efd'
    });
  },

  showLoading: (show) => {
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) {
      loadingIndicator.style.display = show ? "flex" : "none";
    }
  },

  // PERBAIKAN 1: Load data dengan cache management yang efisien
  async loadSalesData(forceRefresh = false) {
    try {
      // Cek cache terlebih dahulu
      if (!forceRefresh) {
        const cachedData = cacheManager.get('salesData');
        if (cachedData) {
          console.log("Using cached sales data");
          this.salesData = cachedData;
          this.populateSalesPersonFilter();
          return;
        }
      }

      this.showLoading(true);
      console.log("Fetching fresh sales data from Firestore");

      const salesSnapshot = await getDocs(collection(firestore, "penjualanAksesoris"));
      const salesData = [];
      
      salesSnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Standarisasi jenis penjualan dan deteksi ganti lock
        if (data.jenisPenjualan === "gantiLock") {
          data.jenisPenjualan = "manual";
          data.isGantiLock = true;
        }
        
        salesData.push({ id: doc.id, ...data });
      });

      // Simpan ke cache
      cacheManager.set('salesData', salesData);
      this.salesData = salesData;
      this.populateSalesPersonFilter();

    } catch (error) {
      console.error("Error loading sales data:", error);
      this.showAlert("Gagal memuat data penjualan: " + error.message, "Error", "error");
    } finally {
      this.showLoading(false);
    }
  },

  // PERBAIKAN 2: DataTable management yang aman
  destroyDataTable() {
    if (this.dataTable) {
      try {
        this.dataTable.destroy();
        this.dataTable = null;
      } catch (error) {
        console.warn("Error destroying DataTable:", error);
        this.dataTable = null;
      }
    }
  },

  initDataTable(data = []) {
    this.destroyDataTable();
    
    try {
      this.dataTable = $("#penjualanTable").DataTable({
        data: data,
        destroy: true,
        language: {
          url: "//cdn.datatables.net/plug-ins/1.10.25/i18n/Indonesian.json",
        },
        dom: "Bfrtip",
        buttons: ["excel", "pdf", "print"],
        order: this.isSummaryMode ? [[2, "desc"]] : [[0, "desc"]],
        scrollX: true, // PERBAIKAN: Tambahkan scroll horizontal
        responsive: false, // Disable responsive untuk mempertahankan scroll
        autoWidth: false,
        drawCallback: () => {
          this.attachActionButtons();
        },
        columnDefs: [
          { targets: '_all', defaultContent: '-' },
          { 
            targets: [2], // Kolom jenis penjualan
            render: function(data, type, row) {
              if (type === 'display' && data.includes('<br>')) {
                return data; // Return HTML as is for display
              }
              return data;
            }
          }
        ]
      });
    } catch (error) {
      console.error("Error initializing DataTable:", error);
    }
  },

  updateDataTable(data) {
    if (this.dataTable) {
      try {
        this.dataTable.clear().rows.add(data).draw();
      } catch (error) {
        console.error("Error updating DataTable:", error);
        this.initDataTable(data);
      }
    } else {
      this.initDataTable(data);
    }
  },

  // PERBAIKAN 3: Format jenis penjualan dengan deteksi ganti lock
  formatJenisPenjualan(transaction) {
    if (transaction.isGantiLock || transaction.jenisPenjualan === "gantiLock") {
      // Untuk ganti lock, ambil kode aksesoris dari kodeLock
      let kodeAksesoris = "";
      if (transaction.items && transaction.items.length > 0) {
        const itemWithKode = transaction.items.find(item => item.kodeLock);
        kodeAksesoris = itemWithKode ? itemWithKode.kodeLock : "";
      }
      return kodeAksesoris ? `Manual<br><small>(${kodeAksesoris})</small>` : "Manual";
    } else if (transaction.jenisPenjualan === "manual") {
      // Untuk manual biasa, cek apakah ada kodeLock (ganti lock)
      let kodeAksesoris = "";
      if (transaction.items && transaction.items.length > 0) {
        const itemWithKode = transaction.items.find(item => item.kodeLock);
        if (itemWithKode && itemWithKode.kodeLock) {
          // Jika ada kodeLock, berarti ini ganti lock
          kodeAksesoris = itemWithKode.kodeLock;
          return `Manual<br><small>(${kodeAksesoris})</small>`;
        }
      }
      return "Manual";
    }
    
    const jenis = transaction.jenisPenjualan || "Tidak diketahui";
    return jenis.charAt(0).toUpperCase() + jenis.slice(1);
  },

  // Update table header berdasarkan jenis penjualan
  updateTableHeader() {
    const salesType = document.getElementById("salesType").value;
    let configKey = salesType === "all" ? "manual" : 
                   salesType === "layanan" ? "manual" : salesType;
    
    if (this.isSummaryMode) configKey = "summary";
    
    const config = tableConfigs[configKey];
    if (!config) return;

    const headerRow = document.querySelector("#penjualanTable thead tr");
    if (headerRow) {
      headerRow.innerHTML = config.columns.map(col => `<th>${col}</th>`).join('');
    }
  },

  // Prepare data untuk DataTable
  prepareTableData() {
    const salesType = document.getElementById("salesType").value;
    let configKey = salesType === "all" ? "manual" : 
                   salesType === "layanan" ? "manual" : 
                   salesType === "manual" ? "manual" : salesType;
    
    if (this.isSummaryMode) {
      configKey = "summary";
      return this.summaryData.map(item => [
        item.kode || '-',
        item.nama || '-',
        item.jumlah || 0,
        `Rp ${(item.totalHarga || 0).toLocaleString("id-ID")}`
      ]);
    }
  
    const config = tableConfigs[configKey];
    if (!config) return [];
  
    const tableData = [];
    
    this.filteredSalesData.forEach(transaction => {
      if (!transaction) return;
      
      const date = transaction.timestamp ? 
        formatDate(transaction.timestamp.toDate()) : 
        (transaction.tanggal || "-");
      const sales = transaction.sales || "Admin";
      const jenisPenjualan = this.formatJenisPenjualan(transaction);
  
      if (transaction.items && transaction.items.length > 0) {
        transaction.items.forEach(item => {
          if (!item) return;
          
          const rowData = config.fields.map(field => {
            switch(field) {
              case "tanggal": return date;
              case "sales": return sales;
              case "jenis": return jenisPenjualan;
              case "kode": 
              case "barcode": 
                // PERBAIKAN: Untuk manual, prioritaskan kodeLock jika ada (ganti lock)
                return item.kodeText || item.barcode || "-";
              case "nama": return item.nama || "-";
              case "jumlah": return item.jumlah || 1;
              case "kadar": return item.kadar || "-";
              case "berat": return item.berat ? item.berat + " gr" : "-";
              case "keterangan": 
                if (transaction.jenisPenjualan === "manual") {
                  return item.keterangan || transaction.keterangan || "-";
                }
                return "-";
              case "harga": return `Rp ${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}`;
              case "status": return this.getStatusBadge(transaction);
              case "aksi": return this.getActionButtons(transaction.id);
              default: return "-";
            }
          });
          
          tableData.push(rowData);
        });
      } else {
        // Untuk transaksi tanpa items
        const rowData = config.fields.map(field => {
          switch(field) {
            case "tanggal": return date;
            case "sales": return sales;
            case "jenis": return jenisPenjualan;
            case "keterangan": return transaction.keterangan || "-";
            case "harga": return `Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}`;
            case "status": return this.getStatusBadge(transaction);
            case "aksi": return this.getActionButtons(transaction.id);
            default: return "-";
          }
        });
        
        tableData.push(rowData);
      }
    });
  
    return tableData;
  },

  getStatusBadge(transaction) {
    const status = transaction.statusPembayaran || "Lunas";
    
    if (status === "DP") {
      return `<span class="badge bg-warning">DP: Rp ${formatRupiah(transaction.nominalDP)}</span>
              <br><small>Sisa: Rp ${formatRupiah(transaction.sisaPembayaran)}</small>`;
    } else if (status === "Lunas") {
      return `<span class="badge bg-success">Lunas</span>`;
    } else if (transaction.metodeBayar === "free") {
      return `<span class="badge bg-info">Gratis</span>`;
    }
    
    return `<span class="badge bg-secondary">${status}</span>`;
  },

  getActionButtons(transactionId) {
    return `
      <div class="btn-group">
        <button class="btn btn-sm btn-warning btn-reprint" data-id="${transactionId}">
          <i class="fas fa-print"></i>
        </button>
        <button class="btn btn-sm btn-primary btn-edit" data-id="${transactionId}">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${transactionId}">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
  },

  // Render table dengan perbaikan
  renderSalesTable() {
    try {
      this.updateTableHeader();
      const tableData = this.prepareTableData();
      this.updateDataTable(tableData);
      this.updateSummaryDisplay();
    } catch (error) {
      console.error("Error rendering sales table:", error);
      this.showAlert("Terjadi kesalahan saat menampilkan data", "Error", "error");
    }
  },

  // Filter data penjualan
  filterSalesData() {
    if (!this.salesData || !this.salesData.length) return;

    this.showLoading(true);

    try {
      const startDateStr = document.getElementById("startDate").value;
      const endDateStr = document.getElementById("endDate").value;
      const salesType = document.getElementById("salesType").value;
      const salesPerson = document.getElementById("salesPerson").value;

      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);
      if (endDate) endDate.setDate(endDate.getDate() + 1);

      this.filteredSalesData = this.salesData.filter(item => {
        if (!item) return false;
        
        const transactionDate = item.timestamp ? 
          item.timestamp.toDate() : parseDate(item.tanggal);
        if (!transactionDate) return false;

        const dateInRange = (!startDate || transactionDate >= startDate) && 
                           (!endDate || transactionDate < endDate);

        let typeMatches = true;
        if (salesType !== "all") {
          if (salesType === "layanan") {
            typeMatches = item.jenisPenjualan === "manual";
          } else {
            typeMatches = item.jenisPenjualan === salesType;
          }
        }

        let salesMatches = true;
        if (salesPerson !== "all") {
          salesMatches = item.sales === salesPerson;
        }

        return dateInRange && typeMatches && salesMatches;
      });

      this.filteredSalesData.sort((a, b) => {
        const dateA = a.timestamp ? a.timestamp.toDate() : parseDate(a.tanggal);
        const dateB = b.timestamp ? b.timestamp.toDate() : parseDate(b.tanggal);
        return dateB - dateA;
      });

      this.renderSalesTable();
    } catch (error) {
      console.error("Error filtering sales data:", error);
      this.showAlert("Terjadi kesalahan saat memfilter data", "Error", "error");
    } finally {
      this.showLoading(false);
    }
  },

  // Update summary display
  updateSummaryDisplay() {
    let totalRevenue = 0;
    let totalTransactions = 0;

    if (this.isSummaryMode && this.summaryData) {
      totalRevenue = this.summaryData.reduce((sum, item) => sum + (item.totalHarga || 0), 0);
      totalTransactions = this.summaryData.length;
    } else if (this.filteredSalesData) {
      totalTransactions = this.filteredSalesData.length;
      this.filteredSalesData.forEach(transaction => {
        if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
          totalRevenue += transaction.sisaPembayaran || 0;
        } else if (transaction.metodeBayar === "free") {
          totalRevenue += 0;
        } else {
          totalRevenue += transaction.totalHarga || 0;
        }
      });
    }

    document.getElementById("totalTransactions").textContent = 
      this.isSummaryMode ? `Total Jenis Barang: ${totalTransactions}` : `Total Transaksi: ${totalTransactions}`;
    
    document.getElementById("totalRevenue").textContent = 
      `Total Pendapatan: Rp ${parseInt(totalRevenue).toLocaleString("id-ID")}`;
  },

  // Populate sales person filter
  populateSalesPersonFilter() {
    const salesPersons = [...new Set(this.salesData.map(item => item.sales).filter(Boolean))];
    const dropdown = document.getElementById("salesPerson");
    
    if (!dropdown) return;

    // Clear existing options except first one
    while (dropdown.options.length > 1) {
      dropdown.remove(1);
    }

    salesPersons.forEach(person => {
      const option = document.createElement("option");
      option.value = person;
      option.textContent = person;
      dropdown.appendChild(option);
    });
  },

  // Generate summary data
  generateSalesSummary() {
    if (!this.filteredSalesData.length) return;

    const summaryMap = new Map();

    this.filteredSalesData.forEach(transaction => {
      if (!transaction.items || !transaction.items.length) return;

      transaction.items.forEach(item => {
        const key = item.kodeText || "unknown";
        const name = item.nama || "Tidak diketahui";
        const quantity = parseInt(item.jumlah) || 1;

        let itemTotalPrice = parseInt(item.totalHarga) || 0;

        if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
          const proportion = itemTotalPrice / transaction.totalHarga;
          itemTotalPrice = Math.round(proportion * transaction.sisaPembayaran);
        } else if (transaction.metodeBayar === "free") {
          itemTotalPrice = 0;
        }

        if (summaryMap.has(key)) {
          const existingItem = summaryMap.get(key);
          existingItem.jumlah += quantity;
          existingItem.totalHarga += itemTotalPrice;
        } else {
          summaryMap.set(key, {
            kode: key,
            nama: name,
            jumlah: quantity,
            totalHarga: itemTotalPrice,
          });
        }
      });
    });

    this.summaryData = Array.from(summaryMap.values());
    this.summaryData.sort((a, b) => b.totalHarga - a.totalHarga);
  },

  // Toggle summary view
  toggleSummaryView() {
    this.isSummaryMode = !this.isSummaryMode;

    const toggleBtn = document.getElementById("toggleSummaryBtn");
    if (toggleBtn) {
      toggleBtn.innerHTML = this.isSummaryMode
        ? '<i class="fas fa-list me-1"></i> Detail Penjualan'
        : '<i class="fas fa-chart-pie me-1"></i> Summary Penjualan';
    }

    if (this.isSummaryMode) {
      this.generateSalesSummary();
    }

    this.renderSalesTable();
  },

  // PERBAIKAN 4: Edit transaction dengan form yang disesuaikan
  editTransaction(transactionId) {
    const transaction = this.salesData.find(item => item.id === transactionId);
    if (!transaction) {
      return this.showAlert("Transaksi tidak ditemukan", "Error", "error");
    }

    const jenisPenjualan = transaction.jenisPenjualan;
    let formHtml = this.generateEditForm(transaction, jenisPenjualan);

    Swal.fire({
      title: `Edit Transaksi ${jenisPenjualan.charAt(0).toUpperCase() + jenisPenjualan.slice(1)}`,
      html: formHtml,
      showCancelButton: true,
      confirmButtonText: "Simpan",
      cancelButtonText: "Batal",
      width: "600px",
      didOpen: () => {
        this.attachEditFormEvents(transaction);
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        await this.saveEditedTransaction(transaction);
      }
    });
  },

  generateEditForm(transaction, jenisPenjualan) {
    let formHtml = `
      <div class="mb-3">
        <label for="editSales" class="form-label">Sales:</label>
        <input type="text" class="form-control" id="editSales" value="${transaction.sales || ''}">
      </div>
    `;
  
    if (transaction.items && transaction.items.length > 0) {
      formHtml += `<div class="mb-3"><label class="form-label">Detail Barang:</label></div>`;
      
      transaction.items.forEach((item, index) => {
        formHtml += `<div class="border p-3 mb-3 rounded">`;
        formHtml += `<h6>Item ${index + 1}</h6>`;
        
        if (jenisPenjualan === "manual") {
          // Form untuk manual: sales, nama barang, kadar, berat, harga, dan keterangan
          formHtml += `
            <div class="row">
              <div class="col-md-6">
                <label for="editNama_${index}" class="form-label">Nama Barang:</label>
                <input type="text" class="form-control" id="editNama_${index}" value="${item.nama || ''}">
              </div>
              <div class="col-md-6">
                <label for="editKadar_${index}" class="form-label">Kadar:</label>
                <input type="text" class="form-control" id="editKadar_${index}" value="${item.kadar || ''}">
              </div>
            </div>
            <div class="row mt-2">
              <div class="col-md-6">
                <label for="editBerat_${index}" class="form-label">Berat (gr):</label>
                <input type="text" class="form-control" id="editBerat_${index}" value="${item.berat || ''}">
              </div>
              <div class="col-md-6">
                <label for="editHarga_${index}" class="form-label">Harga:</label>
                <input type="text" class="form-control" id="editHarga_${index}" value="${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}">
              </div>
            </div>
            <div class="row mt-2">
              <div class="col-md-12">
                <label for="editKeterangan_${index}" class="form-label">Keterangan:</label>
                <textarea class="form-control" id="editKeterangan_${index}" rows="2">${item.keterangan || ''}</textarea>
              </div>
            </div>
          `;
        } else if (jenisPenjualan === "kotak") {
          // Form untuk kotak: sales, nama barang, dan harga
          formHtml += `
            <div class="row">
              <div class="col-md-6">
                <label for="editNama_${index}" class="form-label">Nama Barang:</label>
                <input type="text" class="form-control" id="editNama_${index}" value="${item.nama || ''}">
              </div>
              <div class="col-md-6">
                <label for="editHarga_${index}" class="form-label">Harga:</label>
                <input type="text" class="form-control" id="editHarga_${index}" value="${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}">
              </div>
            </div>
          `;
        } else {
          // Form untuk aksesoris: sales, nama barang, kadar, berat, dan harga
          formHtml += `
            <div class="row">
              <div class="col-md-6">
                <label for="editNama_${index}" class="form-label">Nama Barang:</label>
                <input type="text" class="form-control" id="editNama_${index}" value="${item.nama || ''}">
              </div>
              <div class="col-md-6">
                <label for="editKadar_${index}" class="form-label">Kadar:</label>
                <input type="text" class="form-control" id="editKadar_${index}" value="${item.kadar || ''}">
              </div>
            </div>
            <div class="row mt-2">
              <div class="col-md-6">
                <label for="editBerat_${index}" class="form-label">Berat (gr):</label>
                <input type="text" class="form-control" id="editBerat_${index}" value="${item.berat || ''}">
              </div>
              <div class="col-md-6">
                <label for="editHarga_${index}" class="form-label">Harga:</label>
                <input type="text" class="form-control" id="editHarga_${index}" value="${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}">
              </div>
            </div>
          `;
        }
        
        formHtml += `</div>`;
      });
    }
  
    return formHtml;
  },

  attachEditFormEvents(transaction) {
    // Format input harga dengan thousand separator
    if (transaction.items) {
      transaction.items.forEach((item, index) => {
        const hargaInput = document.getElementById(`editHarga_${index}`);
        if (hargaInput) {
          hargaInput.addEventListener("blur", () => {
            const value = hargaInput.value.replace(/\./g, "");
            hargaInput.value = parseInt(value || 0).toLocaleString("id-ID");
          });
        }
      });
    }
  },

  // PERBAIKAN 5: Save edited transaction dengan update real-time
  async saveEditedTransaction(transaction) {
    try {
      this.showLoading(true);
  
      const updateData = {
        sales: document.getElementById("editSales").value.trim(),
        lastUpdated: serverTimestamp()
      };
  
      if (transaction.items && transaction.items.length > 0) {
        updateData.items = transaction.items.map((item, index) => {
          const updatedItem = { ...item };
          
          updatedItem.nama = document.getElementById(`editNama_${index}`)?.value || item.nama;
          
          if (transaction.jenisPenjualan !== "kotak") {
            updatedItem.kadar = document.getElementById(`editKadar_${index}`)?.value || item.kadar;
            updatedItem.berat = document.getElementById(`editBerat_${index}`)?.value || item.berat;
          }
          
          // PERBAIKAN: Simpan keterangan untuk manual
          if (transaction.jenisPenjualan === "manual") {
            updatedItem.keterangan = document.getElementById(`editKeterangan_${index}`)?.value || item.keterangan;
          }
          
          const hargaValue = document.getElementById(`editHarga_${index}`)?.value.replace(/\./g, "") || "0";
          updatedItem.totalHarga = parseInt(hargaValue);
          
          return updatedItem;
        });
  
        updateData.totalHarga = updateData.items.reduce((sum, item) => sum + (item.totalHarga || 0), 0);
      }
  
      // Update di Firestore
      await updateDoc(doc(firestore, "penjualanAksesoris", transaction.id), updateData);
      
      // Update data lokal secara real-time
      this.updateLocalData(transaction.id, updateData);
      
      // Clear cache untuk memastikan data fresh
      cacheManager.clear('salesData');
      
      this.showLoading(false);
      this.showAlert("Transaksi berhasil diperbarui", "Sukses", "success");
    } catch (error) {
      this.showLoading(false);
      console.error("Error updating transaction:", error);
      this.showAlert("Terjadi kesalahan saat memperbarui transaksi: " + error.message, "Error", "error");
    }
  },

  // Update data lokal secara real-time
  updateLocalData(transactionId, updateData) {
    // Update salesData
    const salesIndex = this.salesData.findIndex(item => item.id === transactionId);
    if (salesIndex !== -1) {
      this.salesData[salesIndex] = { ...this.salesData[salesIndex], ...updateData };
      delete this.salesData[salesIndex].lastUpdated;
    }
    
    // Update filteredSalesData
    const filteredIndex = this.filteredSalesData.findIndex(item => item.id === transactionId);
    if (filteredIndex !== -1) {
      this.filteredSalesData[filteredIndex] = { ...this.filteredSalesData[filteredIndex], ...updateData };
      delete this.filteredSalesData[filteredIndex].lastUpdated;
    }
    
    // Re-render tabel
    this.renderSalesTable();
  },

  // Delete transaction
  async deleteTransaction(transactionId) {
    try {
      this.showLoading(true);
      
      await deleteDoc(doc(firestore, "penjualanAksesoris", transactionId));
      
      // Remove from local arrays
      this.salesData = this.salesData.filter(item => item.id !== transactionId);
      this.filteredSalesData = this.filteredSalesData.filter(item => item.id !== transactionId);
      
      // Clear cache
      cacheManager.clear('salesData');
      
      this.renderSalesTable();
      
      this.showLoading(false);
      this.showAlert("Transaksi berhasil dihapus", "Sukses", "success");
    } catch (error) {
      this.showLoading(false);
      console.error("Error deleting transaction:", error);
      this.showAlert("Terjadi kesalahan saat menghapus transaksi: " + error.message, "Error", "error");
    }
  },

  // Confirm delete transaction
  confirmDeleteTransaction(transactionId) {
    const transaction = this.salesData.find(item => item.id === transactionId);
    if (!transaction) {
      return this.showAlert("Transaksi tidak ditemukan", "Error", "error");
    }

    const date = transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal;

    Swal.fire({
      title: "Konfirmasi Hapus",
      html: `
        <p>Apakah Anda yakin ingin menghapus transaksi ini?</p>
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Peringatan!</strong> Tindakan ini tidak dapat dibatalkan.
        </div>
        <div class="text-start">
          <p><strong>Tanggal:</strong> ${date}</p>
          <p><strong>Sales:</strong> ${transaction.sales || "Admin"}</p>
          <p><strong>Total Harga:</strong> Rp ${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    }).then((result) => {
      if (result.isConfirmed) {
        this.deleteTransaction(transactionId);
      }
    });
  },

  // Reprint transaction
  reprintTransaction(transactionId) {
    const transaction = this.salesData.find(item => item.id === transactionId);
    if (!transaction) {
      return this.showAlert("Transaksi tidak ditemukan", "Error", "error");
    }

    const printData = {
      id: transactionId,
      jenisPenjualan: transaction.jenisPenjualan,
      tanggal: transaction.timestamp ? formatDate(transaction.timestamp.toDate()) : transaction.tanggal,
      sales: transaction.sales || "Admin",
      totalHarga: parseInt(transaction.totalHarga || 0).toLocaleString("id-ID"),
      items: transaction.items || [],
      metodeBayar: transaction.metodeBayar || "tunai",
    };

    Swal.fire({
      title: "Cetak Ulang",
      html: `
        <p>Pilih jenis nota yang akan dicetak:</p>
        <div class="d-grid gap-2">
          <button type="button" class="btn btn-primary" id="btnPrintReceipt">
            <i class="fas fa-receipt me-2"></i>
            Struk Kasir
          </button>
          <button type="button" class="btn btn-success" id="btnPrintInvoice">
            <i class="fas fa-file-invoice me-2"></i>
            Invoice Customer
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Tutup",
      width: "400px",
      didOpen: () => {
        document.getElementById("btnPrintReceipt").addEventListener("click", () => {
          this.printReceipt(printData);
          Swal.close();
        });
        document.getElementById("btnPrintInvoice").addEventListener("click", () => {
          this.printInvoice(printData);
          Swal.close();
        });
      },
    });
  },

  // Print receipt
  printReceipt(transaction) {
    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        throw new Error("Popup diblokir oleh browser. Mohon izinkan popup untuk mencetak struk.");
      }

      const tanggal = transaction.tanggal || this.formatTimestamp(transaction.timestamp);
      let salesType = transaction.jenisPenjualan || "aksesoris";
      if (salesType === "manual") {
        salesType = "layanan";
      }

      let receiptHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Struk Kasir</title>
          <style>
            body { font-family: roboto; font-size: 13px; margin: 0; padding: 0; width: 80mm; }
            .receipt { margin: 0 auto; padding: 5mm; }
            .receipt h3, .receipt h4 { text-align: center; margin: 2mm 0; }
            .receipt hr { border-top: 1px dashed #000; }
            .receipt table { width: 100%; border-collapse: collapse; }
            .receipt th, .receipt td { text-align: left; padding: 1mm 2mm; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <h3>MELATI GOLD SHOP</h3>
            <h4>JL. DIPONEGORO NO. 116</h4>
            <h4>NOTA PENJUALAN ${salesType.toUpperCase()}</h4>
            <hr>
            <p>Tanggal: ${tanggal}<br>Sales: ${transaction.sales || "-"}</p>
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

      transaction.items.forEach((item) => {
        receiptHTML += `
          <tr>
            <td>${item.kodeText || "-"}</td>
            <td>${item.nama || "-"}</td>
            <td>${item.kadar || "-"}</td>
            <td>${item.berat || "-"}</td>
            <td class="text-right">${parseInt(item.totalHarga || 0).toLocaleString("id-ID")}</td>
          </tr>
        `;
      });

      receiptHTML += `
              <tr>
                <td colspan="4" class="text-right"><strong>Total:</strong></td>
                <td class="text-right"><strong>${parseInt(transaction.totalHarga || 0).toLocaleString("id-ID")}</strong></td>
              </tr>
            </table>
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

      printWindow.document.write(receiptHTML);
      printWindow.document.close();
    } catch (error) {
      console.error("Error printing receipt:", error);
      this.showAlert("Error mencetak struk: " + error.message, "Error", "error");
    }
  },

  // Print invoice
  printInvoice(transaction) {
    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        throw new Error("Popup diblokir oleh browser.");
      }

      let invoiceHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invoice Customer</title>
          <style>
            @page { size: 10cm 20cm; margin: 0; }
            body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 5mm; width: 20cm; }
            .invoice { width: 100%; }
            .header-info { text-align: right; margin-bottom: 2cm; margin-right: 3cm; margin-top: 1cm; }
            .total-row { margin-top: 1.9cm; text-align: right; font-weight: bold; margin-right: 3cm; }
            .sales { text-align: right; margin-top: 0.6cm; margin-right: 2cm; }
            .item-data { display: grid; grid-template-columns: 2cm 1.8cm 5cm 2cm 2cm 2cm; width: 100%; column-gap: 0.2cm; margin-left: 1cm; margin-top: 1.5cm; margin-right: 3cm; }
          </style>
        </head>
        <body>
          <div class="invoice">
            <div class="header-info">
              <p>${transaction.tanggal}</p>
            </div>
            <hr>
      `;

      let totalHarga = 0;
      transaction.items.forEach((item) => {
        const itemHarga = parseInt(item.totalHarga) || 0;
        totalHarga += itemHarga;

        invoiceHTML += `
          <div class="item-data">
            <span>${item.kodeText || "-"}</span>
            <span>${item.jumlah || "1"}pcs</span>
            <span>${item.nama || "-"}</span>
            <span>${item.kadar || "-"}</span>
            <span>${item.berat || "-"}gr</span>
            <span>${itemHarga.toLocaleString("id-ID")}</span>
          </div>
        `;
      });

      invoiceHTML += `
            <div class="total-row">
              Rp ${totalHarga.toLocaleString("id-ID")}
            </div>
            <div class="sales">${transaction.sales || "-"}</div>
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

      printWindow.document.write(invoiceHTML);
      printWindow.document.close();
    } catch (error) {
      console.error("Error printing invoice:", error);
      this.showAlert("Error mencetak invoice: " + error.message, "Error", "error");
    }
  },

  // Attach action buttons
  attachActionButtons() {
    // Remove existing event listeners to prevent duplication
    document.querySelectorAll(".btn-reprint, .btn-edit, .btn-delete").forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });

    // Attach new event listeners
    document.querySelectorAll(".btn-reprint").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.reprintTransaction(btn.getAttribute("data-id"));
      });
    });

    document.querySelectorAll(".btn-edit").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.editTransaction(btn.getAttribute("data-id"));
      });
    });

    document.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.confirmDeleteTransaction(btn.getAttribute("data-id"));
      });
    });
  },

  // Initialize date pickers
  initDatePickers() {
    $(".datepicker").datepicker({
      format: "dd/mm/yyyy",
      autoclose: true,
      language: "id",
      todayHighlight: true,
    });
  },

  // Set default dates
  setDefaultDates() {
    const today = new Date();
    const formattedToday = formatDate(today);
    document.querySelectorAll(".datepicker").forEach(input => {
      input.value = formattedToday;
    });
  },

  // Attach event listeners
  attachEventListeners() {
    // Filter button
    document.getElementById("filterSalesBtn")?.addEventListener("click", () => {
      this.loadSalesData().then(() => {
        this.filterSalesData();
      });
    });

    // Toggle summary button
    document.getElementById("toggleSummaryBtn")?.addEventListener("click", () => {
      this.toggleSummaryView();
    });

    // Sales type change
    document.getElementById("salesType")?.addEventListener("change", () => {
      if (this.filteredSalesData && this.filteredSalesData.length > 0) {
        this.renderSalesTable();
      }
    });

    // Delete data button
    document.getElementById("deleteSalesDataBtn")?.addEventListener("click", () => {
      const startDateStr = document.getElementById("startDate").value;
      const endDateStr = document.getElementById("endDate").value;

      if (!startDateStr || !endDateStr) {
        return this.showAlert("Pilih rentang tanggal terlebih dahulu.", "Peringatan", "warning");
      }

      const startDate = parseDate(startDateStr);
      const endDate = parseDate(endDateStr);

      if (!startDate || !endDate) {
        return this.showAlert("Format tanggal tidak valid.", "Peringatan", "warning");
      }

      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      showVerificationModal("sales", startDate, endDate);
    });

    // Confirm delete button
    document.getElementById("confirmDeleteRangeBtn")?.addEventListener("click", async () => {
      const password = document.getElementById("verificationPassword").value;

      if (password !== VERIFICATION_PASSWORD) {
        return this.showAlert("Kata sandi verifikasi salah.", "Error", "error");
      }

      const modal = bootstrap.Modal.getInstance(document.getElementById("verificationModal"));
      modal.hide();

      if (deleteDataType === "sales") {
        await deleteSalesData(deleteStartDate, deleteEndDate);
      }
    });
  },

  // Format timestamp
  formatTimestamp(timestamp) {
    if (!timestamp) return "-";
    try {
      if (timestamp.toDate) {
        return formatDate(timestamp.toDate());
      } else if (timestamp instanceof Date) {
        return formatDate(timestamp);
      } else {
        return timestamp;
      }
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return "-";
    }
  },

  // Initialize
  init() {
    this.initDatePickers();
    this.attachEventListeners();
    this.setDefaultDates();
    
    // Initialize empty table
    this.initDataTable([]);
    
    // Prepare empty table message
    const tableBody = document.querySelector("#penjualanTable tbody");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center">Silakan pilih filter dan klik tombol "Tampilkan" untuk melihat data</td>
        </tr>
      `;
    }

    // Setup cache cleanup interval
    setInterval(() => {
      cacheManager.clear();
    }, 10 * 60 * 1000); // Clean cache every 10 minutes
  }
};

// Utility functions
const formatRupiah = (angka) => {
  if (!angka && angka !== 0) return "0";
  const number = typeof angka === "string" ? parseInt(angka) : angka;
  return new Intl.NumberFormat("id-ID").format(number);
};

const parseDate = (dateString) => {
  if (!dateString) return null;
  const parts = dateString.split("/");
  return new Date(parts[2], parts[1] - 1, parts[0]);
};

const formatDate = (date) => {
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Delete sales data function
async function deleteSalesData(startDate, endDate) {
  try {
    laporanPenjualanHandler.showLoading(true);
    
    const salesRef = collection(firestore, "penjualanAksesoris");
    const q = query(
      salesRef,
      where("timestamp", ">=", Timestamp.fromDate(startDate)),
      where("timestamp", "<=", Timestamp.fromDate(endDate))
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      laporanPenjualanHandler.showLoading(false);
      return laporanPenjualanHandler.showAlert("Tidak ada data penjualan dalam rentang tanggal yang dipilih.", "Info", "info");
    }

    // Delete documents one by one to avoid batch limit
    const deletePromises = [];
    querySnapshot.forEach((docSnapshot) => {
      deletePromises.push(deleteDoc(doc(firestore, "penjualanAksesoris", docSnapshot.id)));
    });

    await Promise.all(deletePromises);
    
    // Clear cache and refresh data
    cacheManager.clear('salesData');
    await laporanPenjualanHandler.loadSalesData(true);
    laporanPenjualanHandler.filterSalesData();

    laporanPenjualanHandler.showLoading(false);
    return laporanPenjualanHandler.showAlert(`Berhasil menghapus ${querySnapshot.size} data penjualan.`, "Sukses", "success");
  } catch (error) {
    console.error("Error deleting sales data:", error);
    laporanPenjualanHandler.showLoading(false);
    return laporanPenjualanHandler.showAlert("Gagal menghapus data: " + error.message, "Error", "error");
  }
}

// Show verification modal
function showVerificationModal(dataType, startDate, endDate) {
  deleteDataType = dataType;
  deleteStartDate = startDate;
  deleteEndDate = endDate;

  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

  const confirmationText = document.getElementById("deleteConfirmationText");
  confirmationText.textContent = `Anda akan menghapus data penjualan dari ${startDateStr} hingga ${endDateStr}. Tindakan ini tidak dapat dibatalkan.`;

  document.getElementById("verificationPassword").value = "";

  const modal = new bootstrap.Modal(document.getElementById("verificationModal"));
  modal.show();
}

// Helper function to show loading indicator
function showLoading(show) {
  const loadingElement = document.getElementById("loadingIndicator");
  if (loadingElement) {
    loadingElement.style.display = show ? "flex" : "none";
  }
}

// Helper function to show alerts
function showAlert(message, title = "Informasi", type = "info") {
  if (typeof Swal !== "undefined") {
    return Swal.fire({
      title: title,
      text: message,
      icon: type,
      confirmButtonText: "OK",
      confirmButtonColor: "#0d6efd",
    });
  } else {
    alert(message);
    return Promise.resolve();
  }
}

// Initialize when document is ready
document.addEventListener("DOMContentLoaded", function () {
  // Check if required libraries are loaded
  if (typeof XLSX === "undefined") {
    console.warn("SheetJS (XLSX) library is not loaded. Excel export will not work.");
  }

  // Initialize the handler
  laporanPenjualanHandler.init();
});

// Export the handler for potential use in other modules
export default laporanPenjualanHandler;

