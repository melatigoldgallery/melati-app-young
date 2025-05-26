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

// Cache management dengan localStorage dan TTL
const cacheManager = {
  prefix: "melati_sales_",
  defaultTTL: 5 * 60 * 1000, // 5 menit

  set(key, data, ttl = this.defaultTTL) {
    const item = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    localStorage.setItem(this.prefix + key, JSON.stringify(item));
  },

  get(key) {
    try {
      const item = JSON.parse(localStorage.getItem(this.prefix + key));
      if (!item) return null;

      if (Date.now() - item.timestamp > item.ttl) {
        this.remove(key);
        return null;
      }

      return item.data;
    } catch (error) {
      console.error("Cache get error:", error);
      return null;
    }
  },

  remove(key) {
    localStorage.removeItem(this.prefix + key);
  },

  clear() {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(this.prefix))
      .forEach((key) => localStorage.removeItem(key));
  },

  // Cache dengan versioning untuk multi-device sync
  setVersioned(key, data, version = Date.now()) {
    this.set(key, { data, version });
  },

  getVersioned(key) {
    const cached = this.get(key);
    return cached ? cached : null;
  },
};

// Utility functions
const utils = {
  showAlert: (message, title = "Informasi", type = "info") =>
    Swal.fire({ title, text: message, icon: type, confirmButtonText: "OK", confirmButtonColor: "#0d6efd" }),

  showLoading: (show) => {
    const loader = document.getElementById("loadingIndicator");
    if (loader) loader.style.display = show ? "flex" : "none";
  },

  formatDate: (date) => {
    if (!date) return "-";
    try {
      const d = date.toDate ? date.toDate() : date instanceof Date ? date : new Date(date);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    } catch {
      return "-";
    }
  },

  parseDate: (dateString) => {
    if (!dateString) return null;
    const [day, month, year] = dateString.split("/");
    return new Date(year, month - 1, day);
  },

  formatRupiah: (angka) => {
    const number = typeof angka === "string" ? parseInt(angka.replace(/\./g, "")) : angka || 0;
    return new Intl.NumberFormat("id-ID").format(number);
  },

  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle: (func, limit) => {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },
};

// Main application class
class DataPenjualanApp {
  constructor() {
    this.salesData = [];
    this.filteredData = [];
    this.dataTable = null;
    this.currentTransaction = null;
    this.isLoading = false;
    this.isGroupedView = false;

    // Bind methods
    this.refreshData = utils.debounce(this.refreshData.bind(this), 1000);
    this.filterData = utils.throttle(this.filterData.bind(this), 500);
  }

  // Initialize application
  async init() {
    this.setupEventListeners();
    this.initDatePickers();
    this.setDefaultDates();
    await this.loadSalesData();
    this.initDataTable();
    this.updateSummary();
    this.populateSalesFilter();
  }

  // Setup all event listeners
  setupEventListeners() {
    const events = {
      btnTambahTransaksi: () => (window.location.href = "penjualanAksesoris.html"),
      btnRefreshData: () => this.refreshData(true),
      btnFilter: () => this.filterData(),
      btnExportData: () => this.exportToExcel(),
      btnPrintReceipt: () => this.printDocument("receipt"),
      btnPrintInvoice: () => this.printDocument("invoice"),
      btnSaveEdit: () => this.saveEditTransaction(),
      btnConfirmDelete: () => this.confirmDeleteTransaction(),
      btnToggleView: () => this.toggleView(),
      btnExportData: () => (this.isGroupedView ? this.exportGroupedData() : this.exportToExcel()),
    };

    Object.entries(events).forEach(([id, handler]) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener("click", handler);
    });

    // Table action handlers
    $(document).off("click", ".btn-reprint").on("click", ".btn-reprint", 
      utils.debounce((e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.target.closest('button').dataset.id;
        if (id) this.handleReprint(id);
      }, 300)
    );
  
    $(document).off("click", ".btn-edit").on("click", ".btn-edit", 
      utils.debounce((e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.target.closest('button').dataset.id;
        if (id) this.handleEdit(id);
      }, 300)
    );
  
    $(document).off("click", ".btn-delete").on("click", ".btn-delete", 
      utils.debounce((e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.target.closest('button').dataset.id;
        if (id) this.handleDelete(id);
      }, 300)
    );
    $(document).on("click", ".btn-view-details", (e) => this.showGroupDetails(e.target.closest("button").dataset.ids));
    $(document).on("click", ".btn-print-group", (e) =>
      this.printGroupTransactions(e.target.closest("button").dataset.ids)
    );
  }

  toggleView() {
    this.isGroupedView = !this.isGroupedView;

    // Update button
    const btn = document.getElementById("btnToggleView");
    btn.innerHTML = this.isGroupedView
      ? '<i class="fas fa-list me-2"></i>View Detail'
      : '<i class="fas fa-layer-group me-2"></i>View Grouped';
    btn.className = this.isGroupedView ? "btn btn-outline-info" : "btn btn-info";

    this.updateDataTable();
    this.updateSummary();
  }

  groupData() {
    const grouped = new Map();

    this.filteredData.forEach((transaction) => {
      transaction.items?.forEach((item) => {
        const key = `${transaction.jenisPenjualan}_${item.kodeText || "NO_CODE"}`;

        if (grouped.has(key)) {
          const g = grouped.get(key);
          g.totalJumlah += item.jumlah || 1;
          g.totalHarga += item.totalHarga || 0;
          g.totalBerat += parseFloat(item.berat || 0);
          g.transactions.push(transaction);
          g.salesList.add(transaction.sales || "Admin");
        } else {
          grouped.set(key, {
            jenisPenjualan: transaction.jenisPenjualan,
            kodeText: item.kodeText || "-",
            nama: item.nama || "-",
            kadar: item.kadar || "-",
            totalJumlah: item.jumlah || 1,
            totalBerat: parseFloat(item.berat || 0),
            totalHarga: item.totalHarga || 0,
            salesList: new Set([transaction.sales || "Admin"]),
            transactions: [transaction],
            latestDate: transaction.timestamp || transaction.tanggal,
          });
        }
      });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const dateA = a.latestDate?.toDate ? a.latestDate.toDate() : new Date(a.latestDate);
      const dateB = b.latestDate?.toDate ? b.latestDate.toDate() : new Date(b.latestDate);
      return dateB - dateA;
    });
  }

  // Initialize date pickers
  initDatePickers() {
    $(".datepicker").datepicker({
      format: "dd/mm/yyyy",
      autoclose: true,
      language: "id",
      todayHighlight: true,
    });
  }

  // Set default date range (today only)
  setDefaultDates() {
    const today = new Date();

    document.getElementById("filterTanggalMulai").value = utils.formatDate(today);
    document.getElementById("filterTanggalAkhir").value = utils.formatDate(today);
  }

  // Load sales data with caching
  async loadSalesData(forceRefresh = false) {
    if (this.isLoading) return;

    try {
      this.isLoading = true;
      utils.showLoading(true);

      // Check cache first
      if (!forceRefresh) {
        const cachedData = cacheManager.getVersioned("salesData");
        if (cachedData) {
          console.log("Using cached sales data");
          this.salesData = cachedData.data;
          this.filterData();
          return;
        }
      }

      console.log("Fetching fresh sales data from Firestore");
      const salesSnapshot = await getDocs(
        query(collection(firestore, "penjualanAksesoris"), orderBy("timestamp", "desc"))
      );

      this.salesData = salesSnapshot.docs.map((doc) => {
        const data = doc.data();
        // Standardize jenis penjualan
        if (data.jenisPenjualan === "gantiLock") {
          data.jenisPenjualan = "manual";
          data.isGantiLock = true;
        }
        return { id: doc.id, ...data };
      });

      // Cache with version for multi-device sync
      cacheManager.setVersioned("salesData", this.salesData);
      this.filterData();
    } catch (error) {
      console.error("Error loading sales data:", error);
      utils.showAlert("Gagal memuat data penjualan: " + error.message, "Error", "error");
    } finally {
      this.isLoading = false;
      utils.showLoading(false);
    }
  }

 // Ganti language config dengan definisi manual
initDataTable() {
  if (this.dataTable) {
    this.dataTable.off();
    this.dataTable.destroy();
    this.dataTable = null;
  }

  $("#dataPenjualanTable").empty();

  this.dataTable = $("#dataPenjualanTable").DataTable({
    data: [],
    columns: [
      { title: "Tanggal", width: "100px" },
      { title: "Sales", width: "80px" },
      { title: "Jenis", width: "100px" },
      { title: "Kode", width: "120px" },
      { title: "Nama", width: "200px" },
      { title: "Jumlah", width: "70px" },
      { title: "Berat", width: "80px" },
      { title: "Kadar", width: "80px" },
      { title: "Harga", width: "120px" },
      { title: "Status", width: "100px" },
      { title: "Keterangan", width: "150px" },
      { title: "Aksi", width: "120px", orderable: false },
    ],
    order: [[0, "desc"]],
    pageLength: 25,
    // Definisi bahasa Indonesia manual
    language: {
      "decimal": "",
      "emptyTable": "Tidak ada data yang tersedia pada tabel ini",
      "info": "Menampilkan _START_ sampai _END_ dari _TOTAL_ entri",
      "infoEmpty": "Menampilkan 0 sampai 0 dari 0 entri",
      "infoFiltered": "(disaring dari _MAX_ entri keseluruhan)",
      "infoPostFix": "",
      "thousands": ".",
      "lengthMenu": "Tampilkan _MENU_ entri",
      "loadingRecords": "Sedang memuat...",
      "processing": "Sedang memproses...",
      "search": "Cari:",
      "zeroRecords": "Tidak ditemukan data yang sesuai",
      "paginate": {
        "first": "Pertama",
        "last": "Terakhir",
        "next": "Selanjutnya",
        "previous": "Sebelumnya"
      },
      "aria": {
        "sortAscending": ": aktifkan untuk mengurutkan kolom naik",
        "sortDescending": ": aktifkan untuk mengurutkan kolom turun"
      }
    },
    dom: "Bfrtip",
    buttons: ["excel", "pdf", "print"],
    responsive: true,
    autoWidth: false,
    scrollX: true,
    processing: true,
    deferRender: true,
    destroy: true
  });
}


  // Filter data based on form inputs
  filterData() {
    const filters = {
      startDate: utils.parseDate(document.getElementById("filterTanggalMulai").value),
      endDate: utils.parseDate(document.getElementById("filterTanggalAkhir").value),
      jenis: document.getElementById("filterJenisPenjualan").value,
      sales: document.getElementById("filterSales").value,
    };

    // Adjust end date to include full day
    if (filters.endDate) {
      filters.endDate.setHours(23, 59, 59, 999);
    }

    this.filteredData = this.salesData.filter((transaction) => {
      const transactionDate = transaction.timestamp
        ? transaction.timestamp.toDate()
        : utils.parseDate(transaction.tanggal);

      if (!transactionDate) return false;

      // Date filter
      if (filters.startDate && transactionDate < filters.startDate) return false;
      if (filters.endDate && transactionDate > filters.endDate) return false;

      // Jenis filter
      if (filters.jenis !== "all" && transaction.jenisPenjualan !== filters.jenis) return false;

      // Sales filter
      if (filters.sales !== "all" && transaction.sales !== filters.sales) return false;

      return true;
    });

    this.updateDataTable();
    this.updateSummary();
  }

  // Update DataTable with filtered data
  updateDataTable() {
    const tableData = this.prepareTableData();

    if (this.dataTable) {
      this.dataTable.clear().rows.add(tableData).draw();
    }
  }

  // Prepare data for DataTable
  prepareTableData() {
    if (this.isGroupedView) {
      return this.groupData().map((group) => [
        utils.formatDate(group.latestDate),
        Array.from(group.salesList).join(", "),
        (group.jenisPenjualan || "").charAt(0).toUpperCase() + (group.jenisPenjualan || "").slice(1),
        group.kodeText,
        group.nama,
        `<strong>${group.totalJumlah} pcs</strong>`,
        group.totalBerat > 0 ? `<strong>${group.totalBerat.toFixed(2)} gr</strong>` : "-",
        group.kadar,
        `<strong>Rp ${utils.formatRupiah(group.totalHarga)}</strong>`,
        this.getGroupStatus(group.transactions),
        this.getGroupKeterangan(group.transactions),
        this.getGroupActions(group.transactions),
      ]);
    }

    // Original detailed view logic
    const tableData = [];
    this.filteredData.forEach((transaction) => {
      const baseData = {
        date: utils.formatDate(transaction.timestamp || transaction.tanggal),
        sales: transaction.sales || "Admin",
        jenis: this.formatJenisPenjualan(transaction),
        status: this.getStatusBadge(transaction),
        actions: this.getActionButtons(transaction.id),
      };

      if (transaction.items?.length > 0) {
        transaction.items.forEach((item) => {
          tableData.push([
            baseData.date,
            baseData.sales,
            baseData.jenis,
            item.kodeText || item.barcode || "-",
            item.nama || "-",
            item.jumlah || 1,
            item.berat ? `${item.berat} gr` : "-",
            item.kadar || "-",
            `Rp ${utils.formatRupiah(item.totalHarga || 0)}`,
            baseData.status,
            item.keterangan || transaction.keterangan || "-",
            baseData.actions,
          ]);
        });
      } else {
        tableData.push([
          baseData.date,
          baseData.sales,
          baseData.jenis,
          "-",
          "-",
          "-",
          "-",
          "-",
          `Rp ${utils.formatRupiah(transaction.totalHarga || 0)}`,
          baseData.status,
          transaction.keterangan || "-",
          baseData.actions,
        ]);
      }
    });
    return tableData;
  }

  getGroupStatus(transactions) {
  const statusCounts = {};
  transactions.forEach(t => statusCounts[t.statusPembayaran || "Lunas"] = (statusCounts[t.statusPembayaran || "Lunas"] || 0) + 1);
  
  return Object.entries(statusCounts).map(([status, count]) => {
    const color = status === "Lunas" ? "success" : status === "Free" ? "info" : "warning";
    return `<span class="badge bg-${color}">${status} (${count})</span>`;
  }).join(' ');
}

getGroupKeterangan(transactions) {
  const keteranganSet = new Set(transactions.map(t => t.keterangan).filter(Boolean));
  const arr = Array.from(keteranganSet);
  return arr.length === 0 ? "-" : arr.length === 1 ? arr[0] : `${arr[0]} <small>(+${arr.length-1})</small>`;
}

getGroupActions(transactions) {
  const ids = transactions.map(t => t.id).join(',');
  return `
    <div class="action-buttons">
      <button class="btn btn-sm btn-info btn-view-details" data-ids="${ids}" title="Detail"><i class="fas fa-eye"></i></button>
      <button class="btn btn-sm btn-warning btn-print-group" data-ids="${ids}" title="Cetak"><i class="fas fa-print"></i></button>
    </div>`;
}

  // Format jenis penjualan
  formatJenisPenjualan(transaction) {
    if (transaction.isGantiLock || transaction.jenisPenjualan === "gantiLock") {
      const kodeAksesoris = transaction.items?.find((item) => item.kodeLock)?.kodeLock || "";
      return kodeAksesoris ? `Manual<br><small>(${kodeAksesoris})</small>` : "Manual";
    }

    if (transaction.jenisPenjualan === "manual") {
      const kodeAksesoris = transaction.items?.find((item) => item.kodeLock)?.kodeLock;
      return kodeAksesoris ? `Manual<br><small>(${kodeAksesoris})</small>` : "Manual";
    }

    const jenis = transaction.jenisPenjualan || "Tidak diketahui";
    return jenis.charAt(0).toUpperCase() + jenis.slice(1);
  }

  // Get status badge HTML
  getStatusBadge(transaction) {
    const status = transaction.statusPembayaran || "Lunas";

    const badges = {
      DP: `<span class="badge bg-warning">DP: Rp ${utils.formatRupiah(transaction.nominalDP)}</span>
             <br><small>Sisa: Rp ${utils.formatRupiah(transaction.sisaPembayaran)}</small>`,
      Lunas: `<span class="badge bg-success">Lunas</span>`,
      Free: `<span class="badge bg-info">Gratis</span>`,
    };
    return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
  }

  // Get action buttons HTML
  getActionButtons(transactionId) {
    return `
      <div class="action-buttons">
        <button class="btn btn-sm btn-warning btn-reprint" data-id="${transactionId}" title="Cetak Ulang">
          <i class="fas fa-print"></i>
        </button>
        <button class="btn btn-sm btn-primary btn-edit" data-id="${transactionId}" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${transactionId}" title="Hapus">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
  }

  // Update summary cards (removed daily cards)
updateSummary() {
  let totalTransaksi, totalPendapatan;
  
  if (this.isGroupedView) {
    const grouped = this.groupData();
    totalTransaksi = grouped.length;
    totalPendapatan = grouped.reduce((sum, g) => sum + g.totalHarga, 0);
  } else {
    totalTransaksi = this.filteredData.length;
    totalPendapatan = this.calculateTotalRevenue(this.filteredData);
  }
  
  document.getElementById("totalTransaksi").textContent = totalTransaksi;
  document.getElementById("totalPendapatan").textContent = `Rp ${utils.formatRupiah(totalPendapatan)}`;
} 

exportGroupedData() {
  const grouped = this.groupData();
  if (!grouped.length) return utils.showAlert("Tidak ada data untuk diekspor", "Info", "info");
  
  const exportData = grouped.map(g => ({
    'Tanggal': utils.formatDate(g.latestDate),
    'Sales': Array.from(g.salesList).join(', '),
    'Jenis': g.jenisPenjualan,
    'Kode': g.kodeText,
    'Nama': g.nama,
    'Jumlah': g.totalJumlah,
    'Berat': g.totalBerat.toFixed(2),
    'Kadar': g.kadar,
    'Total Harga': g.totalHarga,
    'Transaksi': g.transactions.length
  }));
  
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Grouped Data");
  XLSX.writeFile(wb, `grouped_${new Date().toISOString().split('T')[0]}.xlsx`);
}

showGroupDetails(ids) {
  const transactions = this.salesData.filter(t => ids.split(',').includes(t.id));
  if (!transactions.length) return utils.showAlert("Data tidak ditemukan", "Error", "error");
  
  const modalHtml = `
    <div class="modal fade" id="groupModal" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5>Detail Grup Transaksi</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <table class="table table-sm">
              <thead><tr><th>Tanggal</th><th>Sales</th><th>Kode</th><th>Nama</th><th>Harga</th></tr></thead>
              <tbody>
                ${transactions.map(t => t.items?.map(item => `
                  <tr>
                    <td>${utils.formatDate(t.timestamp || t.tanggal)}</td>
                    <td>${t.sales || "Admin"}</td>
                    <td>${item.kodeText || "-"}</td>
                    <td>${item.nama || "-"}</td>
                    <td>Rp ${utils.formatRupiah(item.totalHarga || 0)}</td>
                  </tr>
                `).join('') || '').join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  
  $('#groupModal').remove();
  $('body').append(modalHtml);
  $('#groupModal').modal('show').on('hidden.bs.modal', function() { $(this).remove(); });
}

printGroupTransactions(ids) {
  const transactions = this.salesData.filter(t => ids.split(',').includes(t.id));
  if (!transactions.length) return utils.showAlert("Data tidak ditemukan", "Error", "error");
  
  const printWindow = window.open("", "_blank");
  if (!printWindow) return utils.showAlert("Popup diblokir", "Error", "error");
  
  const html = `
    <html><head><title>Grup Transaksi</title>
    <style>body{font-family:Arial;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}</style>
    </head><body>
    <h2>MELATI GOLD SHOP - Grup Transaksi</h2>
    <table><thead><tr><th>Tanggal</th><th>Sales</th><th>Kode</th><th>Nama</th><th>Harga</th></tr></thead>
    <tbody>
      ${transactions.map(t => t.items?.map(item => `
        <tr>
          <td>${utils.formatDate(t.timestamp || t.tanggal)}</td>
          <td>${t.sales || "Admin"}</td>
          <td>${item.kodeText || "-"}</td>
          <td>${item.nama || "-"}</td>
          <td>Rp ${utils.formatRupiah(item.totalHarga || 0)}</td>
        </tr>
      `).join('') || '').join('')}
    </tbody></table>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}</script>
    </body></html>`;
  
  printWindow.document.write(html);
  printWindow.document.close();
}

  // Calculate total revenue
  calculateTotalRevenue(transactions) {
    return transactions.reduce((total, transaction) => {
      if (transaction.metodeBayar === "free") return total;

      if (transaction.metodeBayar === "dp" && transaction.statusPembayaran === "DP") {
        return total + (transaction.sisaPembayaran || 0);
      }

      return total + (transaction.totalHarga || 0);
    }, 0);
  }

  // Populate sales filter dropdown
  populateSalesFilter() {
    const salesPersons = [...new Set(this.salesData.map((item) => item.sales).filter(Boolean))];
    const dropdown = document.getElementById("filterSales");

    // Clear existing options except first one
    while (dropdown.options.length > 1) {
      dropdown.remove(1);
    }

    salesPersons.forEach((person) => {
      const option = new Option(person, person);
      dropdown.add(option);
    });
  }

  // Handle reprint action
  handleReprint(transactionId) {
    this.currentTransaction = this.salesData.find((t) => t.id === transactionId);
    if (!this.currentTransaction) {
      return utils.showAlert("Transaksi tidak ditemukan", "Error", "error");
    }
    $("#printModal").modal("show");
  }

  // Handle edit action
  handleEdit(transactionId) {
    this.currentTransaction = this.salesData.find((t) => t.id === transactionId);
    if (!this.currentTransaction) {
      return utils.showAlert("Transaksi tidak ditemukan", "Error", "error");
    }
    this.showEditModal();
  }

  // Handle delete action
  handleDelete(transactionId) {
    this.currentTransaction = this.salesData.find((t) => t.id === transactionId);
    if (!this.currentTransaction) {
      return utils.showAlert("Transaksi tidak ditemukan", "Error", "error");
    }
    this.showDeleteModal();
  }

  // Show edit modal
  showEditModal() {
    const transaction = this.currentTransaction;
    const jenisPenjualan = transaction.jenisPenjualan;

    const formHtml = this.generateEditForm(transaction, jenisPenjualan);
    document.getElementById("editModalBody").innerHTML = formHtml;

    // Attach form events
    this.attachEditFormEvents(transaction);

    $("#editModal").modal("show");
  }

  // Generate edit form HTML
  generateEditForm(transaction, jenisPenjualan) {
    let formHtml = `
      <div class="mb-3">
        <label for="editSales" class="form-label">Sales:</label>
        <input type="text" class="form-control" id="editSales" value="${transaction.sales || ""}">
      </div>
    `;

    if (transaction.items && transaction.items.length > 0) {
      formHtml += `<div class="mb-3"><label class="form-label">Detail Barang:</label></div>`;

      transaction.items.forEach((item, index) => {
        formHtml += `
          <div class="border p-3 mb-3 rounded">
            <h6>Item ${index + 1}</h6>
            <div class="row">
              <div class="col-md-6">
                <label for="editNama_${index}" class="form-label">Nama Barang:</label>
                <input type="text" class="form-control" id="editNama_${index}" value="${item.nama || ""}">
              </div>
              ${
                jenisPenjualan !== "kotak"
                  ? `
                <div class="col-md-6">
                  <label for="editKadar_${index}" class="form-label">Kadar:</label>
                  <input type="text" class="form-control" id="editKadar_${index}" value="${item.kadar || ""}">
                </div>
              `
                  : ""
              }
            </div>
            ${
              jenisPenjualan !== "kotak"
                ? `
              <div class="row mt-2">
                <div class="col-md-6">
                  <label for="editBerat_${index}" class="form-label">Berat (gr):</label>
                  <input type="text" class="form-control" id="editBerat_${index}" value="${item.berat || ""}">
                </div>
                <div class="col-md-6">
                  <label for="editHarga_${index}" class="form-label">Harga:</label>
                  <input type="text" class="form-control" id="editHarga_${index}" value="${utils.formatRupiah(
                    item.totalHarga || 0
                  )}">
                </div>
              </div>
            `
                : `
              <div class="row mt-2">
                <div class="col-md-12">
                  <label for="editHarga_${index}" class="form-label">Harga:</label>
                  <input type="text" class="form-control" id="editHarga_${index}" value="${utils.formatRupiah(
                    item.totalHarga || 0
                  )}">
                </div>
              </div>
            `
            }
            ${
              jenisPenjualan === "manual"
                ? `
              <div class="row mt-2">
                <div class="col-md-12">
                  <label for="editKeterangan_${index}" class="form-label">Keterangan:</label>
                  <textarea class="form-control" id="editKeterangan_${index}" rows="2">${
                    item.keterangan || ""
                  }</textarea>
                </div>
              </div>
            `
                : ""
            }
          </div>
        `;
      });
    }

    return formHtml;
  }

  // Attach edit form events
  attachEditFormEvents(transaction) {
    if (transaction.items) {
      transaction.items.forEach((item, index) => {
        const hargaInput = document.getElementById(`editHarga_${index}`);
        if (hargaInput) {
          hargaInput.addEventListener("blur", () => {
            const value = hargaInput.value.replace(/\./g, "");
            hargaInput.value = utils.formatRupiah(parseInt(value || 0));
          });
        }
      });
    }
  }

  // Save edit transaction
  async saveEditTransaction() {
    try {
      utils.showLoading(true);

      const updateData = {
        sales: document.getElementById("editSales").value.trim(),
        lastUpdated: serverTimestamp(),
      };

      if (this.currentTransaction.items && this.currentTransaction.items.length > 0) {
        updateData.items = this.currentTransaction.items.map((item, index) => {
          const updatedItem = { ...item };

          updatedItem.nama = document.getElementById(`editNama_${index}`)?.value || item.nama;

          if (this.currentTransaction.jenisPenjualan !== "kotak") {
            updatedItem.kadar = document.getElementById(`editKadar_${index}`)?.value || item.kadar;
            updatedItem.berat = document.getElementById(`editBerat_${index}`)?.value || item.berat;
          }

          if (this.currentTransaction.jenisPenjualan === "manual") {
            updatedItem.keterangan = document.getElementById(`editKeterangan_${index}`)?.value || item.keterangan;
          }

          const hargaValue = document.getElementById(`editHarga_${index}`)?.value.replace(/\./g, "") || "0";
          updatedItem.totalHarga = parseInt(hargaValue);

          return updatedItem;
        });

        updateData.totalHarga = updateData.items.reduce((sum, item) => sum + (item.totalHarga || 0), 0);
      }

      // Update in Firestore
      await updateDoc(doc(firestore, "penjualanAksesoris", this.currentTransaction.id), updateData);

      // Update local data
      this.updateLocalData(this.currentTransaction.id, updateData);

      // Clear cache
      cacheManager.clear();

      $("#editModal").modal("hide");
      utils.showAlert("Transaksi berhasil diperbarui", "Sukses", "success");
    } catch (error) {
      console.error("Error updating transaction:", error);
      utils.showAlert("Terjadi kesalahan saat memperbarui transaksi: " + error.message, "Error", "error");
    } finally {
      utils.showLoading(false);
    }
  }

  // Update local data
  updateLocalData(transactionId, updateData) {
    // Update salesData
    const salesIndex = this.salesData.findIndex((item) => item.id === transactionId);
    if (salesIndex !== -1) {
      this.salesData[salesIndex] = { ...this.salesData[salesIndex], ...updateData };
      delete this.salesData[salesIndex].lastUpdated;
    }

    // Update filteredData
    const filteredIndex = this.filteredData.findIndex((item) => item.id === transactionId);
    if (filteredIndex !== -1) {
      this.filteredData[filteredIndex] = { ...this.filteredData[filteredIndex], ...updateData };
      delete this.filteredData[filteredIndex].lastUpdated;
    }

    // Re-render table
    this.updateDataTable();
    this.updateSummary();
  }

  // Show delete modal
  showDeleteModal() {
    const transaction = this.currentTransaction;
    const date = utils.formatDate(transaction.timestamp || transaction.tanggal);

    document.getElementById("deleteTransactionInfo").innerHTML = `
      <div class="text-start">
        <p><strong>Tanggal:</strong> ${date}</p>
        <p><strong>Sales:</strong> ${transaction.sales || "Admin"}</p>
        <p><strong>Total Harga:</strong> Rp ${utils.formatRupiah(transaction.totalHarga || 0)}</p>
      </div>
    `;

    $("#deleteModal").modal("show");
  }

  // Confirm delete transaction
  async confirmDeleteTransaction() {
    try {
      utils.showLoading(true);

      await deleteDoc(doc(firestore, "penjualanAksesoris", this.currentTransaction.id));

      // Remove from local arrays
      this.salesData = this.salesData.filter((item) => item.id !== this.currentTransaction.id);
      this.filteredData = this.filteredData.filter((item) => item.id !== this.currentTransaction.id);

      // Clear cache
      cacheManager.clear();

      this.updateDataTable();
      this.updateSummary();

      $("#deleteModal").modal("hide");
      utils.showAlert("Transaksi berhasil dihapus", "Sukses", "success");
    } catch (error) {
      console.error("Error deleting transaction:", error);
      utils.showAlert("Terjadi kesalahan saat menghapus transaksi: " + error.message, "Error", "error");
    } finally {
      utils.showLoading(false);
    }
  }

  // Print document (receipt or invoice)
  printDocument(type) {
    if (!this.currentTransaction) {
      return utils.showAlert("Tidak ada data transaksi untuk dicetak!");
    }

    const transaction = this.currentTransaction;
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      return utils.showAlert("Popup diblokir oleh browser. Mohon izinkan popup untuk mencetak.", "Error", "error");
    }

    const html = type === "receipt" ? this.generateReceiptHTML(transaction) : this.generateInvoiceHTML(transaction);

    printWindow.document.write(html);
    printWindow.document.close();
  }

  // Generate receipt HTML
  generateReceiptHTML(transaction) {
    const tanggal = utils.formatDate(transaction.timestamp || transaction.tanggal);
    let salesType = transaction.jenisPenjualan || "aksesoris";
    if (salesType === "manual") salesType = "layanan";

    let receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Struk Kasir</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 0; width: 80mm; }
          .receipt { margin: 0 auto; padding: 5mm; }
          .receipt h3, .receipt h4 { text-align: center; margin: 2mm 0; }
          .receipt hr { border-top: 1px dashed #000; }
          .receipt table { width: 100%; border-collapse: collapse; }
          .receipt th, .receipt td { text-align: left; padding: 1mm 2mm; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .keterangan { font-style: italic; font-size: 10px; margin-top: 2mm; border-top: 1px dotted #000; padding-top: 2mm; }
          .payment-info { margin-top: 2mm; border-top: 1px dotted #000; padding-top: 2mm; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h3>MELATI 3</h3>
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

    let hasKeterangan = false;
    let keteranganText = "";

    transaction.items?.forEach((item) => {
      const itemHarga = parseInt(item.totalHarga || 0);
      receiptHTML += `
        <tr>
          <td>${item.kodeText || "-"}</td>
          <td>${item.nama || "-"}</td>
          <td>${item.kadar || "-"}</td>
          <td>${item.berat || "-"}</td>
          <td class="text-right">${utils.formatRupiah(itemHarga)}</td>
        </tr>
      `;

      if (item.keterangan && item.keterangan.trim() !== "") {
        hasKeterangan = true;
        keteranganText += item.keterangan + " ";
      }
    });

    const totalHarga = parseInt(transaction.totalHarga || 0);
    receiptHTML += `
            <tr>
              <td colspan="4" class="text-right"><strong>Total:</strong></td>
              <td class="text-right"><strong>${utils.formatRupiah(totalHarga)}</strong></td>
            </tr>
          </table>
    `;

    // Add DP information if applicable
    if (transaction.metodeBayar === "dp" || transaction.statusPembayaran === "DP") {
      const dpAmount = parseInt(transaction.nominalDP || 0);
      const remainingAmount = parseInt(transaction.sisaPembayaran || 0);

      receiptHTML += `
        <div class="payment-info">
          <table>
            <tr>
              <td>Total Harga:</td>
              <td class="text-right">${utils.formatRupiah(totalHarga)}</td>
            </tr>
            <tr>
              <td>DP:</td>
              <td class="text-right">${utils.formatRupiah(dpAmount)}</td>
            </tr>
            <tr>
              <td><strong>SISA:</strong></td>
              <td class="text-right"><strong>${utils.formatRupiah(remainingAmount)}</strong></td>
            </tr>
          </table>
        </div>
      `;
    }

    if (hasKeterangan && transaction.jenisPenjualan === "manual") {
      receiptHTML += `
        <div class="keterangan">
          <strong>Keterangan:</strong> ${keteranganText.trim()}
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

    return receiptHTML;
  }

  // Generate invoice HTML
  generateInvoiceHTML(transaction) {
    const tanggal = utils.formatDate(transaction.timestamp || transaction.tanggal);

    let invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice Customer</title>
        <style>
          @page { size: 10cm 20cm; margin: 0; }
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 5mm; width: 20cm; box-sizing: border-box; }
          .invoice { width: 100%; }
          .header-info { text-align: right; margin-bottom: 2cm; margin-right: 3cm; margin-top: 1cm; }
          .total-row { margin-top: 1.9cm; text-align: right; font-weight: bold; margin-right: 3cm; }
          .sales { text-align: right; margin-top: 0.6cm; margin-right: 2cm; }
          .keterangan { font-style: italic; font-size: 10px; margin-top: 1cm; padding-top: 2mm; text-align: left; margin-left: 1cm; margin-right: 3cm; }
          .item-details { display: flex; flex-wrap: wrap; }
          .item-data { display: grid; grid-template-columns: 2cm 1.8cm 5cm 2cm 2cm 2cm; width: 100%; column-gap: 0.2cm; margin-left: 1cm; margin-top: 1.5cm; margin-right: 3cm; }
          .item-data span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header-info">
            <p>${tanggal}</p>
          </div>
          <hr>
    `;

    let hasKeterangan = false;
    let keteranganText = "";
    let totalHarga = 0;

    transaction.items?.forEach((item) => {
      const itemHarga = parseInt(item.totalHarga || 0);
      totalHarga += itemHarga;

      invoiceHTML += `
        <div class="item-details">
          <div class="item-data">
            <span>${item.kodeText || "-"}</span>
            <span>${item.jumlah || "1"}pcs</span>
            <span>${item.nama || "-"}</span>
            <span>${item.kadar || "-"}</span>
            <span>${item.berat || "-"}gr</span>
            <span>${utils.formatRupiah(itemHarga)}</span>
          </div>
        </div>
      `;

      if (item.keterangan && item.keterangan.trim() !== "") {
        hasKeterangan = true;
        keteranganText += `${item.keterangan}; `;
      }
    });

    invoiceHTML += `
        <div class="total-row">
          Rp ${utils.formatRupiah(totalHarga)}
        </div>
        <div class="sales">${transaction.sales || "-"}</div>
    `;

    if (hasKeterangan && transaction.jenisPenjualan === "manual") {
      invoiceHTML += `
        <div class="keterangan">
          <strong>Keterangan:</strong><br>
          ${keteranganText.trim()}
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

    return invoiceHTML;
  }

  // Export to Excel
  exportToExcel() {
    if (!this.filteredData.length) {
      return utils.showAlert("Tidak ada data untuk diekspor", "Info", "info");
    }

    // Prepare data for export
    const exportData = [];

    this.filteredData.forEach((transaction) => {
      const baseData = {
        Tanggal: utils.formatDate(transaction.timestamp || transaction.tanggal),
        Sales: transaction.sales || "Admin",
        Jenis: transaction.jenisPenjualan || "-",
        "Total Harga": transaction.totalHarga || 0,
        Status: transaction.statusPembayaran || "Lunas",
        "Metode Bayar": transaction.metodeBayar || "tunai",
      };

      if (transaction.items && transaction.items.length > 0) {
        transaction.items.forEach((item) => {
          exportData.push({
            ...baseData,
            "Kode Barang": item.kodeText || item.barcode || "-",
            "Nama Barang": item.nama || "-",
            Jumlah: item.jumlah || 1,
            Berat: item.berat || "-",
            Kadar: item.kadar || "-",
            "Harga Item": item.totalHarga || 0,
            Keterangan: item.keterangan || "-",
          });
        });
      } else {
        exportData.push({
          ...baseData,
          "Kode Barang": "-",
          "Nama Barang": "-",
          Jumlah: "-",
          Berat: "-",
          Kadar: "-",
          "Harga Item": transaction.totalHarga || 0,
          Keterangan: transaction.keterangan || "-",
        });
      }
    });

    // Create and download Excel file
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Penjualan");

    const fileName = `data_penjualan_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // Refresh data
  async refreshData(forceRefresh = false) {
    await this.loadSalesData(forceRefresh);
    this.populateSalesFilter();
    utils.showAlert("Data berhasil diperbarui", "Sukses", "success");
  }
}

// Initialize application when DOM is ready
$(document).ready(async function () {
  // Check if required libraries are loaded
  if (typeof XLSX === "undefined") {
    console.warn("SheetJS (XLSX) library is not loaded. Excel export will not work.");
  }

  // Initialize the application
  const app = new DataPenjualanApp();
  await app.init();

  // Auto-refresh every 5 minutes
  setInterval(() => {
    app.refreshData();
  }, 5 * 60 * 1000);

  // Clear cache on page unload to prevent memory leaks
  window.addEventListener("beforeunload", () => {
    // Only clear if cache is older than 1 hour
    const cacheAge = Date.now() - (localStorage.getItem("melati_sales_salesData_timestamp") || 0);
    if (cacheAge > 60 * 60 * 1000) {
      cacheManager.clear();
    }
  });

  console.log("Data Penjualan application initialized");
});

// Export for potential use in other modules
export default DataPenjualanApp;
